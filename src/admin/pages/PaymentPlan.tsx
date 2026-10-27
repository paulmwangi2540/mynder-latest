import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, RefreshCw } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import LoadingState from "../../components/shared/LoadingState";
import { createPlanVersion, getCurrentPlan } from "../services/planService";
import type { PaymentPlan } from "../services/planService";
import ColorfulIcon from "../components/ColorfulIcon";

const MAX_PLAN_AMOUNT = 99_999_999.99;

function formatAmount(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(amount));
}

export default function PaymentPlan() {
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentPlan()
      .then((currentPlan) => {
        if (active) {
          setPlan(currentPlan);
          setAmount(currentPlan.amount);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load the current plan.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateAmount = (value: string) => {
    setAmount(value);
    setError("");
    setSuccess("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!plan) return;

    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setError("Enter a valid amount with no more than two decimal places.");
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > MAX_PLAN_AMOUNT) {
      setError("Enter an amount greater than $0 and no more than $99,999,999.99.");
      return;
    }
    if (parsedAmount === Number(plan.amount)) {
      setError("Enter a different amount to create a new price version.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updatedPlan = await createPlanVersion({
        name: plan.name,
        amount: parsedAmount,
        currency: plan.currency,
        features: plan.features,
      });
      setPlan(updatedPlan);
      setAmount(updatedPlan.amount);
      setSuccess(`The current plan price is now ${formatAmount(updatedPlan.amount, updatedPlan.currency)}.`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to update the payment plan.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading current payment plan..." />;

  if (!plan) {
    return (
      <main className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Payment Plan</h1>
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Unable to load the current payment plan."}
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => window.location.reload()}>
          <RefreshCw size={17} /> Retry
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-7">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Payment Plan</h1>
        <p className="mt-1 text-sm text-slate-300">Review the current plan and publish a new price.</p>
      </div>

      <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-blue-50 pb-6">
          <div className="flex items-start gap-4">
            <ColorfulIcon Icon={CreditCard} tone="orange" size={25} className="h-12 w-12" />
            <div>
              <h2 className="text-lg font-bold text-myinder-navy">{plan.name}</h2>
              <p className="mt-1 text-sm text-myinder-muted">Current price</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${plan.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
            {plan.isActive ? "Active" : "Inactive"}
          </span>
          <p className="w-full text-3xl font-extrabold tracking-tight text-myinder-navy sm:w-auto">
            {formatAmount(plan.amount, plan.currency)}
            <span className="ml-2 text-sm font-semibold text-myinder-muted">({plan.currency})</span>
          </p>
        </div>

        {plan.features.length > 0 && (
          <div className="border-b border-blue-50 py-5">
            <h3 className="text-sm font-semibold text-myinder-navy">Included features</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-myinder-muted">
                  <ColorfulIcon Icon={CheckCircle2} tone="green" size={17} badge={false} className="mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={submit} className="pt-6">
          <label htmlFor="plan-amount" className="block text-sm font-semibold text-myinder-navy">
            New plan amount (USD)
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="w-full sm:max-w-xs">
              <Input
                id="plan-amount"
                type="number"
                min="0.01"
                max={MAX_PLAN_AMOUNT}
                step="0.01"
                inputMode="decimal"
                required
                value={amount}
                onChange={(event) => updateAmount(event.target.value)}
                aria-describedby="plan-amount-help"
              />
            </div>
            <Button type="submit" disabled={saving || Number(amount) === Number(plan.amount)} className="sm:self-start">
              {saving ? <LoaderCircle size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {saving ? "Publishing..." : "Publish new price"}
            </Button>
          </div>
          <p id="plan-amount-help" className="mt-2 text-xs leading-5 text-myinder-muted">
            Publishing creates a new current price version. Existing purchases keep the price they were created with.
          </p>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</p>}
        </form>
      </section>
    </main>
  );
}

import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarDays, Pencil, Plus, ReceiptText, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import { getAdmins } from "../services/adminAuthService";
import {
  createManualExpense,
  createRentPayment,
  createSalaryPayment,
  deleteManualExpense,
  deleteRentPayment,
  deleteSalaryPayment,
  getManualExpenses,
  getRentPayments,
  getSalaryPayments,
  updateManualExpense,
  updateRentPayment,
  updateSalaryPayment,
  type ManualExpense,
  type ManualExpenseInput,
  type RentPayment,
  type RentPaymentInput,
  type SalaryPayment,
  type SalaryPaymentInput,
} from "../services/expensesService";
import { isMiniAdmin, isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";

const EXPENSES_KEY = ["admin-expenses"] as const;
const RENT_KEY = ["admin-rent-payments"] as const;
const SALARY_KEY = ["admin-salary-payments"] as const;

interface ManualForm {
  category: string;
  expenseDate: string;
  amountKes: string;
  amountUsd: string;
  exchangeRate: string;
  note: string;
  adminId: string;
}

interface RentForm {
  rentPeriod: string;
  amountKes: string;
  amountUsd: string;
  exchangeRate: string;
}

interface SalaryForm {
  adminId: string;
  salaryPeriod: string;
  amountKes: string;
  amountUsd: string;
  exchangeRate: string;
}

const EMPTY_MANUAL: ManualForm = {
  category: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  amountKes: "",
  amountUsd: "",
  exchangeRate: "",
  note: "",
  adminId: "",
};

const EMPTY_RENT: RentForm = {
  rentPeriod: new Date().toISOString().slice(0, 7),
  amountKes: "",
  amountUsd: "",
  exchangeRate: "",
};

const EMPTY_SALARY: SalaryForm = {
  adminId: "",
  salaryPeriod: new Date().toISOString().slice(0, 7),
  amountKes: "",
  amountUsd: "",
  exchangeRate: "",
};

type Editing =
  | { kind: "manual"; item: ManualExpense | null }
  | { kind: "rent"; item: RentPayment | null }
  | { kind: "salary"; item: SalaryPayment | null }
  | null;

function toPositiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a number greater than zero.`);
  }
  return parsed;
}

function getUsdAmount(amountKes: number, amountUsd: string, exchangeRate: string): {
  amountUsd: number;
  exchangeRate: number;
} {
  const rate = toPositiveNumber(exchangeRate, "Exchange rate");
  return {
    amountUsd: amountUsd.trim()
      ? toPositiveNumber(amountUsd, "USD amount")
      : Number((amountKes / rate).toFixed(2)),
    exchangeRate: rate,
  };
}

function formatCurrency(value: string, currency: "KES" | "USD"): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  step,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "month" | "number";
  required?: boolean;
  step?: string;
  min?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        step={step}
        min={min}
        className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:text-sm"
      />
    </label>
  );
}

export default function Expenses() {
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const currentAdmin = useAdminAuthStore((state) => state.admin);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const miniAdmin = isMiniAdmin(currentAdmin);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);
  const [rentForm, setRentForm] = useState<RentForm>(EMPTY_RENT);
  const [salaryForm, setSalaryForm] = useState<SalaryForm>(EMPTY_SALARY);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const manualQuery = useQuery({
    queryKey: [...EXPENSES_KEY, "manual"],
    queryFn: getManualExpenses,
    staleTime: 30_000,
  });
  const rentQuery = useQuery({
    queryKey: RENT_KEY,
    queryFn: getRentPayments,
    staleTime: 30_000,
  });
  const salaryQuery = useQuery({
    queryKey: SALARY_KEY,
    queryFn: getSalaryPayments,
    staleTime: 30_000,
  });
  const adminsQuery = useQuery({
    queryKey: ["admin-directory", adminId ?? ""],
    queryFn: async () => {
      if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
      const first = await getAdmins(accessToken, 1, "");
      const admins = [...first.admins];
      for (let page = 2; page <= first.totalPages; page += 1) {
        admins.push(...(await getAdmins(accessToken, page, "")).admins);
      }
      return admins;
    },
    enabled: isSuperAdmin(currentAdmin),
    staleTime: 60_000,
  });

  function startManual(item: ManualExpense | null = null) {
    setActionError("");
    setNotice("");
    setManualForm(item ? {
      category: item.category,
      expenseDate: item.expense_date,
      amountKes: item.amount_kes,
      amountUsd: item.amount_usd,
      exchangeRate: item.exchange_rate ?? "",
      note: item.note ?? "",
      adminId: item.admin_id ?? "",
    } : { ...EMPTY_MANUAL, expenseDate: new Date().toISOString().slice(0, 10) });
    setEditing({ kind: "manual", item });
  }

  function startRent(item: RentPayment | null = null) {
    setActionError("");
    setNotice("");
    setRentForm(item ? {
      rentPeriod: item.rent_period,
      amountKes: item.amount_kes,
      amountUsd: item.amount_usd,
      exchangeRate: item.exchange_rate ?? "",
    } : { ...EMPTY_RENT, rentPeriod: new Date().toISOString().slice(0, 7) });
    setEditing({ kind: "rent", item });
  }

  function startSalary(item: SalaryPayment | null = null) {
    setActionError("");
    setNotice("");
    setSalaryForm(item ? {
      adminId: item.admin_id,
      salaryPeriod: item.salary_period,
      amountKes: item.amount_kes,
      amountUsd: item.amount_usd,
      exchangeRate: item.exchange_rate ?? "",
    } : { ...EMPTY_SALARY, salaryPeriod: new Date().toISOString().slice(0, 7) });
    setEditing({ kind: "salary", item });
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setSaving(true);
    try {
      const amountKes = toPositiveNumber(manualForm.amountKes, "KES amount");
      const conversion = getUsdAmount(amountKes, manualForm.amountUsd, manualForm.exchangeRate);
      const input: ManualExpenseInput = {
        category: manualForm.category.trim(),
        expense_date: manualForm.expenseDate,
        amount_kes: amountKes,
        amount_usd: conversion.amountUsd,
        exchange_rate: conversion.exchangeRate,
        ...(manualForm.note.trim() ? { note: manualForm.note.trim() } : {}),
        ...(manualForm.adminId ? { admin_id: manualForm.adminId } : {}),
      };
      if (!input.category || !input.expense_date) throw new Error("Category and expense date are required.");
      if (editing?.kind === "manual" && editing.item) {
        await updateManualExpense(editing.item.id, input);
        setNotice("Manual expense updated.");
      } else {
        await createManualExpense(input);
        setNotice("Manual expense recorded.");
      }
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: [...EXPENSES_KEY, "manual"] });
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to save the manual expense.");
    } finally {
      setSaving(false);
    }
  }

  async function submitRent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setSaving(true);
    try {
      if (!/^\d{4}-\d{2}$/.test(rentForm.rentPeriod)) {
        throw new Error("Rent period must be a valid month.");
      }
      const amountKes = toPositiveNumber(rentForm.amountKes, "KES amount");
      const conversion = getUsdAmount(amountKes, rentForm.amountUsd, rentForm.exchangeRate);
      const input: RentPaymentInput = {
        rent_period: rentForm.rentPeriod,
        amount_kes: amountKes,
        amount_usd: conversion.amountUsd,
        exchange_rate: conversion.exchangeRate,
      };
      if (editing?.kind === "rent" && editing.item) {
        await updateRentPayment(editing.item.id, input);
        setNotice("Rent payment updated.");
      } else {
        await createRentPayment(input);
        setNotice("Rent payment recorded.");
      }
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: RENT_KEY });
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to save the rent payment.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSalary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setSaving(true);
    try {
      if (!/^\d{4}-\d{2}$/.test(salaryForm.salaryPeriod)) {
        throw new Error("Salary period must be a valid month.");
      }
      if (!salaryForm.adminId) throw new Error("Select the staff member receiving this salary.");
      const amountKes = toPositiveNumber(salaryForm.amountKes, "KES amount");
      const conversion = getUsdAmount(amountKes, salaryForm.amountUsd, salaryForm.exchangeRate);
      const input: SalaryPaymentInput = {
        admin_id: salaryForm.adminId,
        salary_period: salaryForm.salaryPeriod,
        amount_kes: amountKes,
        amount_usd: conversion.amountUsd,
        exchange_rate: conversion.exchangeRate,
      };
      if (editing?.kind === "salary" && editing.item) {
        await updateSalaryPayment(editing.item.id, input);
        setNotice("Staff salary updated.");
      } else {
        await createSalaryPayment(input);
        setNotice("Staff salary recorded.");
      }
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: SALARY_KEY });
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to save the staff salary.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(kind: "manual" | "rent" | "salary", id: string, title: string) {
    if (!window.confirm(`Delete ${title}? This cannot be undone.`)) return;
    setActionError("");
    setNotice("");
    try {
      if (kind === "manual") {
        await deleteManualExpense(id);
        await queryClient.invalidateQueries({ queryKey: [...EXPENSES_KEY, "manual"] });
      } else if (kind === "rent") {
        await deleteRentPayment(id);
        await queryClient.invalidateQueries({ queryKey: RENT_KEY });
      } else {
        await deleteSalaryPayment(id);
        await queryClient.invalidateQueries({ queryKey: SALARY_KEY });
      }
      setNotice(`${title} deleted.`);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : `Unable to delete ${title.toLowerCase()}.`);
    }
  }

  const manualItems = manualQuery.data ?? [];
  const rentItems = rentQuery.data ?? [];
  const salaryItems = salaryQuery.data ?? [];
  const combinedError = manualQuery.error ?? rentQuery.error ?? salaryQuery.error;
  const pending = manualQuery.isPending || rentQuery.isPending || salaryQuery.isPending;
  useToastFeedback(
    actionError || combinedError?.message || adminsQuery.error?.message || "",
    notice,
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Expenses</h1>
          <p className="mt-1 text-sm text-slate-300">Manage manual expenses, rent, and staff salary payments.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            void Promise.all([
              queryClient.invalidateQueries({ queryKey: [...EXPENSES_KEY, "manual"] }),
              queryClient.invalidateQueries({ queryKey: RENT_KEY }),
              queryClient.invalidateQueries({ queryKey: SALARY_KEY }),
            ]);
          }}
          disabled={manualQuery.isFetching || rentQuery.isFetching || salaryQuery.isFetching}
        >
          <RefreshCw size={17} className={manualQuery.isFetching || rentQuery.isFetching || salaryQuery.isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </header>

      <section className="grid gap-4 xl:grid-cols-2">
        <ExpenseList
          title="Manual expenses"
          icon={<ReceiptText size={20} />}
          loading={pending}
          items={manualItems}
          onAdd={() => startManual()}
          onEdit={startManual}
          onDelete={(item) => void removeRecord("manual", item.id, item.category)}
          renderItem={(item) => (
            <>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{item.category}</p>
                <p className="mt-1 text-xs text-slate-400">{item.expense_date}{item.note ? ` · ${item.note}` : ""}</p>
                {item.admin_id && (
                  <p className="mt-1 truncate text-xs text-slate-500">
                    Staff: {adminsQuery.data?.find((person) => person.id === item.admin_id)?.name ?? item.admin_id}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-white">{formatCurrency(item.amount_kes, "KES")}</p>
                <p className="mt-1 text-xs text-slate-400">{formatCurrency(item.amount_usd, "USD")}</p>
              </div>
            </>
          )}
        />
        <ExpenseList
          title="Rent payments"
          icon={<CalendarDays size={20} />}
          loading={pending}
          items={rentItems}
          onAdd={() => startRent()}
          onEdit={startRent}
          onDelete={(item) => void removeRecord("rent", item.id, `${item.rent_period} rent payment`)}
          renderItem={(item) => (
            <>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">Rent · {item.rent_period}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {item.status}{item.paid_at ? ` · Paid ${item.paid_at}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-white">{formatCurrency(item.amount_kes, "KES")}</p>
                <p className="mt-1 text-xs text-slate-400">{formatCurrency(item.amount_usd, "USD")}</p>
              </div>
            </>
          )}
        />
        <ExpenseList
          title="Staff salaries"
          icon={<UserRound size={20} />}
          loading={pending}
          items={salaryItems}
          onAdd={() => startSalary()}
          onEdit={startSalary}
          onDelete={(item) => void removeRecord(
            "salary",
            item.id,
            `${adminsQuery.data?.find((person) => person.id === item.admin_id)?.name ?? "Staff"} salary for ${item.salary_period}`,
          )}
          renderItem={(item) => (
            <>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  {adminsQuery.data?.find((person) => person.id === item.admin_id)?.name ?? "Staff account"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {item.salary_period} · {item.status}{item.paid_at ? ` · Paid ${item.paid_at}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-white">{formatCurrency(item.amount_kes, "KES")}</p>
                <p className="mt-1 text-xs text-slate-400">{formatCurrency(item.amount_usd, "USD")}</p>
              </div>
            </>
          )}
        />
      </section>

      {editing?.kind === "manual" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="manual-expense-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 shadow-2xl sm:p-7">
            <FormHeader title={editing.item ? "Edit manual expense" : "Record manual expense"} onClose={() => setEditing(null)} />
            <form onSubmit={submitManual} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" value={manualForm.category} onChange={(category) => setManualForm((form) => ({ ...form, category }))} required />
                <Field label="Expense date" type="date" value={manualForm.expenseDate} onChange={(expenseDate) => setManualForm((form) => ({ ...form, expenseDate }))} required />
                <Field label="Amount (KES)" type="number" min="0.01" step="0.01" value={manualForm.amountKes} onChange={(amountKes) => setManualForm((form) => ({ ...form, amountKes }))} required />
                <Field label="Amount (USD, optional)" type="number" min="0.01" step="0.01" value={manualForm.amountUsd} onChange={(amountUsd) => setManualForm((form) => ({ ...form, amountUsd }))} />
                <Field label="Exchange rate (KES per USD)" type="number" min="0.000001" step="0.000001" value={manualForm.exchangeRate} onChange={(exchangeRate) => setManualForm((form) => ({ ...form, exchangeRate }))} required />
                <p className="text-xs text-slate-400 sm:col-span-2">Leave USD amount blank to calculate it from the KES amount and exchange rate.</p>
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">{miniAdmin ? "Related staff ID (optional)" : "Related staff (optional)"}</span>
                  {miniAdmin ? (
                    <input
                      type="text"
                      value={manualForm.adminId}
                      onChange={(event) => setManualForm((form) => ({ ...form, adminId: event.target.value }))}
                      className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 sm:text-sm"
                    />
                  ) : (
                    <select value={manualForm.adminId} onChange={(event) => setManualForm((form) => ({ ...form, adminId: event.target.value }))} className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 sm:text-sm">
                      <option value="">No staff assigned</option>
                      {(adminsQuery.data ?? []).filter((person) => !isSuperAdmin(person)).map((person) => (
                        <option key={person.id} value={person.id}>{person.name} · {person.email}</option>
                      ))}
                    </select>
                  )}
                </label>
                <label className="block min-w-0 sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">Note (optional)</span>
                  <textarea value={manualForm.note} onChange={(event) => setManualForm((form) => ({ ...form, note: event.target.value }))} rows={3} className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 sm:text-sm" />
                </label>
              </div>
              <FormActions saving={saving} onCancel={() => setEditing(null)} submitLabel={editing.item ? "Save changes" : "Record expense"} />
            </form>
          </section>
        </div>
      )}

      {editing?.kind === "rent" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="rent-payment-title" className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 shadow-2xl sm:p-7">
            <FormHeader title={editing.item ? "Edit rent payment" : "Record rent payment"} onClose={() => setEditing(null)} />
            <form onSubmit={submitRent} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Rent period" type="month" value={rentForm.rentPeriod} onChange={(rentPeriod) => setRentForm((form) => ({ ...form, rentPeriod }))} required />
                <Field label="Amount (KES)" type="number" min="0.01" step="0.01" value={rentForm.amountKes} onChange={(amountKes) => setRentForm((form) => ({ ...form, amountKes }))} required />
                <Field label="Amount (USD, optional)" type="number" min="0.01" step="0.01" value={rentForm.amountUsd} onChange={(amountUsd) => setRentForm((form) => ({ ...form, amountUsd }))} />
                <Field label="Exchange rate (KES per USD)" type="number" min="0.000001" step="0.000001" value={rentForm.exchangeRate} onChange={(exchangeRate) => setRentForm((form) => ({ ...form, exchangeRate }))} required />
                <p className="text-xs text-slate-400 sm:col-span-2">Leave USD amount blank to calculate it from the KES amount and exchange rate.</p>
              </div>
              <FormActions saving={saving} onCancel={() => setEditing(null)} submitLabel={editing.item ? "Save changes" : "Record rent"} />
            </form>
          </section>
        </div>
      )}

      {editing?.kind === "salary" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="salary-payment-title" className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 shadow-2xl sm:p-7">
            <FormHeader title={editing.item ? "Edit staff salary" : "Record staff salary"} onClose={() => setEditing(null)} />
            <form onSubmit={submitSalary} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block min-w-0 sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-semibold text-myinder-navy">{miniAdmin ? "Staff account ID" : "Staff member"}</span>
                  {miniAdmin ? (
                    <input
                      type="text"
                      value={salaryForm.adminId}
                      onChange={(event) => setSalaryForm((form) => ({ ...form, adminId: event.target.value }))}
                      required
                      className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 sm:text-sm"
                    />
                  ) : (
                    <select
                      value={salaryForm.adminId}
                      onChange={(event) => setSalaryForm((form) => ({ ...form, adminId: event.target.value }))}
                      required
                      className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-base text-myinder-navy outline-none focus:border-blue-300 disabled:opacity-60 sm:text-sm"
                    >
                      <option value="">Select staff member</option>
                      {(adminsQuery.data ?? []).filter((person) => !isSuperAdmin(person)).map((person) => (
                        <option key={person.id} value={person.id}>{person.name} · {person.email}</option>
                      ))}
                    </select>
                  )}
                </label>
                <Field label="Salary period" type="month" value={salaryForm.salaryPeriod} onChange={(salaryPeriod) => setSalaryForm((form) => ({ ...form, salaryPeriod }))} required />
                <Field label="Amount (KES)" type="number" min="0.01" step="0.01" value={salaryForm.amountKes} onChange={(amountKes) => setSalaryForm((form) => ({ ...form, amountKes }))} required />
                <Field label="Amount (USD, optional)" type="number" min="0.01" step="0.01" value={salaryForm.amountUsd} onChange={(amountUsd) => setSalaryForm((form) => ({ ...form, amountUsd }))} />
                <Field label="Exchange rate (KES per USD)" type="number" min="0.000001" step="0.000001" value={salaryForm.exchangeRate} onChange={(exchangeRate) => setSalaryForm((form) => ({ ...form, exchangeRate }))} required />
                <p className="text-xs text-slate-400 sm:col-span-2">Leave USD amount blank to calculate it from the KES salary and exchange rate. Only one salary payment can be recorded per staff member for each month.</p>
              </div>
              <FormActions saving={saving} onCancel={() => setEditing(null)} submitLabel={editing.item ? "Save changes" : "Record salary"} />
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function ExpenseList<T>({
  title,
  icon,
  loading,
  items,
  onAdd,
  onEdit,
  onDelete,
  renderItem,
}: {
  title: string;
  icon: ReactNode;
  loading: boolean;
  items: T[];
  onAdd: () => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0c1b2b]">
      <header className="flex items-center justify-between gap-3 border-b border-slate-700 px-5 py-4">
        <h2 className="flex items-center gap-2 font-bold text-white"><span className="text-emerald-300">{icon}</span>{title}</h2>
        <Button type="button" onClick={onAdd}><Plus size={16} /> Add</Button>
      </header>
      {loading ? (
        <LoadingState label={`Loading ${title.toLowerCase()}...`} />
      ) : items.length ? (
        <ul className="divide-y divide-slate-700">
          {items.map((item, index) => (
            <li key={index} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{renderItem(item)}</div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => onEdit(item)} aria-label={`Edit ${title.toLowerCase()} record`} className="rounded-lg p-2 text-sky-300 hover:bg-slate-800"><Pencil size={16} /></button>
                <button type="button" onClick={() => onDelete(item)} aria-label={`Delete ${title.toLowerCase()} record`} className="rounded-lg p-2 text-red-300 hover:bg-red-950/50"><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-12 text-center">
          <Banknote size={30} className="mx-auto text-slate-500" />
          <p className="mt-3 text-sm text-slate-400">No {title.toLowerCase()} recorded yet.</p>
        </div>
      )}
    </section>
  );
}

function FormHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const titleId = title.toLowerCase().includes("rent")
    ? "rent-payment-title"
    : title.toLowerCase().includes("salary")
      ? "salary-payment-title"
      : "manual-expense-title";
  return (
    <header className="mb-5 flex items-center justify-between gap-3">
      <h2 id={titleId} className="text-xl font-bold text-white">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={19} /></button>
    </header>
  );
}

function FormActions({
  saving,
  onCancel,
  submitLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-700 pt-4">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" disabled={saving}>{saving ? "Saving..." : submitLabel}</Button>
    </div>
  );
}

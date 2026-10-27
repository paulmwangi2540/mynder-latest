import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Logo from "../../components/shared/Logo";
import { isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";

interface LocationState {
  from?: string;
}

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const expiresAt = useAdminAuthStore((state) => state.expiresAt);
  const admin = useAdminAuthStore((state) => state.admin);
  const signIn = useAdminAuthStore((state) => state.signIn);
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as LocationState | null)?.from;

  if (accessToken && expiresAt !== null && expiresAt > Date.now()) {
    return <Navigate to={from ?? (isSuperAdmin(admin) ? "/admin/dashboard" : "/admin/users")} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(email, password);
      const signedInAdmin = useAdminAuthStore.getState().admin;
      navigate(from ?? (isSuperAdmin(signedInAdmin) ? "/admin/dashboard" : "/admin/users"), { replace: true });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-theme flex min-h-screen items-center justify-center bg-[#0b1828] px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex justify-center">
          <Logo admin />
        </div>
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-myinder-blue">
            <LockKeyhole size={22} />
          </div>
          <h1 className="text-2xl font-bold text-myinder-navy">Admin sign in</h1>
          <p className="mt-2 text-sm text-myinder-muted">
            Sign in to manage the mylnder dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="admin-email" className="mb-2 block text-sm font-semibold text-myinder-navy">
              Email address
            </label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="mb-2 block text-sm font-semibold text-myinder-navy">
              Password
            </label>
            <div className="relative">
              <Input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-2 flex items-center justify-center rounded-lg px-2 text-myinder-muted transition hover:bg-blue-50 hover:text-myinder-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="w-full py-3">
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}

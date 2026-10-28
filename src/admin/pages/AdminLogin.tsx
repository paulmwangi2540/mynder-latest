import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Eye,
  EyeOff,
  GraduationCap,
  House,
  LockKeyhole,
  Mail,
  MessageCircle,
  UsersRound,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Logo from "../../components/shared/Logo";
import { isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";
import useToastFeedback from "../../hooks/useToastFeedback";

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
  useToastFeedback(error);

  if (accessToken && expiresAt !== null && expiresAt > Date.now()) {
    return <Navigate to={from ?? (isSuperAdmin(admin) ? "/admin/dashboard" : "/staff/attendance")} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(email, password);
      const signedInAdmin = useAdminAuthStore.getState().admin;
      navigate(from ?? (isSuperAdmin(signedInAdmin) ? "/admin/dashboard" : "/staff/attendance"), { replace: true });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-theme admin-login-scene group relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
      <div className="admin-login-orbit admin-login-orbit-one" aria-hidden="true" />
      <div className="admin-login-orbit admin-login-orbit-two" aria-hidden="true" />
      <div className="admin-login-orbit admin-login-orbit-three" aria-hidden="true" />
      <div className="admin-login-decoration admin-login-decoration-top" aria-hidden="true">
        <span className="admin-login-icon admin-login-icon-grad"><GraduationCap /></span>
        <span className="admin-login-icon admin-login-icon-users"><UsersRound /></span>
        <span className="admin-login-icon admin-login-icon-calendar"><CalendarDays /></span>
        <span className="admin-login-icon admin-login-icon-chat"><MessageCircle /></span>
        <span className="admin-login-icon admin-login-icon-home"><House /></span>
        <span className="admin-login-icon admin-login-icon-mark"><img src="/mylnder-logo.png" alt="" /></span>
        <i className="admin-login-particle admin-login-particle-one" />
        <i className="admin-login-particle admin-login-particle-two" />
        <i className="admin-login-particle admin-login-particle-three" />
      </div>
      <section className="admin-login-card relative z-10 w-full max-w-[440px] rounded-[26px] p-6 sm:p-9">
        <div className="mb-6 flex justify-center sm:mb-7">
          <Logo />
        </div>
        <div className="mb-6 text-center sm:mb-7">
          <div className="admin-login-lock mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <LockKeyhole size={22} />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin sign in</h1>
          <p className="mt-2 text-sm text-slate-300">
            Sign in to manage the mylnder dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form space-y-5">
          <div>
            <label htmlFor="admin-email" className="mb-2 block text-sm font-semibold text-slate-100">
              Email address
            </label>
            <div className="relative">
              <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-sky-300" />
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                className="admin-login-input pl-11"
              />
            </div>
          </div>
          <div>
            <label htmlFor="admin-password" className="mb-2 block text-sm font-semibold text-slate-100">
              Password
            </label>
            <div className="relative">
              <LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-sky-300" />
              <Input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="admin-login-input pl-11 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="admin-login-password-toggle absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={submitting} className="admin-login-submit w-full py-3">
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}

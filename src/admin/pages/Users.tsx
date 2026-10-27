import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { University, GraduationCap, Instagram } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SavedUser } from "../types/admin.types";
import { useUsers } from "../hooks/useUsers";
import { isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";
import { getAdminPaymentStatuses, getInvoices, type UserInvoice } from "../services/invoicesService";
import LoadingState from "../../components/shared/LoadingState";
import UserDetailsModal from "../components/UserDetailsModal";
import Pagination from "../components/Pagination";
import ColorfulIcon from "../components/ColorfulIcon";
import ResolvedImage from "../components/ResolvedImage";

type Context = { search: string; university: string };
type PaymentFilter = "all" | "paid" | "unpaid";
type PostingFilter = "all" | "waiting" | "posted";

async function getUserPaymentStatuses(): Promise<Map<string, UserInvoice["status"]>> {
  const [invoices, paymentStatuses] = await Promise.all([
    getInvoices(),
    getAdminPaymentStatuses(),
  ]);
  const statuses = new Map<string, UserInvoice["status"]>();

  for (const invoice of invoices) {
    if (!invoice.userId) continue;
    const linkedPaymentStatus = invoice.paymentId
      ? paymentStatuses.get(invoice.paymentId)
      : undefined;
    const status =
      linkedPaymentStatus && linkedPaymentStatus !== "unknown"
        ? linkedPaymentStatus
        : invoice.status;
    const current = statuses.get(invoice.userId);
    if (status === "successful" || !current || current === "unknown") {
      statuses.set(invoice.userId, status);
    }
  }

  return statuses;
}

export default function Users() {
  const { search, university } = useOutletContext<Context>();
  const { users, hasData, loading, error } = useUsers();
  const admin = useAdminAuthStore((state) => state.admin);
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const superAdmin = isSuperAdmin(admin);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const paymentQuery = useQuery({
    queryKey: ["admin-user-data", adminId ?? "", "payment-statuses"],
    queryFn: getUserPaymentStatuses,
    enabled: Boolean(adminId && accessToken && superAdmin),
    staleTime: 60_000,
  });
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<SavedUser | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [postingFilter, setPostingFilter] = useState<PostingFilter>("waiting");
  const pageSize = 12;

  useEffect(() => {
    setPage(1);
  }, [search, university, paymentFilter, postingFilter]);

  const matchingUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const searchableText = [
        user.name,
        user.university,
        user.major,
        user.instagram,
        user.bio ?? "",
        user.song ?? "",
        ...(superAdmin ? [user.invoiceNumber ?? ""] : []),
      ].join(" ").toLowerCase();
      const matchesSearch = !term || searchableText.includes(term);
      const matchesUniversity = !university || user.university === university;
      return matchesSearch && matchesUniversity;
    });
  }, [users, search, university, superAdmin]);

  const paymentStatuses = paymentQuery.data;
  const paidCount = matchingUsers.filter(
    (user) => paymentStatuses?.get(user.id) === "successful",
  ).length;
  const unpaidCount = paymentStatuses
    ? matchingUsers.length - paidCount
    : 0;
  const paymentFilterOptions = [
    ["all", "All users"],
    ["paid", `Successful (${paidCount})`],
    ["unpaid", `Unpaid (${unpaidCount})`],
  ] as const;
  const postingFilterOptions = [
    ["waiting", `Waiting to post (${matchingUsers.filter((user) => !user.isPosted).length})`],
    ["posted", `Successfully posted (${matchingUsers.filter((user) => user.isPosted).length})`],
    ["all", "All posting statuses"],
  ] as const;
  const filtered = matchingUsers.filter((user) => {
    const matchesPayment =
      !superAdmin ||
      paymentFilter === "all" ||
      (paymentFilter === "paid"
        ? paymentStatuses?.get(user.id) === "successful"
        : Boolean(paymentStatuses) &&
          paymentStatuses?.get(user.id) !== "successful");
    const matchesPosting =
      postingFilter === "all" ||
      (postingFilter === "posted" ? user.isPosted : !user.isPosted);
    return matchesPayment && matchesPosting;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleUsers = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) return <LoadingState label="Loading saved users..." />;
  if (error && !hasData) return <p className="py-10 text-center text-red-600">{error}</p>;

  return (
    <>
      <main>
        {error && <p role="alert" className="mb-4 text-sm text-amber-700">Showing cached users; refresh failed: {error}</p>}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-[34px]">Saved Users</h1>
            <p className="mt-0.5 text-sm text-slate-300 sm:text-base">View all user data submitted through the campus community form.</p>
          </div>
          <p className="pb-1 text-sm font-medium text-slate-300">Total Users: {users.length}</p>
        </div>

        <section className="mb-5 flex flex-wrap gap-x-8 gap-y-4 rounded-xl border border-blue-100 bg-white p-4">
          {superAdmin && (
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-myinder-muted">Payment</h2>
              <label className="sr-only" htmlFor="user-payment-filter">Filter users by payment</label>
              <select
                id="user-payment-filter"
                value={paymentFilter}
                onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}
                className="w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-base font-semibold text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 disabled:cursor-wait disabled:opacity-50 sm:hidden"
              >
                {paymentFilterOptions.map(([value, label]) => (
                  <option key={value} value={value} disabled={value !== "all" && !paymentStatuses}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="hidden flex-wrap gap-2 sm:flex">
                {paymentFilterOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentFilter(value)}
                    disabled={value !== "all" && !paymentStatuses}
                    aria-pressed={paymentFilter === value}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50 ${
                      paymentFilter === value
                        ? "bg-myinder-blue text-white"
                        : "bg-blue-50 text-myinder-navy hover:bg-blue-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-myinder-muted">Posting</h2>
            <label className="sr-only" htmlFor="user-posting-filter">Filter users by posting status</label>
            <select
              id="user-posting-filter"
              value={postingFilter}
              onChange={(event) => setPostingFilter(event.target.value as PostingFilter)}
              className="w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-base font-semibold text-myinder-navy outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 sm:hidden"
            >
              {postingFilterOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <div className="hidden flex-wrap gap-2 sm:flex">
              {postingFilterOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPostingFilter(value)}
                  aria-pressed={postingFilter === value}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    postingFilter === value
                      ? "bg-myinder-blue text-white"
                      : "bg-blue-50 text-myinder-navy hover:bg-blue-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
        {superAdmin && paymentQuery.isError && (
          <p role="alert" className="mb-4 text-sm text-amber-700">
            Unable to load payment statuses; payment filters are unavailable.
            {paymentQuery.error instanceof Error ? ` ${paymentQuery.error.message}` : ""}
          </p>
        )}

        {visibleUsers.length ? <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 2xl:grid-cols-4">
          {visibleUsers.map((user) => (
            <button key={user.id} type="button" onClick={() => setSelectedUser(user)} className="min-w-0 rounded-xl border border-blue-100 bg-white p-4 text-left shadow-[0_1px_3px_rgba(40,90,150,0.025)] transition hover:border-blue-300 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <div className="min-w-0">
                <h2 className="truncate pl-1 text-sm font-bold text-myinder-navy">{user.name}</h2>
                <p className="mt-2 flex min-w-0 items-center gap-2.5 text-xs text-myinder-muted sm:text-[13px]"><ColorfulIcon Icon={University} tone="orange" size={17} badge={false}/><span className="truncate">{user.university}</span></p>
                <p className="mt-2 flex min-w-0 items-center gap-2.5 text-xs text-myinder-muted sm:text-[13px]"><ColorfulIcon Icon={GraduationCap} tone="purple" size={17} badge={false}/><span className="truncate">{user.major}</span></p>
                <p className="mt-2 flex min-w-0 items-center gap-2.5 text-xs text-myinder-muted sm:text-[13px]"><ColorfulIcon Icon={Instagram} tone="pink" size={17} badge={false}/><span className="truncate">{user.instagram}</span></p>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {user.images.slice(0, 3).map((image, index) => (
                  <ResolvedImage
                    key={`${image}-${index}`}
                    src={image}
                    alt=""
                    className="h-[64px] w-full rounded-md bg-blue-50"
                    imageClassName="h-full w-full object-cover"
                  />
                ))}
                <div className="flex h-[64px] items-center justify-center rounded-md bg-blue-50 text-xs font-semibold text-myinder-blue">+{Math.max(0, user.images.length - 3)}</div>
              </div>
            </button>
          ))}
        </div> : <div className="rounded-xl border border-dashed border-blue-200 bg-white py-16 text-center text-sm text-slate-500">No users match your search.</div>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-myinder-muted">Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} users</p>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setPage}/>
        </div>
      </main>
      <UserDetailsModal user={selectedUser} onClose={() => setSelectedUser(null)}/>
    </>
  );
}
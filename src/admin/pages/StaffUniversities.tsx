import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, RefreshCw, University as UniversityIcon, X } from "lucide-react";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/shared/LoadingState";
import Modal from "../../components/ui/Modal";
import type { UniversityRecord } from "../services/universitiesService";
import { getUniversities } from "../services/universitiesService";
import { useAdminAuthStore } from "../stores/adminAuthStore";

export default function StaffUniversities() {
  const admin = useAdminAuthStore((state) => state.admin);
  const [selectedUniversity, setSelectedUniversity] = useState<UniversityRecord | null>(null);
  const assignedIds = useMemo(
    () => new Set([
      ...(admin?.schoolIds ?? []),
      ...(admin?.schools ?? []).map((school) => school.id),
    ]),
    [admin?.schoolIds, admin?.schools],
  );
  const universitiesQuery = useQuery({
    queryKey: ["staff-assigned-universities", admin?.id ?? "", [...assignedIds].sort().join(",")],
    queryFn: getUniversities,
    enabled: Boolean(admin?.id),
    staleTime: 60_000,
  });
  const universities = (universitiesQuery.data ?? []).filter((university) =>
    assignedIds.has(university.id),
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-700 bg-[#0c1b2b] p-4 sm:p-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-300">
            <UniversityIcon size={17} /> Staff workspace
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">My universities</h1>
          <p className="mt-2 text-sm text-slate-300">
            University details for locations assigned to your staff account.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={universitiesQuery.isFetching}
          onClick={() => void universitiesQuery.refetch()}
        >
          <RefreshCw size={16} className={universitiesQuery.isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </header>

      {universitiesQuery.isPending ? (
        <LoadingState label="Loading your universities..." />
      ) : universitiesQuery.isError ? (
        <section className="rounded-2xl border border-rose-900 bg-rose-950/30 p-5 text-sm text-rose-200">
          <p role="alert">Unable to load your assigned universities: {universitiesQuery.error.message}</p>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => void universitiesQuery.refetch()}>
            Try again
          </Button>
        </section>
      ) : universities.length === 0 ? (
        <section className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-8 text-center">
          <UniversityIcon size={32} className="mx-auto text-slate-400" />
          <p className="mt-3 font-semibold text-white">No assigned universities</p>
          <p className="mt-1 text-sm text-slate-400">Ask a super admin to assign universities to your staff account.</p>
        </section>
      ) : (
        <section aria-label="Assigned universities" className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0c1b2b]">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">University</th>
                  <th scope="col" className="px-4 py-3">Slug</th>
                  <th scope="col" className="px-4 py-3">Profile name</th>
                  <th scope="col" className="px-4 py-3">Template</th>
                  <th scope="col" className="px-4 py-3">Custom color</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 text-slate-200">
                {universities.map((university) => (
                  <tr key={university.id} className="hover:bg-slate-800/40">
                    <th scope="row" className="px-4 py-4 font-semibold text-white">{university.name}</th>
                    <td className="px-4 py-4">{university.slug || "Not set"}</td>
                    <td className="px-4 py-4">{university.profileName || "Not set"}</td>
                    <td className="px-4 py-4">{university.template || "Not specified"}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-2">
                        {university.customColor && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(university.customColor) && (
                          <span
                            aria-hidden="true"
                            className="h-4 w-4 rounded border border-slate-500"
                            style={{ backgroundColor: university.customColor }}
                          />
                        )}
                        {university.customColor || "Not set"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-slate-700 sm:hidden">
            {universities.map((university) => (
              <li key={university.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-sky-300">
                    <UniversityIcon size={20} />
                  </span>
                  <p className="min-w-0 break-words text-sm font-semibold text-white">{university.name}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedUniversity(university)}
                  aria-label={`View ${university.name} details`}
                  className="min-h-10 shrink-0 px-3"
                >
                  <Eye size={16} /> View
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedUniversity && (
        <Modal>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-university-details-title"
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#0c1b2b] p-5 shadow-2xl sm:p-6"
          >
            <header className="mb-5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-sky-300">
                  <UniversityIcon size={20} />
                </span>
                <h2 id="staff-university-details-title" className="break-words text-lg font-bold text-white">
                  {selectedUniversity.name}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close university details"
                onClick={() => setSelectedUniversity(null)}
                className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </header>
            <dl className="space-y-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Slug</dt>
                <dd className="max-w-[65%] break-all text-right text-slate-200">{selectedUniversity.slug || "Not set"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Profile name</dt>
                <dd className="max-w-[65%] break-all text-right text-slate-200">{selectedUniversity.profileName || "Not set"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Template</dt>
                <dd className="max-w-[65%] break-words text-right text-slate-200">{selectedUniversity.template || "Not specified"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-400">Custom color</dt>
                <dd className="flex max-w-[65%] items-center gap-2 break-all text-right text-slate-200">
                  {selectedUniversity.customColor && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(selectedUniversity.customColor) && (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 rounded border border-slate-500"
                      style={{ backgroundColor: selectedUniversity.customColor }}
                    />
                  )}
                  {selectedUniversity.customColor || "Not set"}
                </dd>
              </div>
            </dl>
          </section>
        </Modal>
      )}
    </main>
  );
}

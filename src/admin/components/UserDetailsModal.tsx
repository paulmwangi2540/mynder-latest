import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Instagram, University, GraduationCap, X, LoaderCircle, Music2, ChevronLeft, ChevronRight, Eye, ImagePlus, RefreshCw, Check } from "lucide-react";
import JSZip from "jszip";
import type { SavedUser } from "../types/admin.types";
import ColorfulIcon from "./ColorfulIcon";
import ResolvedImage from "./ResolvedImage";
import { resolveImageUrl } from "../services/imageService";
import InvoicePanel from "./InvoicePanel";
import { isSuperAdmin, useAdminAuthStore } from "../stores/adminAuthStore";
import { getUniversities } from "../services/universitiesService";
import {
  generateAdminUserPoster,
  getPosterColor,
  type PosterProgress,
} from "../services/posterService";
import { getInvoices } from "../services/invoicesService";
import { updatePostingStatus } from "../services/postingStatus service";
import { userQueryKeys } from "../queries/userQueryKeys";


export default function UserDetailsModal({ user, onClose }: { user: SavedUser | null; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [posterUrl, setPosterUrl] = useState("");
  const [selectedPosterPhotoUrl, setSelectedPosterPhotoUrl] = useState("");
  const [posterLoading, setPosterLoading] = useState(false);
  const [posterProgress, setPosterProgress] = useState<PosterProgress | null>(null);
  const [posterError, setPosterError] = useState("");
  const [posterWarning, setPosterWarning] = useState("");
  const posterUrlRef = useRef<string | null>(null);
  const posterGenerationRef = useRef(0);
  const [invoiceNumber, setInvoiceNumber] = useState(
  user?.invoiceNumber ?? "",);
const [invoiceLoading, setInvoiceLoading] = useState(false);
const [invoiceError, setInvoiceError] = useState("");
const [isPosted, setIsPosted] = useState(false);
const [postingStatusLoading, setPostingStatusLoading] = useState(false);
const [postingStatusError, setPostingStatusError] = useState("");
const adminId = useAdminAuthStore((state) => state.admin?.id);
const superAdmin = isSuperAdmin(useAdminAuthStore((state) => state.admin));
const queryClient = useQueryClient();

const handlePostingStatusChange = async () => {
  if (postingStatusLoading || !user) return;

  setPostingStatusLoading(true);
  setPostingStatusError("");

  try {
    const result = await updatePostingStatus(user.id, !isPosted);
    setIsPosted(result.is_posted);
    if (adminId) {
      queryClient.setQueryData<SavedUser[]>(
        userQueryKeys.users(adminId),
        (cachedUsers) =>
          cachedUsers?.map((cachedUser) =>
            cachedUser.id === user.id
              ? { ...cachedUser, isPosted: result.is_posted }
              : cachedUser,
          ),
      );
      queryClient.setQueryData<SavedUser | undefined>(
        userQueryKeys.user(adminId, user.id),
        (cachedUser) =>
          cachedUser
            ? { ...cachedUser, isPosted: result.is_posted }
            : cachedUser,
      );
    }
  } catch (error) {
    setPostingStatusError(
      error instanceof Error
        ? error.message
        : "Failed to update posting status.",
    );
  } finally {
    setPostingStatusLoading(false);
  }
};
 
useEffect(() => {
  setIsPosted(user?.isPosted ?? false);
  setPostingStatusError("");
}, [user?.id, user?.isPosted]);

useEffect(() => {
  let cancelled = false;

  setInvoiceNumber(user?.invoiceNumber ?? "");
  setInvoiceError("");

  if (!user) {
    setInvoiceLoading(false);
    return;
  }
  if (!superAdmin) {
    setInvoiceNumber(user.invoiceNumber ?? "");
    setInvoiceLoading(false);
    return;
  }

  // Capture the non-null user for the async function.
  const selectedUser = user;

  async function loadInvoiceNumber() {
    setInvoiceLoading(true);

    try {
      const invoices = await getInvoices();

      const matchingInvoice = invoices.find(
        (invoice) => invoice.userId === selectedUser.id,
      );

      if (!cancelled) {
        setInvoiceNumber(
          matchingInvoice?.invoiceNumber ??
            selectedUser.invoiceNumber ??
            "",
        );
      }
    } catch (error: unknown) {
      if (!cancelled) {
        setInvoiceError(
          error instanceof Error
            ? error.message
            : "Unable to load the invoice number.",
        );
      }
    } finally {
      if (!cancelled) {
        setInvoiceLoading(false);
      }
    }
  }

  void loadInvoiceNumber();

  return () => {
    cancelled = true;
  };
}, [user?.id, user?.invoiceNumber, superAdmin]);

  useEffect(() => {
    if (!user) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (previewIndex !== null) setPreviewIndex(null);
        else onClose();
      } else if (previewIndex !== null && event.key === "ArrowRight") {
        setPreviewIndex((index) => index === null ? null : (index + 1) % user.images.length);
      } else if (previewIndex !== null && event.key === "ArrowLeft") {
        setPreviewIndex((index) => index === null ? null : (index - 1 + user.images.length) % user.images.length);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [user, onClose, previewIndex]);

 

  useEffect(() => {
    setError("");
    setPreviewIndex(null);
    setPosterUrl("");
    setSelectedPosterPhotoUrl(user?.posterPhotoUrl ?? user?.images[0] ?? "");
    setPosterError("");
    setPosterWarning("");
    setPosterLoading(false);
    setPosterProgress(null);
    if (posterUrlRef.current) {
      URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = null;
    }

    return () => {
      posterGenerationRef.current += 1;
      if (posterUrlRef.current) {
        URL.revokeObjectURL(posterUrlRef.current);
        posterUrlRef.current = null;
      }
    };
  }, [user?.id]);
   if (!user) return null;

  const posterPhotos = Array.from(
    new Set([...(user.posterPhotoUrl ? [user.posterPhotoUrl] : []), ...user.images]),
  );

  const saveImage = async (url: string, index: number) => {
    try {
      setError("");
      const imageUrl = await resolveImageUrl(url);
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${user.name.replace(/\s+/g, "-")}-image-${index + 1}.${blob.type.split("/")[1]?.split(";")[0] || "jpg"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError("Unable to download this image.");
    }
  };

  const saveAll = async () => {
    if (!user.images.length) return;
    setDownloading(true);
    setError("");
    try {
      const zip = new JSZip();
      const folder = zip.folder(user.name.replace(/[^a-z0-9]/gi, "-") || "user-images");
      if (!folder) throw new Error("Unable to create ZIP");
      await Promise.all(user.images.map(async (url, index) => {
        const imageUrl = await resolveImageUrl(url);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error("Image request failed");
        const blob = await response.blob();
        const extension = blob.type.split("/")[1]?.split(";")[0] || "jpg";
        folder.file(`image-${index + 1}.${extension}`, blob);
      }));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const objectUrl = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${user.name.replace(/\s+/g, "-")}-images.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError("Could not download every image.");
    } finally {
      setDownloading(false);
    }
  };

  const generatePoster = async () => {
    if (!user || posterLoading) return;

    const generation = ++posterGenerationRef.current;
    setPosterError("");
    setPosterWarning("");
    setPosterLoading(true);
    setPosterProgress("loading-photo");

    try {
      const auth = useAdminAuthStore.getState();
      if (!auth.accessToken || !auth.expiresAt || auth.expiresAt <= Date.now()) {
        throw new Error("Your admin session expired. Sign in again before generating a poster.");
      }

      const universities = await getUniversities();
      const university = user.universityId
        ? universities.find((record) => record.id === user.universityId)
        : universities.find(
            (record) => record.name.trim().toLocaleLowerCase() === user.university.trim().toLocaleLowerCase(),
          );

      if (!university) {
        throw new Error(
          user.universityId
            ? "The user's university record could not be found. Check the school ID in the users API."
            : "The user's university could not be matched to a university record.",
        );
      }

      const color = getPosterColor(university);
      if (color.usedFallback) {
        setPosterWarning(
          `${university.name} has no valid configured brand color; the Myinder orange fallback is being used.`,
        );
      }

      const poster = await generateAdminUserPoster(university, selectedPosterPhotoUrl, (progress) => {
        if (generation === posterGenerationRef.current) setPosterProgress(progress);
      });
      const nextUrl = URL.createObjectURL(poster);
      if (generation !== posterGenerationRef.current) {
        URL.revokeObjectURL(nextUrl);
        return;
      }

      if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = nextUrl;
      setPosterUrl(nextUrl);
    } catch (cause: unknown) {
      if (generation === posterGenerationRef.current) {
        setPosterError(cause instanceof Error ? cause.message : "Unable to generate the profile poster.");
      }
    } finally {
      if (generation === posterGenerationRef.current) {
        setPosterLoading(false);
        setPosterProgress(null);
      }
    }
  };

  const posterFilename = `myinder-${user.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "user"}-poster.png`;

  return (
    <div className="safe-area-padding fixed inset-0 z-50 flex items-center justify-center bg-slate-800/50 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="modal-user-name" className="user-details-modal mobile-dialog-height relative flex w-full min-w-0 max-w-[805px] flex-col overflow-hidden rounded-xl border border-blue-100 bg-white shadow-2xl">
        <button onClick={onClose} aria-label="Close user details" className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-myinder-blue transition hover:bg-blue-50"><X size={24}/></button>
        <div className="flex shrink-0 items-center gap-5 border-b border-blue-100 px-6 py-7 pr-14 sm:px-8">
          <ColorfulIcon Icon={University} tone="orange" size={40} className="h-20 w-20 rounded-full" />
          <div className="min-w-0">
            <h2 id="modal-user-name" className="text-xl font-extrabold text-myinder-navy sm:text-2xl">{user.name}</h2>
            <p className="mt-2 flex items-center gap-3 text-sm text-myinder-muted sm:text-base"><ColorfulIcon Icon={University} tone="orange" size={20} badge={false}/>{user.university}</p>
            <p className="mt-2 flex items-center gap-3 text-sm text-myinder-muted sm:text-base"><ColorfulIcon Icon={GraduationCap} tone="purple" size={21} badge={false}/>{user.major}</p>
            <p className="mt-2 flex items-center gap-3 text-sm text-myinder-muted sm:text-base"><ColorfulIcon Icon={Instagram} tone="pink" size={21} badge={false}/>{user.instagram}</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-5 sm:px-8">
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg bg-blue-50/70 p-4">
              <h3 className="text-sm font-bold text-myinder-navy">Bio</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-myinder-muted">{user.bio || "No bio provided."}</p>
            </section>
            <section className="rounded-lg bg-blue-50/70 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-myinder-navy"><ColorfulIcon Icon={Music2} tone="sky" size={17} badge={false}/>Song</h3>
              <p className="mt-2 text-sm text-myinder-muted">{user.song || "No song selected."}</p>
            </section>
          </div>
          <div>
             <section className="mt-5 rounded-lg border border-blue-100 bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 className="text-sm font-bold text-myinder-navy">
        Posting Status
      </h3>
      <p className="mt-1 text-xs text-myinder-muted">
        Update whether this user's post has been published.
      </p>
    </div>

    <button
      type="button"
      onClick={handlePostingStatusChange}
      disabled={postingStatusLoading}
      className={`rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
        isPosted
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-amber-100 text-amber-800 hover:bg-amber-200"
      }`}
    >
      {postingStatusLoading
        ? "Updating..."
        : isPosted
          ? "Posted"
          : "Pending"}
    </button>
  </div>

  {postingStatusError && (
    <p role="alert" className="mt-3 text-sm text-red-600">
      {postingStatusError}
    </p>
  )}
</section>
  <InvoicePanel invoiceNumber={invoiceNumber} loadDetails={superAdmin} />

  {superAdmin && invoiceLoading && (
    <p className="mt-2 text-sm text-slate-500">
      Loading invoice number...
    </p>
  )}

  {superAdmin && invoiceError && (
    <p role="alert" className="mt-2 text-sm text-red-600">
      {invoiceError}
    </p>
  )}
</div>
          {superAdmin && <section className="mb-6 rounded-lg border border-blue-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-myinder-navy">
                  <ImagePlus size={18} className="text-myinder-orange" />
                  Profile poster
                </h3>
                <p className="mt-1 text-xs text-myinder-muted">
                  Choose any photo. The original image stays clear; only the frame and Instagram icon use the university color.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void generatePoster()}
                disabled={posterLoading || !selectedPosterPhotoUrl}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-myinder-orange px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              >
                {posterLoading ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : posterUrl ? (
                  <RefreshCw size={17} />
                ) : (
                  <ImagePlus size={18} />
                )}
                {posterLoading
                  ? posterProgress === "drawing-poster"
                    ? "Finishing poster..."
                    : "Loading photo..."
                  : posterUrl
                    ? "Regenerate poster"
                    : "Generate profile poster"}
              </button>
            </div>
            {posterPhotos.length === 0 && (
              <p className="mt-3 text-sm text-amber-800">
                Poster unavailable: this user has no photos to use.
              </p>
            )}
            {posterPhotos.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-myinder-muted">Select a photo for the poster</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {posterPhotos.map((url, index) => {
                    const selected = selectedPosterPhotoUrl === url;
                    return (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        aria-label={`Use photo ${index + 1} for poster`}
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedPosterPhotoUrl(url);
                          setPosterUrl("");
                          setPosterError("");
                          setPosterWarning("");
                          if (posterUrlRef.current) {
                            URL.revokeObjectURL(posterUrlRef.current);
                            posterUrlRef.current = null;
                          }
                        }}
                        disabled={posterLoading}
                        className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                          selected ? "border-myinder-orange ring-2 ring-orange-100" : "border-transparent hover:border-blue-200"
                        } disabled:cursor-not-allowed`}
                      >
                        <ResolvedImage
                          src={url}
                          alt=""
                          className="h-full w-full"
                          imageClassName="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Photo {index + 1}
                        </span>
                        {selected && (
                          <span className="absolute right-1 top-1 rounded-full bg-myinder-orange p-1 text-white">
                            <Check size={12} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {posterWarning && (
              <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {posterWarning}
              </p>
            )}
            {posterError && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {posterError}
              </p>
            )}
            {posterUrl && (
              <div className="mt-4 border-t border-blue-50 pt-4">
                <img
                  src={posterUrl}
                  alt={`${user.name} profile poster preview`}
                  className="mx-auto max-h-[560px] w-auto rounded-lg bg-slate-100 object-contain shadow-sm"
                />
                <div className="mt-4 flex justify-center">
                  <a
                    href={posterUrl}
                    download={posterFilename}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-myinder-blue transition hover:bg-blue-50"
                  >
                    <Download size={17} /> Download PNG
                  </a>
                </div>
              </div>
            )}
          </section>}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-myinder-navy">User Photos</h3>
            <button onClick={saveAll} disabled={downloading || user.images.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-myinder-orange px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-60 sm:text-sm">
              {downloading ? <LoaderCircle size={18} className="animate-spin"/> : <Download size={19}/>}
              {downloading ? "Preparing ZIP..." : `Download All Images (${user.images.length})`}
            </button>
          </div>
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {user.images.length ? (
            <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 md:grid-cols-3">
              {user.images.map((url, index) => (
                <article key={`${url}-${index}`} className="group relative aspect-[1.08/1] overflow-hidden rounded-lg bg-blue-50">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    aria-label={`Preview photo ${index + 1}`}
                    className="h-full w-full cursor-zoom-in"
                  >
                    <ResolvedImage
                      src={url}
                      alt={`${user.name} photo ${index + 1}`}
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition group-hover:bg-slate-900/30 group-hover:opacity-100">
                      <span className="flex items-center gap-2 rounded-full bg-slate-900/65 px-3 py-2 text-sm font-semibold">
                        <Eye size={17} /> Preview
                      </span>
                    </span>
                  </button>
                  <button onClick={() => void saveImage(url, index)} aria-label={`Download photo ${index + 1}`} className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-myinder-blue shadow-md transition hover:bg-blue-50"><Download size={20}/></button>
                </article>
              ))}
            </div>
          ) : <p className="py-12 text-center text-sm text-slate-500">No images available for this user.</p>}
        </div>
      </section>
      {previewIndex !== null && user.images[previewIndex] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm sm:p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewIndex(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${previewIndex + 1} of ${user.images.length}`}
            className="relative flex h-full max-h-[90vh] w-full max-w-6xl flex-col items-center justify-center"
          >
            <button
              type="button"
              onClick={() => setPreviewIndex(null)}
              aria-label="Close image preview"
              className="absolute right-0 top-0 z-10 rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25"
            >
              <X size={24} />
            </button>
            <ResolvedImage
              src={user.images[previewIndex]}
              alt={`${user.name} photo ${previewIndex + 1}`}
              className="min-h-[40vh] max-h-[calc(90vh-5rem)] w-full max-w-full rounded-lg"
              imageClassName="max-h-[calc(90vh-5rem)] max-w-full rounded-lg object-contain shadow-2xl"
            />
            {user.images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPreviewIndex((previewIndex - 1 + user.images.length) % user.images.length)}
                  aria-label="Previous photo"
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/25"
                >
                  <ChevronLeft size={26} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewIndex((previewIndex + 1) % user.images.length)}
                  aria-label="Next photo"
                  className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/25"
                >
                  <ChevronRight size={26} />
                </button>
              </>
            )}
            <div className="mt-4 flex items-center gap-4">
              <p className="text-sm font-medium text-white/85">
                Photo {previewIndex + 1} of {user.images.length}
              </p>
              <button
                type="button"
                onClick={() => void saveImage(user.images[previewIndex], previewIndex)}
                className="inline-flex items-center gap-2 rounded-lg bg-myinder-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                <Download size={18} /> Download image
              </button>
            </div>
           


          </section>
          

        </div>
      )}
    </div>
  );
}
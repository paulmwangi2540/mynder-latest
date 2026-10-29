import { useEffect, useState, type ChangeEvent } from "react";
import { Download, Frame, ImagePlus, RefreshCw, Upload } from "lucide-react";
import Button from "../../components/ui/Button";
import useToastFeedback from "../../hooks/useToastFeedback";
import { getPosterColor, generatePosterFromImage, type PosterProgress } from "../services/posterService";
import { getUniversities, type UniversityRecord } from "../services/universitiesService";

function getDownloadName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
  return `${baseName || "mylnder-frame"}.png`;
}

export default function Frames() {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [frameUrl, setFrameUrl] = useState("");
  const [universities, setUniversities] = useState<UniversityRecord[]>([]);
  const [universityId, setUniversityId] = useState("");
  const [universitiesLoading, setUniversitiesLoading] = useState(true);
  const [progress, setProgress] = useState<PosterProgress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getUniversities()
      .then((records) => {
        if (active) setUniversities(records);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load universities.");
      })
      .finally(() => {
        if (active) setUniversitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    if (!frameUrl) return;
    return () => URL.revokeObjectURL(frameUrl);
  }, [frameUrl]);

  useToastFeedback(error);

  const selectedUniversity = universities.find((university) => university.id === universityId);
  const posterColor = selectedUniversity ? getPosterColor(selectedUniversity) : null;

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    setFrameUrl("");
    setProgress(null);
    setImage(selected);
  }

  async function createFrame() {
    if (!selectedUniversity || !posterColor) {
      setError("Select the university before creating a frame.");
      return;
    }
    if (!image) {
      setError("Choose an image before creating a frame.");
      return;
    }
    setError("");
    setProgress("loading-photo");
    try {
      const framedImage = await generatePosterFromImage(image, posterColor.color, setProgress);
      setFrameUrl(URL.createObjectURL(framedImage));
      setProgress(null);
    } catch (cause: unknown) {
      setProgress(null);
      setError(cause instanceof Error ? cause.message : "Unable to create the framed image.");
    }
  }

  const creating = progress !== null;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-2xl border border-slate-700 bg-[#0c1b2b] p-4 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-300">
          <Frame size={17} /> Staff tool
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Frames</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Upload an image to create a downloadable framed poster. Image processing happens in this browser; nothing is uploaded or saved to the server.
        </p>
      </header>

      <section className="grid gap-5 rounded-2xl border border-slate-700 bg-[#0c1b2b] p-4 sm:p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-100">Choose an external image</span>
            <span className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900/60 p-4 text-center transition hover:border-emerald-500">
              <Upload size={23} className="text-emerald-300" />
              <span className="text-sm font-semibold text-white">{image ? image.name : "Select an image from this device"}</span>
              <span className="text-xs text-slate-400">PNG, JPEG, WebP, or another browser-supported image format</span>
            </span>
            <input type="file" accept="image/*" onChange={chooseImage} className="sr-only" />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-100">University</span>
            <select
              value={universityId}
              onChange={(event) => {
                setUniversityId(event.target.value);
                setFrameUrl("");
              }}
              disabled={universitiesLoading || universities.length === 0}
              className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
              required
            >
              <option value="">
                {universitiesLoading ? "Loading universities..." : universities.length ? "Select a university" : "No universities available"}
              </option>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>{university.name}</option>
              ))}
            </select>
            {selectedUniversity && posterColor && (
              <span className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded border border-white/30"
                  style={{ backgroundColor: posterColor.color }}
                />
                {posterColor.usedFallback
                  ? `${selectedUniversity.name} has no valid saved color; the default color will be used.`
                  : `Saved university color: ${posterColor.color}`}
              </span>
            )}
          </label>

          <Button type="button" onClick={() => void createFrame()} disabled={!image || !selectedUniversity || creating} className="w-full">
            {creating ? <RefreshCw size={17} className="animate-spin" /> : <ImagePlus size={17} />}
            {creating ? progress === "loading-photo" ? "Loading image..." : "Creating frame..." : "Create framed image"}
          </Button>

          {frameUrl && (
            <a
              href={frameUrl}
              download={getDownloadName(image?.name ?? "")}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Download size={17} /> Download framed PNG
            </a>
          )}
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <h2 className="mb-2 text-sm font-bold text-white">Original image</h2>
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:min-h-80">
              {imagePreviewUrl ? (
                <img src={imagePreviewUrl} alt="Selected original image" className="max-h-[65vh] max-w-full object-contain" />
              ) : (
                <div className="text-center text-slate-500">
                  <ImagePlus size={30} className="mx-auto" />
                  <p className="mt-2 text-xs">Select an image to preview it here</p>
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="mb-2 text-sm font-bold text-white">Framed preview</h2>
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:min-h-80">
              {frameUrl ? (
                <img src={frameUrl} alt="Generated framed poster preview" className="max-h-[65vh] max-w-full object-contain" />
              ) : (
                <div className="text-center text-slate-500">
                  <Frame size={30} className="mx-auto" />
                  <p className="mt-2 text-xs">Create the frame to see the finished poster</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

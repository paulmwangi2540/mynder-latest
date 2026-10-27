
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  University as UniversityIcon,
  X,
} from "lucide-react";

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import LoadingState from "../../components/shared/LoadingState";
import Modal from "../../components/ui/Modal";

import {
  createUniversity,
  getUniversities,
  updateUniversity,
  type UniversityInput,
  type UniversityRecord,
} from "../services/universitiesService";

import ColorfulIcon from "../components/ColorfulIcon";

function validateUniversity(
  university: UniversityInput,
  universities: UniversityRecord[],
  excludeId?: string,
): string | undefined {
  const name = university.name.trim();
  const profileName = university.profileName.trim();
  const customColor = university.customColor.trim();
  const slug = university.slug.trim();

  if (!name) return "Enter a university name.";
  if (name.length > 150) return "The university name must be 150 characters or fewer.";
  if (!profileName) return "Enter a university profile name.";
  if (profileName.length > 100) return "The university profile name must be 100 characters or fewer.";
  if (!/^#[0-9a-fA-F]{6}$/.test(customColor)) return "Choose a valid six-digit hex color.";
  if (!slug) return "Enter a university slug.";
  if (slug.length > 150) return "The university slug must be 150 characters or fewer.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Use lowercase letters, numbers, and single hyphens for the slug.";
  }

  const slugExists = universities.some(
    (existing) =>
      existing.id !== excludeId &&
      existing.slug?.toLocaleLowerCase() === slug.toLocaleLowerCase(),
  );
  if (slugExists) return "That university slug is already in use.";

  const nameExists = universities.some(
    (existing) =>
      existing.id !== excludeId &&
      existing.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (nameExists) return "That university is already in the list.";
  return undefined;
}

export default function Universities() {
  const [universities, setUniversities] = useState<UniversityRecord[]>([]);
  const [name, setName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [customColor, setCustomColor] = useState("#00E6B3");
  const [slug, setSlug] = useState("");
  const [editing, setEditing] = useState<UniversityRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editProfileName, setEditProfileName] = useState("");
  const [editCustomColor, setEditCustomColor] = useState("#00E6B3");
  const [editSlug, setEditSlug] = useState("");
  const [editError, setEditError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUniversities = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setUniversities(await getUniversities());
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load universities."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUniversities();
  }, [loadUniversities]);

  useEffect(() => {
    if (!error) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setError("");
      }
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [error]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input = { name, profileName, customColor, slug };
    const validationError = validateUniversity(input, universities);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await createUniversity(input);

      setName("");
      setProfileName("");
      setCustomColor("#00E6B3");
      setSlug("");

      setSuccess(`${input.name.trim()} was added.`);

      await loadUniversities();
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add the university."
      );
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (university: UniversityRecord) => {
    setEditing(university);
    setEditName(university.name);
    setEditProfileName(university.profileName ?? "");
    setEditCustomColor(university.customColor && /^#[0-9a-fA-F]{6}$/.test(university.customColor)
      ? university.customColor
      : "#00E6B3");
    setEditSlug(university.slug ?? "");
    setEditError("");
    setError("");
    setSuccess("");
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;

    const input = {
      name: editName,
      profileName: editProfileName,
      customColor: editCustomColor,
      slug: editSlug,
    };
    const validationError = validateUniversity(input, universities, editing.id);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    setSavingEdit(true);
    setEditError("");
    try {
      await updateUniversity(editing.id, input);
      setSuccess(`${input.name.trim()} was updated.`);
      setEditing(null);
      await loadUniversities();
    } catch (cause: unknown) {
      setEditError(
        cause instanceof Error ? cause.message : "Unable to update the university.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-7">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Universities
        </h1>

        <p className="mt-1 text-sm text-slate-300">
          Manage the universities available in the campus community.
        </p>
      </div>

      <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-myinder-navy">
          Add a university
        </h2>

        <form
          noValidate
          onSubmit={submit}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label
              htmlFor="university-name"
              className="mb-2 block text-sm font-semibold text-myinder-navy"
            >
              University name
            </label>

            <Input
              id="university-name"
              name="name"
              autoComplete="organization"
              maxLength={150}
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
                setSuccess("");
              }}
              placeholder="Enter university name"
            />
          </div>

          <div className="flex-1">
            <label
              htmlFor="university-profile-name"
              className="mb-2 block text-sm font-semibold text-myinder-navy"
            >
              Profile name
            </label>

            <Input
              id="university-profile-name"
              name="profile_name"
              autoComplete="organization"
              maxLength={100}
              required
              value={profileName}
              onChange={(event) => {
                setProfileName(event.target.value);
                setError("");
                setSuccess("");
              }}
              placeholder="Enter university profile name"
            />
          </div>

          <div>
            <label
              htmlFor="university-slug"
              className="mb-2 block text-sm font-semibold text-myinder-navy"
            >
              University slug
            </label>
            <Input
              id="university-slug"
              name="slug"
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={150}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Use lowercase letters, numbers, and single hyphens."
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setError("");
                setSuccess("");
              }}
              placeholder="university-of-example"
            />
            <p className="mt-1 text-xs text-slate-700">Lowercase letters, numbers, and hyphens only.</p>
          </div>

          <div>
            <label
              htmlFor="university-custom-color"
              className="mb-2 block text-sm font-semibold text-myinder-navy"
            >
              Profile color
            </label>

           <div className="flex flex-wrap items-center gap-3">
  <input
    id="university-custom-color"
    name="custom_color"
    type="color"
    required
    value={customColor}
    onChange={(event) => {
      setCustomColor(event.target.value);
      setError("");
      setSuccess("");
    }}
    aria-label="Profile color picker"
    className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
  />

  <input
    type="text"
    value={customColor}
    onChange={(event) => {
      const value = event.target.value;

      setCustomColor(value);
      setError("");
      setSuccess("");
    }}
    placeholder="#102A43"
    aria-label="Enter HEX color code"
    maxLength={7}
    pattern="^#[0-9A-Fa-f]{6}$"
    title="Enter a valid HEX color code, e.g. #102A43"
    className="w-28 rounded-md border border-gray-300 px-3 py-2 text-base uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:text-sm"
  />

  <span className="basis-full text-sm text-slate-700 sm:basis-auto">
    Choose or enter a color
  </span>
</div>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="sm:col-span-2 sm:justify-self-start"
          >
            {saving ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <Plus size={18} />
            )}

            {saving ? "Adding..." : "Add university"}
          </Button>
        </form>

        {success && (
          <p
            role="status"
            className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {success}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-myinder-navy">
              All universities
            </h2>

            <p className="mt-1 text-sm text-myinder-muted">
              {universities.length}{" "}
              {universities.length === 1
                ? "university"
                : "universities"}
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => void loadUniversities()}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </Button>
        </div>

        {loading ? (
          <LoadingState label="Loading universities..." />
        ) : universities.length ? (
          <ul className="divide-y divide-blue-50">
            {universities.map((university) => (
              <li
                key={university.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <ColorfulIcon
                  Icon={UniversityIcon}
                  tone="orange"
                  size={20}
                  className="h-10 w-10"
                />

                <div className="min-w-0 flex-1">
                  <p className="font-medium text-myinder-navy">
                    {university.name}
                    {university.profileName ? ` (${university.profileName})` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
                    <span>Slug: {university.slug || "Not set"}</span>
                    {university.customColor && (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 rounded-full border border-slate-400"
                          style={{ backgroundColor: university.customColor }}
                        />
                        {university.customColor}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => beginEdit(university)}
                  disabled={savingEdit}
                >
                  <Pencil size={15} />
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 py-10 text-center text-sm text-myinder-muted">
            {error
              ? "Universities could not be loaded. Try refreshing the list."
              : "No universities have been added yet."}
          </div>
        )}
      </section>

      {editing && (
        <Modal>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-university-title"
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 id="edit-university-title" className="text-lg font-bold text-myinder-navy">
                  Edit university
                </h2>
                <p className="mt-1 text-sm text-slate-700">
                  Update its display name, profile, color, and slug.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={savingEdit}
                aria-label="Close edit university"
                className="rounded-lg p-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <form noValidate onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="edit-university-name" className="mb-2 block text-sm font-semibold text-myinder-navy">
                  University name
                </label>
                <Input
                  id="edit-university-name"
                  maxLength={150}
                  required
                  value={editName}
                  onChange={(event) => {
                    setEditName(event.target.value);
                    setEditError("");
                  }}
                />
              </div>
              <div>
                <label htmlFor="edit-university-profile-name" className="mb-2 block text-sm font-semibold text-myinder-navy">
                  Profile name
                </label>
                <Input
                  id="edit-university-profile-name"
                  maxLength={100}
                  required
                  value={editProfileName}
                  onChange={(event) => {
                    setEditProfileName(event.target.value);
                    setEditError("");
                  }}
                />
              </div>
              <div>
                <label htmlFor="edit-university-slug" className="mb-2 block text-sm font-semibold text-myinder-navy">
                  University slug
                </label>
                <Input
                  id="edit-university-slug"
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={150}
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="Use lowercase letters, numbers, and single hyphens."
                  value={editSlug}
                  onChange={(event) => {
                    setEditSlug(event.target.value);
                    setEditError("");
                  }}
                  placeholder="university-of-example"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="edit-university-color" className="mb-2 block text-sm font-semibold text-myinder-navy">
                  Profile color
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="edit-university-color"
                    type="color"
                    value={editCustomColor}
                    onChange={(event) => {
                      setEditCustomColor(event.target.value);
                      setEditError("");
                    }}
                    aria-label="Profile color picker"
                    className="h-9 w-11 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={editCustomColor}
                    onChange={(event) => {
                      setEditCustomColor(event.target.value);
                      setEditError("");
                    }}
                    aria-label="Enter HEX color code"
                    maxLength={7}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    title="Enter a valid six-digit hex color."
                    className="w-28 rounded-md border border-gray-300 px-3 py-2 text-base uppercase text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:text-sm"
                  />
                </div>
              </div>
              {editError && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">
                  {editError}
                </p>
              )}
              <div className="flex justify-end gap-3 sm:col-span-2">
                <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? <LoaderCircle size={17} className="animate-spin" /> : <Pencil size={16} />}
                  {savingEdit ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </form>
          </section>
        </Modal>
      )}

      {error && (
        <Modal>
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="university-error-title"
            aria-describedby="university-error-message"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertCircle size={22} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="university-error-title"
                    className="text-lg font-bold text-myinder-navy"
                  >
                    Unable to complete the request
                  </h2>

                  <button
                    type="button"
                    onClick={() => setError("")}
                    aria-label="Close error message"
                    className="rounded-lg p-1 text-myinder-muted hover:bg-blue-50 hover:text-myinder-navy"
                  >
                    <X size={20} />
                  </button>
                </div>

                <p
                  id="university-error-message"
                  className="mt-2 break-words text-sm leading-6 text-slate-600"
                >
                  {error}
                </p>

                <Button
                  type="button"
                  onClick={() => setError("")}
                  className="mt-5"
                >
                  OK
                </Button>
              </div>
            </div>
          </section>
        </Modal>
      )}
    </main>
  );
}

"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";
import { compressImageOnClient } from "@/lib/client-image";
import {
  publishDraft,
  saveDraft,
  removeDraft,
  type EvidenceDraft,
} from "@/lib/evidence-client";
const LocationPicker = dynamic(
  () => import("@/components/LocationPicker").then((m) => m.LocationPicker),
  { ssr: false },
);

function ReportForm() {
  const router = useRouter(),
    params = useSearchParams();
  const [step, setStep] = useState(1),
    [pin, setPin] = useState({ lat: 12.9716, lon: 77.5946 });
  const [placed, setPlaced] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]),
    [nearby, setNearby] = useState<any[]>([]);
  const [segment, setSegment] = useState<string | null>(null),
    [incident, setIncident] = useState<string | null>(null);
  const [roadName, setRoadName] = useState("Road not listed"),
    [category, setCategory] = useState("pothole"),
    [status, setStatus] = useState("damaged"),
    [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null),
    [photoName, setPhotoName] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false),
    [photoError, setPhotoError] = useState("");
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [identity, setIdentity] = useState<{ id: string; key: string } | null>(
    null,
  );
  const generation = useRef(0);
  const locationGeneration = useRef(0);
  const [reportSaved, setReportSaved] = useState(false);
  const draft = (): EvidenceDraft => ({
    id: identity!.id,
    idempotency_key: identity!.key,
    ...pin,
    category,
    observed_status: status,
    description,
    target_segment_id: segment,
    target_incident_id: incident,
    road_name: roadName,
    created_at: new Date().toISOString(),
    photo_name: photoName,
    photo_data_url: photo,
    report_saved: reportSaved,
  });

  useEffect(() => {
    setIdentity({ id: crypto.randomUUID(), key: crypto.randomUUID() });
    const lat = Number(params.get("lat")),
      lon = Number(params.get("lon"));
    if (
      params.has("lat") &&
      params.has("lon") &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      setPin({ lat, lon });
      setPlaced(true);
    } else if (params.has("lat") || params.has("lon"))
      setError("The supplied location is invalid. Choose a point on the map.");
    const resume = params.get("draft");
    if (resume)
      try {
        const d = (
          JSON.parse(
            localStorage.getItem("trp_offline_drafts") || "[]",
          ) as EvidenceDraft[]
        ).find((d) => d.id === resume);
        if (
          d &&
          Number.isFinite(d.lat) &&
          Number.isFinite(d.lon) &&
          Math.abs(d.lat) <= 90 &&
          Math.abs(d.lon) <= 180
        ) {
          setIdentity({ id: d.id, key: d.idempotency_key });
          setPin({ lat: d.lat, lon: d.lon });
          setPlaced(true);
          setCategory(d.category);
          setStatus(d.observed_status);
          setDescription(d.description);
          setPhoto(d.photo_data_url || null);
          setPhotoName(d.photo_name);
          if (d.report_saved) {
            setReportSaved(true);
            setSegment(d.target_segment_id);
            setIncident(d.target_incident_id || null);
            setRoadName(d.road_name);
            setConfirmed(true);
            setStep(3);
          }
        }
      } catch {
        setError(
          "Unable to restore the draft. Your stored draft has not been removed.",
        );
      }
  }, [params]);

  async function confirmLocation() {
    const ticket = locationGeneration.current;
    setBusy(true);
    setError("");
    setConfirmed(false);
    try {
      const bbox = `${pin.lon - 0.0015},${pin.lat - 0.0015},${pin.lon + 0.0015},${pin.lat + 0.0015}`;
      const responses = await Promise.all([
        fetch(`/api/v1/roads/nearest?lat=${pin.lat}&lon=${pin.lon}&radius=150`),
        fetch(`/api/v1/incidents?bbox=${bbox}&status=active`),
      ]);
      const [roads, issues] = await Promise.all(
        responses.map(async (res) => {
          const j = await res.json();
          if (!res.ok)
            throw new Error(j.error || "Could not check nearby roads.");
          return j;
        }),
      );
      if (ticket !== locationGeneration.current) return;
      setCandidates(roads.candidates || []);
      setNearby(issues.incidents || []);
      setConfirmed(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Please check this location again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function selectPhoto(file?: File) {
    if (!file) return;
    const ticket = ++generation.current;
    setPhoto(null);
    setPhotoName(null);
    setPhotoBusy(true);
    setPhotoError("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPEG, PNG, or WebP photo.");
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 20 MB.");
      const compressed = await compressImageOnClient(file);
      if (compressed.compressedBytes > 8 * 1024 * 1024)
        throw new Error("This image is too large. Choose another photo.");
      if (ticket === generation.current) {
        setPhoto(compressed.dataUrl);
        setPhotoName(file.name);
      }
    } catch (e) {
      if (ticket === generation.current)
        setPhotoError(
          e instanceof Error ? e.message : "Could not read this photo.",
        );
    } finally {
      if (ticket === generation.current) setPhotoBusy(false);
    }
  }
  function store() {
    try {
      saveDraft(draft());
      setSaved(true);
      setError("");
    } catch {
      setError(
        "Your device could not save this draft. Free some storage or keep this page open.",
      );
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    const d = draft();
    try {
      saveDraft(d);
      setSaved(true);
    } catch {
      setError(
        "Unable to save a recovery draft. Keep this page open if submission fails.",
      );
    }
    try {
      const result = await publishDraft(d, setStage, () =>
        setReportSaved(true),
      );
      try {
        removeDraft(d.id);
      } catch {}
      router.push(`/incidents/${result.incident_id}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Submission failed. Your evidence remains here for retry.",
      );
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-6">
        <div>
          <Link href="/" className="text-sm text-slate-400 hover:text-cyan-300">
            ← Back to the map
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-5">
            Add evidence
          </h1>
          <p className="text-slate-400 mt-2">
            Show what’s happening, exactly where it’s happening.
          </p>
        </div>
        <ol className="flex gap-3 text-sm" aria-label="Report progress">
          {["Location", "Photo & details", "Review & submit"].map(
            (label, i) => (
              <li
                key={label}
                aria-current={step === i + 1 ? "step" : undefined}
                className={`flex-1 border-t-2 pt-3 ${step >= i + 1 ? "border-cyan-400 text-cyan-200" : "border-slate-700 text-slate-500"}`}
              >
                {i + 1}. {label}
              </li>
            ),
          )}
        </ol>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200"
          >
            {error}
          </p>
        )}
        {step === 1 && (
          <section className="space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
            <h2 className="text-xl font-semibold">Where is the issue?</h2>
            <p className="text-sm text-slate-400">
              Place the pin on the damage, rather than where you are standing.
            </p>
            <LocationPicker
              value={pin}
              onChange={(p) => {
                ++locationGeneration.current;
                setPin(p);
                setPlaced(true);
                setConfirmed(false);
                setCandidates([]);
                setNearby([]);
                setSegment(null);
                setIncident(null);
                setRoadName("Road not listed");
                setError("");
              }}
            />
            <button
              className="evidence-primary"
              disabled={!placed || busy}
              onClick={confirmLocation}
            >
              {busy
                ? "Checking nearby roads…"
                : "Confirm pin & check nearby roads"}
            </button>
            {!placed && (
              <p className="text-sm text-slate-400">
                Choose a point before continuing.
              </p>
            )}
            {confirmed && (
              <div className="space-y-4 border-t border-slate-700 pt-5">
                <fieldset>
                  <legend className="font-medium mb-3">
                    Which road is affected?
                  </legend>
                  <div className="space-y-2">
                    {candidates.map((c) => (
                      <label
                        key={c.segment_id}
                        className={`flex gap-3 rounded-xl border p-3 cursor-pointer ${segment === c.segment_id ? "border-cyan-400 bg-cyan-950/30" : "border-slate-700"}`}
                      >
                        <input
                          type="radio"
                          name="road"
                          checked={segment === c.segment_id}
                          onChange={() => {
                            setSegment(c.segment_id);
                            setRoadName(
                              c.road_name || c.road_ref || "Unnamed road",
                            );
                          }}
                        />
                        <span>
                          {c.road_name || c.road_ref || "Unnamed road"}
                          <small className="block text-slate-400">
                            {c.distance_m} m from pin · {c.district}
                          </small>
                        </span>
                      </label>
                    ))}
                    <label className="flex gap-3 p-3 border border-slate-700 rounded-xl">
                      <input
                        type="radio"
                        name="road"
                        checked={segment === null}
                        onChange={() => {
                          setSegment(null);
                          setRoadName("Road not listed");
                        }}
                      />
                      Road not listed / unsure
                    </label>
                  </div>
                </fieldset>
                {nearby.length > 0 && (
                  <fieldset>
                    <legend className="font-medium mb-3">
                      Is this an existing issue?
                    </legend>
                    <label className="block text-sm mb-2">
                      <input
                        type="radio"
                        name="issue"
                        checked={!incident}
                        onChange={() => setIncident(null)}
                      />{" "}
                      This is a different issue
                    </label>
                    {nearby.map((i) => (
                      <label
                        key={i.id}
                        className="block rounded-lg border border-slate-700 p-3 mb-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="issue"
                          checked={incident === i.id}
                          onChange={() => setIncident(i.id)}
                        />{" "}
                        Add evidence to {String(i.category).replace(/_/g, " ")}{" "}
                        · {i.verification_state}
                      </label>
                    ))}
                  </fieldset>
                )}
                <button className="evidence-primary" onClick={() => setStep(2)}>
                  Continue to photo & details →
                </button>
              </div>
            )}
          </section>
        )}
        {step === 2 && (
          <section className="space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
            <h2 className="text-xl font-semibold">What did you observe?</h2>
            <div className="rounded-xl border border-dashed border-slate-600 p-5 space-y-3">
              <h3 className="font-medium">
                Photo evidence{" "}
                <span className="text-slate-400 text-sm">(optional)</span>
              </h3>
              <p className="text-sm text-slate-400">
                A clear photo helps others understand the issue. Avoid including
                people’s faces.
              </p>
              <div className="flex flex-wrap gap-3">
                {["camera", "gallery"].map((source) => (
                  <label
                    key={source}
                    className="evidence-secondary cursor-pointer"
                  >
                    {source === "camera"
                      ? "Take a photo"
                      : photo
                        ? "Replace photo"
                        : "Choose a photo"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture={source === "camera" ? "environment" : undefined}
                      disabled={photoBusy}
                      onChange={(e) => {
                        void selectPhoto(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ))}
              </div>
              {photoBusy && (
                <p role="status" className="text-sm text-cyan-200">
                  Preparing your photo…
                </p>
              )}
              {photoError && (
                <p role="alert" className="text-rose-300 text-sm">
                  {photoError}
                </p>
              )}
              {photo && (
                <>
                  <img
                    src={photo}
                    alt="Selected evidence photo"
                    className="max-h-80 w-full object-contain rounded-lg bg-slate-950"
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 truncate">{photoName}</span>
                    <button
                      onClick={() => {
                        ++generation.current;
                        setPhoto(null);
                        setPhotoName(null);
                        setPhotoError("");
                      }}
                      className="text-rose-300"
                    >
                      Remove photo
                    </button>
                  </div>
                </>
              )}
              {photoError && (
                <button
                  className="text-sm text-slate-300 underline"
                  onClick={() => {
                    setPhotoError("");
                    setPhoto(null);
                    setPhotoName(null);
                  }}
                >
                  Continue without a photo
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm">
                Issue type
                <select
                  className="evidence-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {[
                    "pothole",
                    "dug_open",
                    "damaged_surface",
                    "flooded",
                    "unsafe_workzone",
                    "debris_blockage",
                    "collapsed_culvert",
                    "other",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Observed condition
                <select
                  className="evidence-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {[
                    "damaged",
                    "dug_open",
                    "partially_blocked",
                    "flooded",
                    "unsafe_workzone",
                    "temporary_restoration",
                    "repaired",
                    "deteriorated",
                    "normal",
                    "unknown",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              Describe what you saw
              <textarea
                className="evidence-input min-h-28"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={3000}
                placeholder="What happened? Which lane or landmark is nearby?"
              />
            </label>
            <div className="flex justify-between gap-3">
              <button className="evidence-secondary" onClick={() => setStep(1)}>
                ← Location
              </button>
              <button
                className="evidence-primary"
                disabled={
                  photoBusy || !!photoError || description.trim().length < 5
                }
                onClick={() => {
                  setError("");
                  setStep(3);
                }}
              >
                Review evidence →
              </button>
            </div>
          </section>
        )}
        {step === 3 && (
          <>
            <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
              <div className="flex justify-between">
                <h2 className="text-xl font-semibold">Review your evidence</h2>
                <button
                  className="text-cyan-300 text-sm"
                  disabled={busy || reportSaved}
                  onClick={() => setStep(1)}
                >
                  Edit location
                </button>
              </div>
              <LocationPicker value={pin} readOnly />
              <p className="font-medium">{roadName}</p>
              <p className="text-sm text-slate-400">
                {category.replace(/_/g, " ")} · {status.replace(/_/g, " ")}
                {incident && " · Added to an existing issue"}
              </p>
              <p className="whitespace-pre-wrap">{description}</p>
              {photo && (
                <img
                  src={photo}
                  alt="Evidence photo ready for submission"
                  className="max-h-72 rounded-xl object-contain w-full bg-slate-950"
                />
              )}
              <button
                className="text-cyan-300 text-sm"
                disabled={busy || reportSaved}
                onClick={() => setStep(2)}
              >
                Edit photo & details
              </button>
            </section>
            <AccountPanel />
            {reportSaved && (
              <p className="text-sm text-cyan-200">
                Your report is saved. Retry below to finish attaching its photo.
              </p>
            )}
            <div className="space-y-3">
              <button
                className="evidence-primary w-full"
                disabled={busy || !identity}
                onClick={publish}
              >
                {busy
                  ? stage || "Submitting…"
                  : error.includes("photo failed")
                    ? "Retry photo upload"
                    : "Submit evidence"}
              </button>
              <button
                className="evidence-secondary w-full"
                disabled={busy || !identity}
                onClick={store}
              >
                Save draft on this device
              </button>
              {saved && (
                <p role="status" className="text-sm text-slate-400">
                  Recovery draft saved.{" "}
                  <Link href="/drafts" className="text-cyan-300 underline">
                    View drafts
                  </Link>
                </p>
              )}
              <p className="text-xs text-slate-500">
                Reports are community observations and may need review. Signing
                in does not mark evidence as verified.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
export default function ReportPage() {
  return (
    <Suspense fallback={<p className="p-6">Loading evidence form…</p>}>
      <ReportForm />
    </Suspense>
  );
}

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
  const [roadName, setRoadName] = useState("Road not listed / Unmatched"),
    [category, setCategory] = useState("pothole"),
    [status, setStatus] = useState("damaged"),
    [description, setDescription] = useState("");
  const [coverageInfo, setCoverageInfo] = useState<{
    inCoverage: boolean;
    area: string | null;
    message?: string;
  }>({ inCoverage: true, area: null });
  const [lookupFailed, setLookupFailed] = useState(false);
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
    setLookupFailed(false);
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
      if (roads.in_coverage === false) {
        setCoverageInfo({
          inCoverage: false,
          area: roads.coverage_area || null,
          message: roads.message || "This location is outside the currently indexed pilot boundary (Bengaluru Urban).",
        });
        setCandidates([]);
        setSegment(null);
        setRoadName("Unmatched point observation");
      } else {
        setCoverageInfo({
          inCoverage: true,
          area: roads.coverage_area || "Bengaluru Urban",
        });
        setCandidates(roads.candidates || []);
        // Note: Preserve unmatched reporting - do NOT auto-assign closest road
        setSegment(null);
        setRoadName("Road not listed / Unmatched");
      }
      setNearby(issues.incidents || []);
      setConfirmed(true);
      setLookupFailed(false);
    } catch (e) {
      setLookupFailed(true);
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
          <Link href="/" className="text-sm text-muted hover:text-information">
            ← Back to the map
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-5">
            Add evidence
          </h1>
          <p className="text-muted mt-2">
            Show what’s happening, exactly where it’s happening.
          </p>
        </div>
        <ol className="flex gap-3 text-sm" aria-label="Report progress">
          {["Location", "Photo & details", "Review & submit"].map(
            (label, i) => (
              <li
                key={label}
                aria-current={step === i + 1 ? "step" : undefined}
                className={`flex-1 border-t-2 pt-3 ${step >= i + 1 ? "border-cyan-400 text-information" : "border-line text-quiet"}`}
              >
                {i + 1}. {label}
              </li>
            ),
          )}
        </ol>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {step === 1 && (
          <section className="space-y-5 rounded-3xl border border-line bg-surface p-4 sm:p-6">
            <h2 className="text-xl font-semibold">Where is the issue?</h2>
            <p className="text-sm text-muted">
              Place the pin on the damage, rather than where you are standing.
            </p>
            <LocationPicker
              value={pin}
              candidates={candidates}
              selectedSegmentId={segment}
              onSelectSegment={(segId) => {
                const c = candidates.find((item) => item.segment_id === segId);
                if (c) {
                  setSegment(c.segment_id);
                  setRoadName(
                    c.display_label || c.road_name || c.road_ref || "Unnamed road",
                  );
                }
              }}
              onChange={(p) => {
                ++locationGeneration.current;
                setPin(p);
                setPlaced(true);
                setConfirmed(false);
                setCandidates([]);
                setNearby([]);
                setSegment(null);
                setIncident(null);
                setRoadName("Road not listed / Unmatched");
                setCoverageInfo({ inCoverage: true, area: null });
                setLookupFailed(false);
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
              <p className="text-sm text-muted">
                Choose a point before continuing.
              </p>
            )}
            {lookupFailed && (
              <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 space-y-3">
                <p className="text-sm text-danger">
                  Road lookup failed to complete. You can retry the check or proceed with an unlinked point observation.
                </p>
                <div className="flex gap-3">
                  <button
                    className="evidence-secondary text-xs"
                    onClick={confirmLocation}
                  >
                    Retry road check
                  </button>
                  <button
                    className="evidence-primary text-xs"
                    onClick={() => {
                      setConfirmed(true);
                      setSegment(null);
                      setRoadName("Road not listed / Unmatched");
                    }}
                  >
                    Continue as unlinked report →
                  </button>
                </div>
              </div>
            )}
            {confirmed && (
              <div className="space-y-4 border-t border-line pt-5">
                {!coverageInfo.inCoverage ? (
                  <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-warning font-medium text-sm">
                      <span>⚠️ Outside Indexed Pilot Boundary</span>
                    </div>
                    <p className="text-xs text-warning/80 leading-relaxed">
                      {coverageInfo.message || "This location is outside the currently indexed pilot boundary (Bengaluru Urban). Roads are not indexed here yet, but you can still submit an unmatched observation at this exact coordinate."}
                    </p>
                    <label className="flex gap-3 p-3 border border-amber-700/50 bg-amber-950/40 rounded-xl cursor-pointer mt-2">
                      <input
                        type="radio"
                        name="road"
                        checked={segment === null}
                        readOnly
                      />
                      <span className="text-sm font-medium text-warning">
                        Unmatched point observation
                        <small className="block text-warning/70 font-normal text-xs mt-0.5">
                          Evidence will be recorded at ({pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}) without linking to an indexed road segment.
                        </small>
                      </span>
                    </label>
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="rounded-xl border border-line bg-surface/60 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-muted font-medium text-sm">
                      <span>ℹ️ No Indexed Road Within 150m</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      No indexed road segments were found within 150 metres of this pin. Streets visible on the base map may not yet be in our database. You can still report this exact location as an unlinked observation.
                    </p>
                    <label className="flex gap-3 p-3 border border-cyan-400 bg-cyan-950/30 rounded-xl cursor-pointer">
                      <input
                        type="radio"
                        name="road"
                        checked={segment === null}
                        readOnly
                      />
                      <span className="text-sm font-medium">
                        Road not listed / Unmatched point observation
                        <small className="block text-muted font-normal text-xs mt-0.5">
                          Your report will be recorded at these coordinates without attaching to an indexed road.
                        </small>
                      </span>
                    </label>
                  </div>
                ) : (
                  <fieldset>
                    <legend className="font-medium mb-1">
                      Which road is affected?
                    </legend>
                    <p className="text-xs text-muted mb-3">
                      Choose the affected road below or click directly on a highlighted line on the map. The closest line may be a parallel service lane or elevated carriageway.
                    </p>
                    <div className="space-y-2">
                      {candidates.map((c) => {
                        const isSelected = segment === c.segment_id;
                        const label = c.display_label || c.road_name || c.road_ref || "Unnamed road";
                        return (
                          <label
                            key={c.segment_id}
                            className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-400"
                                : "border-line hover:border-line-hover bg-surface/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name="road"
                              checked={isSelected}
                              onChange={() => {
                                setSegment(c.segment_id);
                                setRoadName(label);
                              }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-foreground">
                                  {label}
                                </span>
                                {c.grade_label && (
                                  <span
                                    className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                                      c.is_elevated
                                        ? "bg-purple-950 text-source border border-purple-800"
                                        : c.is_service
                                        ? "bg-amber-950 text-warning border border-amber-800"
                                        : "bg-cyan-950 text-information border border-cyan-800"
                                    }`}
                                  >
                                    {c.grade_label}
                                  </span>
                                )}
                              </div>
                              <small className="block text-muted mt-1 text-xs">
                                {c.distance_m} m from pin · {c.road_class || "road"} · {c.district || "Bengaluru Urban"}
                              </small>
                            </div>
                          </label>
                        );
                      })}
                      <label
                        className={`flex gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                          segment === null
                            ? "border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-400"
                            : "border-line hover:border-line-hover bg-surface/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="road"
                          checked={segment === null}
                          onChange={() => {
                            setSegment(null);
                            setRoadName("Road not listed / Unmatched");
                          }}
                        />
                        <div>
                          <span className="text-sm font-medium">Road not listed / unsure</span>
                          <small className="block text-muted text-xs mt-0.5">
                            Submit as an unlinked observation at this coordinate without associating with any indexed road.
                          </small>
                        </div>
                      </label>
                    </div>
                  </fieldset>
                )}
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
                        className="block rounded-lg border border-line p-3 mb-2 text-sm"
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
          <section className="space-y-5 rounded-3xl border border-line bg-surface p-4 sm:p-6">
            <h2 className="text-xl font-semibold">What did you observe?</h2>
            <div className="rounded-xl border border-dashed border-line p-5 space-y-3">
              <h3 className="font-medium">
                Photo evidence{" "}
                <span className="text-muted text-sm">(optional)</span>
              </h3>
              <p className="text-sm text-muted">
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
                <p role="status" className="text-sm text-information">
                  Preparing your photo…
                </p>
              )}
              {photoError && (
                <p role="alert" className="text-danger text-sm">
                  {photoError}
                </p>
              )}
              {photo && (
                <>
                  <img
                    src={photo}
                    alt="Selected evidence photo"
                    className="max-h-80 w-full object-contain rounded-lg bg-canvas"
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted truncate">{photoName}</span>
                    <button
                      onClick={() => {
                        ++generation.current;
                        setPhoto(null);
                        setPhotoName(null);
                        setPhotoError("");
                      }}
                      className="text-danger"
                    >
                      Remove photo
                    </button>
                  </div>
                </>
              )}
              {photoError && (
                <button
                  className="text-sm text-muted underline"
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
            <section className="space-y-4 rounded-3xl border border-line bg-surface p-4 sm:p-6">
              <div className="flex justify-between">
                <h2 className="text-xl font-semibold">Review your evidence</h2>
                <button
                  className="text-information text-sm"
                  disabled={busy || reportSaved}
                  onClick={() => setStep(1)}
                >
                  Edit location
                </button>
              </div>
              <LocationPicker
                value={pin}
                readOnly
                candidates={candidates}
                selectedSegmentId={segment}
              />
              <div className="rounded-xl border border-line bg-surface/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted font-semibold">
                    Associated Road Segment
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      segment
                        ? "bg-cyan-950 text-information border border-cyan-800"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}
                  >
                    {segment ? "Linked Segment" : "Unlinked Point Observation"}
                  </span>
                </div>
                <p className="font-medium text-foreground text-base">{roadName}</p>
                {segment ? (
                  <p className="text-xs font-mono text-muted">Segment ID: {segment}</p>
                ) : (
                  <p className="text-xs text-muted">
                    Report will be recorded directly at ({pin.lat.toFixed(6)}, {pin.lon.toFixed(6)}) without associating with an indexed road.
                  </p>
                )}
              </div>
              <p className="text-sm text-muted">
                {category.replace(/_/g, " ")} · {status.replace(/_/g, " ")}
                {incident && " · Added to an existing issue"}
              </p>
              <p className="whitespace-pre-wrap">{description}</p>
              {photo && (
                <img
                  src={photo}
                  alt="Evidence photo ready for submission"
                  className="max-h-72 rounded-xl object-contain w-full bg-canvas"
                />
              )}
              <button
                className="text-information text-sm"
                disabled={busy || reportSaved}
                onClick={() => setStep(2)}
              >
                Edit photo & details
              </button>
            </section>
            <AccountPanel />
            {reportSaved && (
              <p className="text-sm text-information">
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
                <p role="status" className="text-sm text-muted">
                  Recovery draft saved.{" "}
                  <Link href="/drafts" className="text-information underline">
                    View drafts
                  </Link>
                </p>
              )}
              <p className="text-xs text-quiet">
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

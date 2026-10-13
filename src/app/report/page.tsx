'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ReportWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Wizard Step: 1: Location, 2: Road Candidate, 3: Duplicate Check, 4: Details, 5: Review
  const [step, setStep] = useState<number>(1);

  // Form State
  const [lat, setLat] = useState<number>(12.9716);
  const [lon, setLon] = useState<number>(77.5946);
  const [locationCaptured, setLocationCaptured] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Candidates & Selection
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedRoadName, setSelectedRoadName] = useState<string>('Unmatched Corridor');
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Duplicate Check
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [selectedDuplicateId, setSelectedDuplicateId] = useState<string | null>(null);

  // Details
  const [category, setCategory] = useState<string>('pothole');
  const [observedStatus, setObservedStatus] = useState<string>('damaged');
  const [description, setDescription] = useState<string>('');
  const [photoName, setPhotoName] = useState<string | null>(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  // Initialize from searchParams if pre-selected
  useEffect(() => {
    const pLat = searchParams.get('lat');
    const pLon = searchParams.get('lon');
    if (pLat && pLon) {
      setLat(parseFloat(pLat));
      setLon(parseFloat(pLon));
      setLocationCaptured(true);
    }
  }, [searchParams]);

  // Request GPS
  const handleCaptureGps = () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser. Please enter coordinates manually.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLon(Number(pos.coords.longitude.toFixed(6)));
        setLocationCaptured(true);
      },
      (err) => {
        setGpsError(`Location access denied or unavailable (${err.message}). Enter coordinates or choose a preset below.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Preset location selector for easy testing/fallback
  const handleSelectPreset = (name: string, pLat: number, pLon: number) => {
    setLat(pLat);
    setLon(pLon);
    setLocationCaptured(true);
    setGpsError(null);
  };

  // Fetch candidates when stepping to Step 2
  const handleProceedToRoadSelection = async () => {
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/v1/roads/nearest?lat=${lat}&lon=${lon}&radius=150`);
      const json = await res.json();
      setCandidates(json.candidates || []);
      if (json.candidates && json.candidates.length > 0) {
        setSelectedSegmentId(json.candidates[0].segment_id);
        setSelectedRoadName(json.candidates[0].road_name || json.candidates[0].road_ref);
      } else {
        setSelectedSegmentId(null);
        setSelectedRoadName('Unmatched Road / Not Listed');
      }
      setStep(2);
    } catch (err: any) {
      setCandidates([]);
      setSelectedSegmentId(null);
      setSelectedRoadName('Unmatched Road');
      setStep(2);
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Fetch duplicates when stepping to Step 3
  const handleProceedToDuplicateCheck = async () => {
    setLoadingDuplicates(true);
    try {
      // Query 100m bounding box
      const delta = 0.001;
      const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
      const res = await fetch(`/api/v1/incidents?bbox=${bbox}&status=active`);
      const json = await res.json();
      const nearby = json.incidents || [];
      setDuplicates(nearby);
      setStep(3);
    } catch (err) {
      setDuplicates([]);
      setStep(3);
    } finally {
      setLoadingDuplicates(false);
    }
  };

  // Handle Photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoName(e.target.files[0].name);
    }
  };

  // Save to Offline Draft
  const handleSaveOfflineDraft = () => {
    const draft = {
      id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
      lat,
      lon,
      category,
      observed_status: observedStatus,
      description,
      target_segment_id: selectedSegmentId,
      road_name: selectedRoadName,
      created_at: new Date().toISOString(),
      photo_name: photoName,
    };

    const existingDrafts = JSON.parse(localStorage.getItem('trp_offline_drafts') || '[]');
    existingDrafts.push(draft);
    localStorage.setItem('trp_offline_drafts', JSON.stringify(existingDrafts));
    setDraftSaved(true);
  };

  // Submit Online
  const handleSubmitOnline = async () => {
    setSubmitting(true);
    setSubmitError(null);

    const idempotencyKey = crypto.randomUUID();
    let reporterId = localStorage.getItem('trp_actor_id');
    if (!reporterId) {
      reporterId = crypto.randomUUID();
      localStorage.setItem('trp_actor_id', reporterId);
    }

    try {
      const res = await fetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_id: reporterId,
          lat,
          lon,
          category,
          observed_status: observedStatus,
          description,
          target_segment_id: selectedSegmentId,
          idempotency_key: idempotencyKey,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Submission failed');
      }

      router.push(resJson.redirect_url || `/incidents/${resJson.incident_id}`);
    } catch (err: any) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto px-4 py-6">
      {/* Wizard Progress Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
          <span>STEP {step} OF 5</span>
          <span>
            {step === 1 && 'Locate Defect'}
            {step === 2 && 'Confirm Road'}
            {step === 3 && 'Duplicate Check'}
            {step === 4 && 'Observation Details'}
            {step === 5 && 'Review & Submit'}
          </span>
        </div>
        <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-600 transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* STEP 1: LOCATION */}
      {step === 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pin Observation Location</h1>
            <p className="text-xs text-slate-500 mt-1">
              Use GPS or manually enter coordinates to position your road observation.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCaptureGps}
            className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition"
          >
            <span>📍</span> Get Current Location (GPS)
          </button>

          {gpsError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-lg">
              {gpsError}
            </div>
          )}

          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
              Or Select Known Testing Corridor
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleSelectPreset('ORR Bengaluru', 12.9238, 77.6842)}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left font-medium"
              >
                ORR Bengaluru
                <span className="block text-[10px] text-slate-400">12.9238, 77.6842</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('MG Road', 12.9753, 77.6067)}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left font-medium"
              >
                MG Road CBD
                <span className="block text-[10px] text-slate-400">12.9753, 77.6067</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('Hosur Road Elevated', 12.9150, 77.6250)}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left font-medium"
              >
                Hosur Road Elevated
                <span className="block text-[10px] text-slate-400">12.9150, 77.6250</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('Ramanagara MDR', 12.7200, 77.2800)}
                className="p-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left font-medium"
              >
                Ramanagara Rural
                <span className="block text-[10px] text-slate-400">12.7200, 77.2800</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={lat}
                onChange={(e) => { setLat(parseFloat(e.target.value) || 0); setLocationCaptured(true); }}
                className="w-full text-xs p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={lon}
                onChange={(e) => { setLon(parseFloat(e.target.value) || 0); setLocationCaptured(true); }}
                className="w-full text-xs p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={loadingCandidates}
            onClick={handleProceedToRoadSelection}
            className="w-full py-2.5 bg-slate-900 hover:bg-black dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
          >
            {loadingCandidates ? 'Matching Road Segments...' : 'Next: Confirm Road Corridor →'}
          </button>
        </div>
      )}

      {/* STEP 2: ROAD CANDIDATE MATCHING */}
      {step === 2 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Confirm Road Segment</h1>
            <p className="text-xs text-slate-500 mt-1">
              Select the matching official corridor or report as an unindexed road.
            </p>
          </div>

          <div className="space-y-2">
            {candidates.map((c: any) => (
              <label
                key={c.segment_id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  selectedSegmentId === c.segment_id
                    ? 'border-amber-600 bg-amber-50/40 dark:bg-amber-950/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="road_candidate"
                  checked={selectedSegmentId === c.segment_id}
                  onChange={() => {
                    setSelectedSegmentId(c.segment_id);
                    setSelectedRoadName(c.road_name || c.road_ref);
                  }}
                  className="mt-1"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {c.road_name || 'Unnamed Road'} {c.road_ref && `(${c.road_ref})`}
                  </div>
                  <div className="text-slate-500">
                    Snap Distance: <span className="font-semibold text-amber-600">{c.distance_m}m</span> • Authority: {c.authority_name || 'State/ULB'}
                  </div>
                </div>
              </label>
            ))}

            {/* Fallback Option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selectedSegmentId === null
                  ? 'border-amber-600 bg-amber-50/40 dark:bg-amber-950/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <input
                type="radio"
                name="road_candidate"
                checked={selectedSegmentId === null}
                onChange={() => {
                  setSelectedSegmentId(null);
                  setSelectedRoadName('Unmatched Road / Other Corridor');
                }}
                className="mt-1"
              />
              <div className="text-xs">
                <div className="font-bold text-slate-900 dark:text-white">
                  Road Not Listed / Unmatched Corridor
                </div>
                <div className="text-slate-500">
                  Observation will be recorded at exact coordinates without canonical segment link.
                </div>
              </div>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-1/3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleProceedToDuplicateCheck}
              className="w-2/3 py-2 bg-slate-900 hover:bg-black dark:bg-amber-600 text-white font-bold text-xs rounded-lg transition"
            >
              Next: Check Nearby Issues →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: DUPLICATE INCIDENT SUGGESTIONS */}
      {step === 3 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Duplicate Check</h1>
            <p className="text-xs text-slate-500 mt-1">
              Are you reporting one of these existing issues nearby?
            </p>
          </div>

          {duplicates.length > 0 ? (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-300 rounded-lg">
                Found {duplicates.length} active issue(s) within 100m. You can corroborate an existing issue or continue reporting a distinct new issue.
              </div>

              {duplicates.map((dup: any) => (
                <div
                  key={dup.id}
                  className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white uppercase">
                      {dup.category.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Reported {new Date(dup.first_observed_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    Location: {dup.road_name || 'Corridor'} • Reports: {dup.reports_count}
                  </p>
                  <Link
                    href={`/incidents/${dup.id}`}
                    className="inline-block font-bold text-amber-600 hover:underline"
                  >
                    → Corroborate This Existing Issue Instead
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 rounded-lg">
              ✓ No active duplicate issues found nearby. Proceed with new report.
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-1/3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="w-2/3 py-2 bg-slate-900 hover:bg-black dark:bg-amber-600 text-white font-bold text-xs rounded-lg transition"
            >
              {duplicates.length > 0 ? 'Report Distinct New Issue →' : 'Next: Observation Details →'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: OBSERVATION DETAILS */}
      {step === 4 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Observation Details</h1>
            <p className="text-xs text-slate-500 mt-1">
              Describe the road surface condition and upload photographic evidence.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-xs p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="pothole">Pothole / Crater</option>
              <option value="dug_open">Dug Open Road / Utility Trench</option>
              <option value="damaged_surface">Damaged Surface / Stripped Tar</option>
              <option value="waterlogging">Waterlogging / Drainage Overflow</option>
              <option value="debris">Construction Debris / Mud Mound</option>
              <option value="missing_signage">Missing Signage / Barricades</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Observed Status</label>
            <select
              value={observedStatus}
              onChange={(e) => setObservedStatus(e.target.value)}
              className="w-full text-xs p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="damaged">Damaged (Rough surface, reduced speed)</option>
              <option value="hazardous">Hazardous (Immediate risk of wheel puncture / fall)</option>
              <option value="passable_with_care">Passable with Care (Slow crawl required)</option>
              <option value="impassable">Impassable (Blocked / Flooded)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description & Landmark Notes *
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. Deep trench across whole left lane opposite Petrol Pump. Causing severe morning congestion."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            ></textarea>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Add Photo Evidence (Optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
            />
            {photoName && (
              <span className="text-[11px] text-emerald-600 block mt-1">
                ✓ Photo selected: {photoName} (EXIF metadata will be stripped automatically)
              </span>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="w-1/3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!description.trim()}
              onClick={() => setStep(5)}
              className="w-2/3 py-2 bg-slate-900 hover:bg-black dark:bg-amber-600 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
            >
              Next: Review & Submit →
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW & SUBMIT / OFFLINE SAVE */}
      {step === 5 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Review Observation</h1>
            <p className="text-xs text-slate-500 mt-1">
              Verify your report before publishing to the civic observability record.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Corridor:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{selectedRoadName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Category:</span>
              <span className="font-semibold uppercase text-slate-900 dark:text-white">{category.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Observed Status:</span>
              <span className="font-semibold uppercase text-slate-900 dark:text-white">{observedStatus}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Coordinates:</span>
              <span className="font-mono text-slate-900 dark:text-white">{lat.toFixed(5)}, {lon.toFixed(5)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 block mb-1">Description:</span>
              <p className="text-slate-800 dark:text-slate-200 italic">&quot;{description}&quot;</p>
            </div>
            {photoName && (
              <div className="text-emerald-600 text-[11px] pt-1">
                ✓ Includes photo attachment ({photoName})
              </div>
            )}
          </div>

          {submitError && (
            <div className="p-3 bg-red-100 text-red-700 text-xs rounded-lg">
              Error submitting report: {submitError}
            </div>
          )}

          {draftSaved && (
            <div className="p-3 bg-emerald-100 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
              <span>✓ Draft saved to local device! View in offline drafts queue.</span>
              <Link href="/drafts" className="font-bold underline">
                View Drafts →
              </Link>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitOnline}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-lg transition disabled:opacity-50 shadow-sm"
            >
              {submitting ? 'Submitting to Civic Record...' : 'Publish Observation Online'}
            </button>

            <button
              type="button"
              onClick={handleSaveOfflineDraft}
              className="w-full py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg transition"
            >
              💾 Save as Offline Draft (Sync Later)
            </button>
          </div>

          <button
            type="button"
            onClick={() => setStep(4)}
            className="w-full py-1 text-center text-xs text-slate-400 hover:text-slate-600"
          >
            ← Modify Details
          </button>
        </div>
      )}
    </main>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <main className="max-w-xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded"></div>
        </div>
      </main>
    }>
      <ReportWizard />
    </Suspense>
  );
}

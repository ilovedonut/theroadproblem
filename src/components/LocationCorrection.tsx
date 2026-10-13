"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { AccountPanel } from "./AccountPanel";
const LocationPicker = dynamic(
  () => import("./LocationPicker").then((m) => m.LocationPicker),
  { ssr: false },
);
export function LocationCorrection({
  incidentId,
  lat,
  lon,
}: {
  incidentId: string;
  lat: number;
  lon: number;
}) {
  const [open, setOpen] = useState(false),
    [pin, setPin] = useState({ lat, lon }),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [submitted, setSubmitted] = useState(false);
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 my-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Is the pin in the right place?</h2>
          <p className="text-sm text-slate-400 mt-1">
            Suggest a more accurate location for this issue.
          </p>
        </div>
        <button className="evidence-secondary" onClick={() => setOpen(!open)}>
          {open ? "Close correction" : "Suggest location correction"}
        </button>
      </div>
      {submitted && (
        <p role="status" className="text-cyan-200 text-sm">
          Correction submitted for moderator review. The public pin stays where
          it is until approved.
        </p>
      )}
      {open && !submitted && (
        <>
          <LocationPicker
            value={pin}
            original={{ lat, lon }}
            onChange={setPin}
          />
          <p className="text-sm text-slate-400">
            Corrections can move a pin up to 500 m. Report a separate issue for
            another location.
          </p>
          <label className="block text-sm">
            Why should the pin move?
            <textarea
              className="evidence-input"
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example, the damage is on the opposite side of the junction."
            />
          </label>
          <AccountPanel />
          {error && (
            <p role="alert" className="text-rose-300 text-sm">
              {error}
            </p>
          )}
          <button
            className="evidence-primary"
            disabled={
              busy ||
              reason.trim().length < 5 ||
              (pin.lat === lat && pin.lon === lon)
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const res = await fetch(
                  `/api/v1/incidents/${incidentId}/corrections`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...pin, reason }),
                  },
                );
                const json = await res.json();
                if (!res.ok) throw new Error(json.error);
                setSubmitted(true);
                setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not submit correction.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Submitting…" : "Submit correction for review"}
          </button>
        </>
      )}
    </section>
  );
}

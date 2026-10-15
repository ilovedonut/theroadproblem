"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const LocationPicker = dynamic(
  () => import("./LocationPicker").then((m) => m.LocationPicker),
  { ssr: false },
);
function Review({ item, onReviewed }: { item: any; onReviewed: () => void }) {
  const [reason, setReason] = useState(""),
    [segment, setSegment] = useState(""),
    [roads, setRoads] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/v1/roads/nearest?lat=${item.lat}&lon=${item.lon}&radius=150`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error("Could not load roads.");
        setRoads(j.candidates || []);
      })
      .catch(() =>
        setError(
          "Road lookup failed. Retry before accepting, or explicitly leave the issue unmatched.",
        ),
      );
  }, [item.lat, item.lon]);
  async function review(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/mod/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          action,
          reason,
          segment_id: segment || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onReviewed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-xl border border-line bg-surface p-5 space-y-3">
      <p className="text-sm text-muted">
        {item.display_name} · {new Date(item.created_at).toLocaleString()}
      </p>
      <p>{item.reason}</p>
      <LocationPicker
        value={{ lat: item.lat, lon: item.lon }}
        original={{ lat: item.old_lat, lon: item.old_lon }}
        readOnly
      />
      {item.stale && (
        <p className="text-warning text-sm">
          This proposal is stale. Reject it and request a new location.
        </p>
      )}
      <label className="block text-sm">
        Road association after acceptance
        <select
          className="evidence-input"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
        >
          <option value="">Leave unmatched / road uncertain</option>
          {roads.map((r) => (
            <option key={r.segment_id} value={r.segment_id}>
              {r.road_name || r.road_ref || "Unnamed road"} · {r.distance_m} m
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Review reason
        <textarea
          className="evidence-input"
          value={reason}
          maxLength={2000}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          className="evidence-primary"
          disabled={busy || item.stale || reason.trim().length < 5}
          onClick={() => void review("accept")}
        >
          Accept correction
        </button>
        <button
          className="evidence-secondary"
          disabled={busy || reason.trim().length < 5}
          onClick={() => void review("reject")}
        >
          Reject
        </button>
      </div>
    </article>
  );
}
export function CorrectionQueue() {
  const [items, setItems] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/v1/mod/corrections");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setItems(j.corrections);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load corrections.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const listener = () => void load();
    window.addEventListener("trp-account-changed", listener);
    return () => window.removeEventListener("trp-account-changed", listener);
  }, []);
  return (
    <section className="space-y-4 my-6">
      <h2 className="text-xl font-semibold">Location corrections</h2>
      {loading ? (
        <p>Loading corrections…</p>
      ) : error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : items.length ? (
        items.map((i) => (
          <Review key={i.id} item={i} onReviewed={() => void load()} />
        ))
      ) : (
        <p className="text-muted">No pending corrections.</p>
      )}
      <button className="evidence-secondary" onClick={() => void load()}>
        Refresh corrections
      </button>
    </section>
  );
}

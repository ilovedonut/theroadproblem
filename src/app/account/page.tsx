"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";
export default function AccountPage() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/v1/account/contributions");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) {
      setData(null);
      setError(
        e instanceof Error ? e.message : "Unable to load contributions.",
      );
    }
  }
  useEffect(() => {
    void load();
    const listener = () => void load();
    window.addEventListener("trp-account-changed", listener);
    return () => window.removeEventListener("trp-account-changed", listener);
  }, []);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-3xl font-semibold">Your account</h1>
        <AccountPanel />
        <div className="flex gap-5 text-sm">
          <Link href="/report" className="text-cyan-300 underline">
            Add evidence
          </Link>
          <Link href="/drafts" className="text-cyan-300 underline">
            Saved drafts
          </Link>
        </div>
        {error && <p className="text-sm text-slate-400">{error}</p>}
        {data && (
          <>
            <h2 className="text-xl font-semibold">My contributions</h2>
            {!data.reports.length && (
              <p className="text-slate-400">
                Your submitted evidence will appear here.
              </p>
            )}
            {data.reports.map((r: any) => (
              <Link
                key={r.id}
                href={`/incidents/${r.incident_id}`}
                className="block rounded-xl border border-slate-700 p-4"
              >
                <p className="font-medium">
                  {r.category.replace(/_/g, " ")} · {r.publication_status}
                </p>
                <p className="text-sm text-slate-400 mt-1">{r.description}</p>
              </Link>
            ))}
            <h2 className="text-xl font-semibold">My location corrections</h2>
            {!data.corrections.length && (
              <p className="text-slate-400">
                You haven’t suggested a correction yet.
              </p>
            )}
            {data.corrections.map((c: any) => (
              <Link
                key={c.id}
                href={`/incidents/${c.incident_id}`}
                className="block rounded-xl border border-slate-700 p-4"
              >
                <p className="font-medium capitalize">{c.status}</p>
                <p className="text-sm text-slate-400">{c.reason}</p>
                {c.review_reason && (
                  <p className="text-sm mt-2">Review: {c.review_reason}</p>
                )}
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

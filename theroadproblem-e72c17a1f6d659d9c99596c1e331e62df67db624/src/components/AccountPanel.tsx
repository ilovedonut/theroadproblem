"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export function AccountPanel({ onVerified }: { onVerified?: () => void }) {
  const [account, setAccount] = useState<{
    display_name: string;
    role: string;
  } | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function load() {
    try {
      const res = await fetch("/api/v1/account");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAccount(json.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your account.");
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit(action: "send" | "verify") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          email,
          code,
          display_name: name || "Community contributor",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (action === "send") {
        setSent(true);
        setCooldown(60);
      } else {
        await load();
        window.dispatchEvent(new Event("trp-account-changed"));
        onVerified?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-2xl border border-line bg-surface p-5 space-y-4"
      aria-label="Your account"
    >
      <div>
        <h2 className="text-lg font-semibold text-ink">
          {account
            ? `Hello, ${account.display_name}`
            : "Verify your email to contribute"}
        </h2>
        <p className="text-sm text-muted mt-1">
          {account
            ? "Your contributions are linked to your account."
            : "A one-time code signs you in. Your email stays private; your display name appears with your evidence."}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!loaded ? (
        <p className="text-sm text-muted">Checking your account…</p>
      ) : account ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/account" className="text-information underline">
            My contributions
          </Link>
          {["moderator", "admin"].includes(account.role) && (
            <Link href="/mod" className="text-information underline">
              Review corrections
            </Link>
          )}
          <button
            onClick={async () => {
              const res = await fetch("/api/v1/account", { method: "DELETE" });
              if (res.ok) {
                setAccount(null);
                setSent(false);
                setCode("");
                window.dispatchEvent(new Event("trp-account-changed"));
              } else setError("Unable to sign out. Please try again.");
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(sent ? "verify" : "send");
          }}
          className="space-y-3"
        >
          {!sent && (
            <label className="block text-sm">
              Display name
              <input
                className="evidence-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="How you appear publicly"
                autoComplete="nickname"
              />
            </label>
          )}
          <label className="block text-sm">
            Email
            <input
              className="evidence-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              readOnly={sent}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {sent && (
            <>
              <p role="status" className="text-sm text-information">
                Check your inbox for a code sent to {email}.
              </p>
              <label className="block text-sm">
                Verification code
                <input
                  className="evidence-input tracking-widest"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,8}"
                  maxLength={8}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </label>
            </>
          )}
          <button className="evidence-primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : sent
                ? "Verify & sign in"
                : "Send verification code"}
          </button>
          {sent && (
            <div className="flex gap-4 text-sm">
              <button
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => void submit("send")}
                className="text-information disabled:text-quiet"
              >
                {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setCode("");
                  setError("");
                }}
              >
                Change email
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

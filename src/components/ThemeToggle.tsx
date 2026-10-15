"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setReady(true);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("trp-theme"); } catch {}
      if (saved !== "light" && saved !== "dark") apply(media.matches);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function apply(next: boolean) {
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#211f1b" : "#faf9f7");
    setDark(next);
  }

  return (
    <button
      type="button"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-soft"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      disabled={!ready}
      onClick={() => {
        const next = !dark;
        try { localStorage.setItem("trp-theme", next ? "dark" : "light"); } catch {}
        apply(next);
      }}
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

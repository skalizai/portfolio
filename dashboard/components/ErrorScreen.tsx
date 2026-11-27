"use client";

import { useEffect } from "react";

const RELOADED = "error-reloaded-at";

/** After a new version goes live, a tab left open asks for files that no longer exist. */
const isStaleVersion = (error: Error) => /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to load|server action/i.test(`${error.name} ${error.message}`);

/** Shown instead of a blank "Application error". Reloads once by itself when the page is from an older version. */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    if (!isStaleVersion(error)) return;
    try {
      const last = Number(sessionStorage.getItem(RELOADED) ?? 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <div role="alert" className="mx-auto my-16 max-w-md rounded-[1.75rem] border border-line bg-surface p-6 text-center sm:p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-dim">This page hit a problem. If the dashboard was just updated, reloading picks up the new version.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-dim">Reference {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="bg-gradient-accent h-11 cursor-pointer rounded-xl px-5 text-sm font-semibold text-on-accent">
          Reload the page
        </button>
        <button type="button" onClick={reset} className="h-11 cursor-pointer rounded-xl border border-line-strong px-5 text-sm font-medium">
          Try again
        </button>
      </div>
    </div>
  );
}

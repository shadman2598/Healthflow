"use client";

import Link from "next/link";

export default function AppError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900">This page broke</h1>
      <p className="mt-2 max-w-md text-base text-slate-600">
        Refresh once. If you were looking around as a guest, go home and tap Continue as guest again.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" className="btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link className="btn-secondary" href="/">
          Go home
        </Link>
      </div>
    </div>
  );
}

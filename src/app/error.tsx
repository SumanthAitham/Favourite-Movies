"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="app-loading">
      <span className="eyebrow">A BRIEF INTERMISSION</span>
      <h1>We lost the scene.</h1>
      <p>Something went wrong loading this page. Please try again.</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
      <Link href="/">Back to Discover</Link>
    </main>
  );
}

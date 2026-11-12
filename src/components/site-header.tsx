"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { ArrowUpRight, Aperture, LoaderCircle, LogOut } from "lucide-react";
import { signInWithGoogle, signOutUser } from "@/actions/auth";
import type { Viewer } from "@/lib/types";

export function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M21.8 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.4c2-1.8 2.9-4.4 2.9-7.7Z"
        fill="currentColor"
      />
      <path
        d="M12 22c2.7 0 4.9-.9 6.5-2.4l-3.3-2.6c-.9.6-2 1-3.2 1a6 6 0 0 1-5.7-4.1H2.9v2.7A10 10 0 0 0 12 22Z"
        fill="currentColor"
        opacity=".8"
      />
      <path
        d="M6.3 13.9a6 6 0 0 1 0-3.8V7.4H2.9a10 10 0 0 0 0 9.2l3.4-2.7Z"
        fill="currentColor"
        opacity=".6"
      />
      <path
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.4l3.4 2.7A6 6 0 0 1 12 6Z"
        fill="currentColor"
        opacity=".9"
      />
    </svg>
  );
}

export function SiteHeader({
  viewer,
  authReady,
}: {
  viewer: Viewer | null;
  authReady: boolean;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="wordmark" href="/" aria-label="Movie Memory home">
          <span className="brand-icon">
            <Aperture size={23} strokeWidth={1.7} />
          </span>
          <span>
            Movie<span className="wordmark-second">Memory</span>
            <span className="brand-period">.</span>
          </span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link
            href="/"
            className={pathname === "/" ? "nav-link active" : "nav-link"}
            aria-current={pathname === "/" ? "page" : undefined}
          >
            Discover
          </Link>
          {viewer && (
            <Link
              href="/dashboard"
              className={
                pathname === "/dashboard" ? "nav-link active" : "nav-link"
              }
              aria-current={pathname === "/dashboard" ? "page" : undefined}
            >
              My collection
            </Link>
          )}
        </nav>
        <div className="header-actions">
          {viewer ? (
            <button
              type="button"
              className="button button-ghost button-small"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await signOutUser();
                })
              }
            >
              {pending ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <LogOut size={16} />
              )}
              <span>Sign out</span>
            </button>
          ) : (
            <button
              type="button"
              className="button button-outline button-small google-signin"
              title={
                !authReady ? "Google sign-in isn’t available yet" : undefined
              }
              disabled={pending || !authReady}
              onClick={() =>
                startTransition(async () => {
                  await signInWithGoogle();
                })
              }
            >
              {pending ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <GoogleMark />
              )}
              <span>Sign in with Google</span>
              <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

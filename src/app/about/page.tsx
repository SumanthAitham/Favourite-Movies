import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentUser, isAuthConfigured } from "@/lib/session";

export const metadata: Metadata = { title: "About & credits" };
export const dynamic = "force-dynamic";

export default async function About() {
  const viewer = await getCurrentUser();
  return (
    <>
      <SiteHeader viewer={viewer} authReady={isAuthConfigured()} />
      <main id="main-content" className="shell prose-page">
        <p className="eyebrow">ABOUT & CREDITS</p>
        <h1>For the love of cinema.</h1>
        <p>
          Movie Memory is a personal home for the films that stay with you.
          Explore by genre, save your favorites, and discover a little story
          behind each one.
        </p>
        <h2>The movies</h2>
        <a href="https://www.themoviedb.org" aria-label="The Movie Database">
          <Image
            src="/tmdb-logo.svg"
            width={130}
            height={17}
            alt="TMDB"
            unoptimized
          />
        </a>
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
        <p>
          Movie titles, release information, genres, and images are provided by{" "}
          <a href="https://www.themoviedb.org">The Movie Database</a>. Movie
          imagery belongs to its respective owners.
        </p>
        <h2>The little stories</h2>
        <p>
          The “Did you know?” facts are generated with Google Gemini. They are not
          independently verified and may contain mistakes. They are intended as
          a starting point for curiosity.
        </p>
        <h2>Your collection</h2>
        <p>
          Google sign-in keeps your favorites and generated facts connected to
          your account. Your collection is personal, and your saved movies
          remain yours even when a new fact can’t be loaded.
        </p>
        <Link href="/" className="button button-outline">
          Back to Discover
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}

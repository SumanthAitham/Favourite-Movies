"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Film,
  Heart,
  LoaderCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type { MovieSummary, Viewer } from "@/lib/types";
import { errorMessage, requestJson } from "./client-api";
import { FactDialog } from "./fact-dialog";
import { MovieCard } from "./movie-card";

export function Dashboard({
  viewer,
  favorites,
  pendingMovie,
}: {
  viewer: Viewer;
  favorites: MovieSummary[];
  pendingMovie?: MovieSummary | null;
}) {
  const router = useRouter();
  const [movies, setMovies] = useState(favorites);
  const [activeMovie, setActiveMovie] = useState<MovieSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const busyRef = useRef(new Set<number>());
  const handledPending = useRef<number | null>(null);
  const [pendingFailed, setPendingFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const firstName = viewer.name?.trim().split(/\s+/)[0] || "film lover";
  const initials =
    viewer.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "M";

  const savePending = useCallback(
    async (movie: MovieSummary) => {
      if (busyRef.current.has(movie.tmdbId)) return;
      busyRef.current.add(movie.tmdbId);
      setBusyIds(new Set(busyRef.current));
      setPendingFailed(false);
      setMessage(null);
      try {
        const result = await requestJson<{ movie: MovieSummary }>(
          "/api/favorites",
          { method: "POST", body: JSON.stringify({ tmdbId: movie.tmdbId }) },
        );
        setMovies((previous) =>
          previous.some((item) => item.tmdbId === movie.tmdbId)
            ? previous
            : [result.movie, ...previous],
        );
        setActiveMovie(result.movie);
        router.replace("/dashboard", { scroll: false });
      } catch (cause) {
        setMessage(errorMessage(cause));
        setPendingFailed(true);
      } finally {
        busyRef.current.delete(movie.tmdbId);
        setBusyIds(new Set(busyRef.current));
      }
    },
    [router],
  );

  useEffect(() => {
    if (pendingMovie && handledPending.current !== pendingMovie.tmdbId) {
      handledPending.current = pendingMovie.tmdbId;
      void savePending(pendingMovie);
    }
  }, [pendingMovie, savePending]);

  async function remove(movie: MovieSummary) {
    if (busyRef.current.has(movie.tmdbId)) return;
    busyRef.current.add(movie.tmdbId);
    setBusyIds(new Set(busyRef.current));
    setMessage(null);
    try {
      await requestJson(`/api/favorites/${movie.tmdbId}`, { method: "DELETE" });
      setMovies((previous) =>
        previous.filter((item) => item.tmdbId !== movie.tmdbId),
      );
      if (activeMovie?.tmdbId === movie.tmdbId) setActiveMovie(null);
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      busyRef.current.delete(movie.tmdbId);
      setBusyIds(new Set(busyRef.current));
    }
  }

  return (
    <section className="shell dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <p className="eyebrow">
            <span className="live-dot" /> YOUR PERSONAL FILM ARCHIVE
          </p>
          <h1>
            Welcome back,
            <br />
            <em>{firstName}.</em>
          </h1>
          <p>The stories you love. All in one place.</p>
        </div>
        <div className="profile-card">
          <div className="profile-avatar">
            {viewer.image && !photoFailed ? (
              <Image
                src={viewer.image}
                alt=""
                width={56}
                height={56}
                unoptimized
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div>
            <strong>{viewer.name || "Movie lover"}</strong>
            <p>{viewer.email || "Signed in with Google"}</p>
            <span className="profile-label">
              <Check size={11} /> YOUR COLLECTION
            </span>
          </div>
        </div>
      </div>
      <div className="collection-toolbar">
        <div>
          <h2>
            My collection{" "}
            <span className="collection-count">{movies.length}</span>
          </h2>
          <p>A good film is always worth keeping.</p>
        </div>
        <Link href="/#discover" className="button button-outline button-small">
          <Plus size={15} /> Discover more
        </Link>
      </div>
      {message && (
        <div className="notification" role="alert">
          <span>{message}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {pendingMovie && busyIds.has(pendingMovie.tmdbId) && (
        <div className="pending-notice" role="status">
          <LoaderCircle size={16} className="spin" /> Saving{" "}
          {pendingMovie.title} to your collection…
        </div>
      )}
      {pendingMovie && pendingFailed && (
        <div className="pending-notice">
          <span>
            Your selection is still here: <strong>{pendingMovie.title}</strong>.
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => void savePending(pendingMovie)}
          >
            Try saving again <ArrowRight size={14} />
          </button>
        </div>
      )}
      {movies.length ? (
        <>
          <div className="collection-tip">
            <Sparkles size={15} />
            <span>
              There’s more to every movie. Open <strong>“Did you know?”</strong>{" "}
              to discover a little detail.
            </span>
          </div>
          <div className="movie-grid collection-grid">
            {movies.map((movie) => (
              <MovieCard
                movie={movie}
                key={movie.tmdbId}
                saved
                busy={busyIds.has(movie.tmdbId)}
                onFavorite={() => void remove(movie)}
                onFact={() => setActiveMovie(movie)}
              />
            ))}
          </div>
          <div className="collection-end">
            <Heart size={15} />
            <span>
              {movies.length === 1
                ? "One great film. The beginning of a collection."
                : `${movies.length} films. Countless reasons to love cinema.`}
            </span>
          </div>
        </>
      ) : (
        <div className="collection-empty">
          <div className="empty-film-stack">
            <span />
            <span />
            <div>
              <Film size={35} strokeWidth={1.1} />
              <Bookmark size={16} className="empty-bookmark" />
            </div>
          </div>
          <p className="eyebrow">EVERY COLLECTION STARTS SOMEWHERE</p>
          <h2>What’s a film you can’t forget?</h2>
          <p>
            Find a favorite, tap the heart, and make yourself at home.
            <br />A little movie trivia is waiting on the other side.
          </p>
          <Link href="/#discover" className="button button-primary">
            Find your first favorite <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      <FactDialog
        key={activeMovie?.tmdbId || "closed"}
        movie={activeMovie}
        onClose={() => setActiveMovie(null)}
      />
    </section>
  );
}

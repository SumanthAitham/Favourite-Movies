"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Heart,
  LoaderCircle,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { MoviePage, MovieSummary, Viewer } from "@/lib/types";
import { errorMessage, requestJson } from "./client-api";
import { FactDialog } from "./fact-dialog";
import { MovieCard, MoviePoster } from "./movie-card";

export function Onboarding({
  viewer,
  pendingMovie,
  pendingError,
}: {
  viewer: Viewer;
  pendingMovie?: MovieSummary | null;
  pendingError?: string;
}) {
  const [selection, setSelection] = useState<MovieSummary | null>(
    pendingMovie || null,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MoviePage | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(pendingError || null);
  const [activeMovie, setActiveMovie] = useState<MovieSummary | null>(null);
  const controller = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  const firstName = viewer.name?.trim().split(/\s+/)[0];

  async function search(page = 1) {
    const text = page > 1 ? searchedQuery : query.trim();
    if (!text) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(null);
    if (page === 1) {
      setResults(null);
      setSearchedQuery(text);
    }
    try {
      const data = await requestJson<MoviePage>(
        `/api/movies?query=${encodeURIComponent(text)}&page=${page}`,
        { signal: request.signal },
      );
      if (!request.signal.aborted)
        setResults((previous) =>
          page > 1 && previous
            ? {
                ...data,
                movies: [
                  ...previous.movies,
                  ...data.movies.filter(
                    (movie) =>
                      !previous.movies.some(
                        (existing) => existing.tmdbId === movie.tmdbId,
                      ),
                  ),
                ],
              }
            : data,
        );
    } catch (cause) {
      if (!request.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  async function save() {
    if (!selection || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await requestJson<{ movie: MovieSummary }>(
        "/api/favorites",
        {
          method: "POST",
          body: JSON.stringify({ tmdbId: selection.tmdbId, onboarding: true }),
        },
      );
      setSaved(true);
      setSelection(result.movie);
      setActiveMovie(result.movie);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  }

  return (
    <section className="shell onboarding-page">
      <div className="onboarding-intro">
        <span className="onboarding-icon">
          <Heart size={24} strokeWidth={1.4} />
        </span>
        <p className="eyebrow">THE START OF SOMETHING GOOD</p>
        <h1>
          {saved ? (
            <>
              Your collection
              <br />
              <em>starts here.</em>
            </>
          ) : (
            <>
              First, a film
              <br />
              <em>you love.</em>
            </>
          )}
        </h1>
        <p>
          {saved
            ? "Your first favorite is saved. There’s a whole world of movies waiting for you."
            : `${firstName ? `Welcome, ${firstName}. ` : "Welcome. "}That one you always come back to? Let’s give it a home.`}
        </p>
      </div>
      {error && (
        <div className="notification" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {selection && (
        <section
          className={`onboarding-selection${saved ? " confirmed" : ""}`}
          aria-label="Selected movie"
        >
          <div className="selection-poster">
            <MoviePoster movie={selection} />
          </div>
          <div className="selection-info">
            <p className="eyebrow">
              {saved
                ? "YOUR FIRST FAVORITE"
                : pendingMovie?.tmdbId === selection.tmdbId
                  ? "YOU PICKED A GOOD ONE"
                  : "YOUR SELECTION"}
            </p>
            <h2>{selection.title}</h2>
            <p>{selection.releaseYear || "Year unavailable"}</p>
            {saved ? (
              <span className="selection-saved">
                <Check size={14} /> Added to your collection
              </span>
            ) : (
              <p className="selection-hint">
                Save this film to start your collection.
              </p>
            )}
          </div>
          {!saved && (
            <button
              type="button"
              className="button button-primary selection-button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Heart size={16} />
              )}{" "}
              {saving ? "Saving…" : "Save my first favorite"}
            </button>
          )}
        </section>
      )}
      {saved ? (
        <div className="onboarding-success">
          <button
            type="button"
            className="text-button"
            onClick={() => setActiveMovie(selection)}
          >
            <Sparkles size={15} /> Discover a fact about your film
          </button>
          <Link href="/dashboard" className="button button-primary">
            Go to my collection <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <section className="onboarding-search">
          <div className="onboarding-search-heading">
            <h2>
              {selection
                ? "Or find another favorite"
                : "Which movie comes to mind?"}
            </h2>
            <span>SEARCH THE BIG SCREEN</span>
          </div>
          <form
            className="search-form onboarding-search-form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <Search size={20} />
            <label className="sr-only" htmlFor="onboarding-search">
              Search for your favorite movie
            </label>
            <input
              type="search"
              id="onboarding-search"
              placeholder="Search a movie title…"
              value={query}
              maxLength={200}
              disabled={saving}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              className="button button-primary button-small"
              type="submit"
              disabled={!query.trim() || loading || saving}
            >
              {loading ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              <span>Search</span>
            </button>
          </form>
          <p className="search-note">
            Pick a film below, then confirm it to finish setting up your
            collection.
          </p>
          {loading && !results && (
            <div className="search-loading" role="status">
              <LoaderCircle className="spin" size={18} /> Searching the
              archives…
            </div>
          )}
          {results && (
            <>
              <p className="search-results-label">
                {results.movies.length
                  ? `Results for “${searchedQuery}”`
                  : `No movies found for “${searchedQuery}”. Try another title.`}
              </p>
              <div className="movie-grid onboarding-grid">
                {results.movies.map((movie) => (
                  <MovieCard
                    key={movie.tmdbId}
                    movie={movie}
                    selected={selection?.tmdbId === movie.tmdbId}
                    onSelect={() => {
                      if (!saving) {
                        setSelection(movie);
                        setError(null);
                        window.scrollTo({ top: 200, behavior: "smooth" });
                      }
                    }}
                  />
                ))}
              </div>
              {results.page < results.totalPages && (
                <div className="load-more-wrap">
                  <button
                    type="button"
                    className="button button-outline button-small"
                    disabled={loading || saving}
                    onClick={() => void search(results.page + 1)}
                  >
                    {loading && <LoaderCircle size={15} className="spin" />}{" "}
                    Load more results
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      <FactDialog
        key={activeMovie?.tmdbId || "closed"}
        movie={activeMovie}
        onClose={() => setActiveMovie(null)}
        continueHref="/dashboard"
      />
    </section>
  );
}

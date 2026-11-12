"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Aperture,
  Bookmark,
  Film,
  Heart,
  LoaderCircle,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { signInWithGoogle } from "@/actions/auth";
import type {
  Genre,
  GenreSection,
  MoviePage,
  MovieSummary,
  Viewer,
} from "@/lib/types";
import { errorMessage, requestJson } from "./client-api";
import { MovieCard } from "./movie-card";
import { FactDialog } from "./fact-dialog";

type View = { kind: "genre"; genre: Genre } | { kind: "search"; query: string };

function CinemaArtwork() {
  return (
    <div className="cinema-art" aria-hidden="true">
      <div className="cinema-art-grid" />
      <span className="art-corner top-left" />
      <span className="art-corner top-right" />
      <span className="art-corner bottom-left" />
      <span className="art-corner bottom-right" />
      <div className="art-topline">
        <span>THE MOVIE MEMORY CLUB</span>
        <span>35 MM</span>
      </div>
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-orbit orbit-three" />
      <span className="art-orbit-dot" />
      <div className="art-type">
        <span>For the love</span>
        <em>of cinema.</em>
      </div>
      <div className="art-bottomline">
        <Aperture size={24} strokeWidth={1} />
        <span>
          KEEP THE FILMS.
          <br />
          FIND THE STORIES.
        </span>
        <span className="art-frame-number">001</span>
      </div>
      <div className="art-ticket">
        <span className="ticket-star">✳</span>
        <div>
          A good film
          <br />
          <em>stays with you.</em>
        </div>
        <span className="ticket-small">
          ADMIT ONE
          <br />
          TO YOUR COLLECTION
        </span>
      </div>
    </div>
  );
}

export function Catalog({
  sections,
  genres,
  viewer,
  initialFavoriteIds,
  authReady,
  catalogError,
  needsOnboarding = false,
}: {
  sections: GenreSection[];
  genres: Genre[];
  viewer: Viewer | null;
  initialFavoriteIds: number[];
  authReady: boolean;
  catalogError?: string;
  needsOnboarding?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() =>
    sections.map((section) => ({ ...section, page: 1 })),
  );
  const [favoriteIds, setFavoriteIds] = useState(
    () => new Set(initialFavoriteIds),
  );
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const inFlightFavorites = useRef(new Set<number>());
  const [activeMovie, setActiveMovie] = useState<MovieSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [results, setResults] = useState<MoviePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [loadingGenre, setLoadingGenre] = useState<number | null>(null);
  const resultRequest = useRef<AbortController | null>(null);
  const [, startTransition] = useTransition();

  async function loadView(nextView: View, page = 1, append = false) {
    resultRequest.current?.abort();
    const controller = new AbortController();
    resultRequest.current = controller;
    setLoading(true);
    setResultsError(null);
    if (!append) setResults(null);
    const parameters = new URLSearchParams({ page: String(page) });
    if (nextView.kind === "genre")
      parameters.set("genre", String(nextView.genre.id));
    else parameters.set("query", nextView.query);
    try {
      const data = await requestJson<MoviePage>(`/api/movies?${parameters}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        setResults((previous) =>
          append && previous
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
      if (!controller.signal.aborted) setResultsError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function chooseView(nextView: View | null) {
    setView(nextView);
    setMessage(null);
    if (nextView) void loadView(nextView);
    else {
      resultRequest.current?.abort();
      setResults(null);
      setResultsError(null);
      setLoading(false);
      setQuery("");
    }
  }

  async function loadGenre(genre: Genre) {
    const row = rows.find((item) => item.genre.id === genre.id);
    if (!row || loadingGenre !== null) return;
    setLoadingGenre(genre.id);
    setMessage(null);
    try {
      const data = await requestJson<MoviePage>(
        `/api/movies?genre=${genre.id}&page=${row.page + 1}`,
      );
      setRows((previous) =>
        previous.map((item) =>
          item.genre.id === genre.id
            ? {
                ...item,
                page: data.page,
                totalPages: data.totalPages,
                movies: [
                  ...item.movies,
                  ...data.movies.filter(
                    (movie) =>
                      !item.movies.some(
                        (existing) => existing.tmdbId === movie.tmdbId,
                      ),
                  ),
                ],
              }
            : item,
        ),
      );
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setLoadingGenre(null);
    }
  }

  async function favorite(movie: MovieSummary) {
    if (!viewer) {
      if (!authReady) {
        setMessage(
          "Google sign-in isn’t available yet. Please try again later.",
        );
        return;
      }
      startTransition(async () => {
        await signInWithGoogle(movie.tmdbId);
      });
      return;
    }
    if (needsOnboarding) {
      router.push(`/onboarding?movie=${movie.tmdbId}`);
      return;
    }
    if (inFlightFavorites.current.has(movie.tmdbId)) return;
    inFlightFavorites.current.add(movie.tmdbId);
    setBusyIds(new Set(inFlightFavorites.current));
    setMessage(null);
    try {
      if (favoriteIds.has(movie.tmdbId)) {
        await requestJson(`/api/favorites/${movie.tmdbId}`, {
          method: "DELETE",
        });
        setFavoriteIds((previous) => {
          const next = new Set(previous);
          next.delete(movie.tmdbId);
          return next;
        });
      } else {
        const data = await requestJson<{ movie: MovieSummary }>(
          "/api/favorites",
          { method: "POST", body: JSON.stringify({ tmdbId: movie.tmdbId }) },
        );
        setFavoriteIds((previous) => new Set(previous).add(movie.tmdbId));
        setActiveMovie(data.movie);
      }
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      inFlightFavorites.current.delete(movie.tmdbId);
      setBusyIds(new Set(inFlightFavorites.current));
    }
  }

  return (
    <>
      <section className="shell hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> YOUR PERSONAL CORNER OF CINEMA
          </p>
          <h1 id="hero-title">
            Good films
            <br />
            <em>stay with you.</em>
          </h1>
          <p className="hero-description">
            Find something you love. Keep it close.
            <br />
            Discover the little stories behind the big screen.
          </p>
          <a className="button button-primary hero-cta" href="#discover">
            Find your next favorite <ArrowDown size={16} />
          </a>
          <div className="hero-note">
            <span className="hero-note-icon">
              <Heart size={13} />
            </span>
            A collection that’s entirely yours.
          </div>
        </div>
        <CinemaArtwork />
      </section>
      <div className="shell">
        <div className="feature-strip">
          <span>
            <Film size={16} /> Explore films by genre
          </span>
          <span>
            <Bookmark size={16} /> Save the ones you love
          </span>
          <span>
            <Sparkles size={16} /> Find a little movie magic
          </span>
          <span className="feature-strip-end">
            ROLL THE OPENING CREDITS <ArrowDown size={12} />
          </span>
        </div>
      </div>
      <section
        className="shell catalog-section"
        id="discover"
        aria-labelledby="catalog-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE DISCOVERY ROOM</p>
            <h2 id="catalog-title">
              A film for every feeling<span className="accent">.</span>
            </h2>
          </div>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = query.trim();
              chooseView(trimmed ? { kind: "search", query: trimmed } : null);
            }}
            role="search"
          >
            <Search size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor="catalog-search">
              Search movies
            </label>
            <input
              id="catalog-search"
              type="search"
              placeholder="Find a movie…"
              value={query}
              maxLength={200}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="submit"
              className="search-submit"
              aria-label="Search movies"
            >
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
        {genres.length > 0 && (
          <div className="genre-filters" aria-label="Filter by genre">
            <button
              type="button"
              className={`genre-chip${!view ? " active" : ""}`}
              aria-pressed={!view}
              onClick={() => chooseView(null)}
            >
              All genres
            </button>
            {genres.map((genre) => (
              <button
                type="button"
                key={genre.id}
                className={`genre-chip${view?.kind === "genre" && view.genre.id === genre.id ? " active" : ""}`}
                aria-pressed={
                  view?.kind === "genre" && view.genre.id === genre.id
                }
                onClick={() => {
                  setQuery("");
                  chooseView({ kind: "genre", genre });
                }}
              >
                {genre.name}
              </button>
            ))}
          </div>
        )}
        {catalogError && rows.length > 0 && !view && (
          <p className="notification" role="status">
            {catalogError}
          </p>
        )}
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
        {view ? (
          <div className="genre-section">
            <div className="genre-section-heading">
              <h3>
                {view.kind === "genre"
                  ? view.genre.name
                  : `Results for “${view.query}”`}
              </h3>
              <button
                type="button"
                className="text-button"
                onClick={() => chooseView(null)}
              >
                Clear filter <X size={13} />
              </button>
            </div>
            {results && (
              <CatalogMovies
                movies={results.movies}
                favoriteIds={favoriteIds}
                busyIds={busyIds}
                onFavorite={favorite}
                onFact={setActiveMovie}
              />
            )}
            {loading && !results && <CatalogSkeleton />}
            {resultsError && (
              <div className="empty-state compact" role="alert">
                <Film size={27} />
                <h3>The projector hit a pause.</h3>
                <p>{resultsError}</p>
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={() => void loadView(view)}
                >
                  Try again
                </button>
              </div>
            )}
            {results?.movies.length === 0 && !loading && (
              <div className="empty-state compact">
                <Search size={28} />
                <h3>No films in this frame.</h3>
                <p>Try another title or explore a different genre.</p>
              </div>
            )}
            {results && results.page < results.totalPages && (
              <div className="load-more-wrap">
                <button
                  className="button button-outline button-small"
                  type="button"
                  disabled={loading}
                  onClick={() => void loadView(view, results.page + 1, true)}
                >
                  {loading ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <ArrowDown size={15} />
                  )}{" "}
                  Load more films
                </button>
              </div>
            )}
          </div>
        ) : rows.length ? (
          rows.map((row) => (
            <div className="genre-section" key={row.genre.id}>
              <div className="genre-section-heading">
                <h3>
                  {row.genre.name}{" "}
                  <span className="genre-count">
                    {String(row.movies.length).padStart(2, "0")}
                  </span>
                </h3>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    chooseView({ kind: "genre", genre: row.genre })
                  }
                >
                  Explore genre <ArrowUpRight size={15} />
                </button>
              </div>
              {row.movies.length > 0 ? (
                <CatalogMovies
                  movies={row.movies}
                  favoriteIds={favoriteIds}
                  busyIds={busyIds}
                  onFavorite={favorite}
                  onFact={setActiveMovie}
                  strip
                />
              ) : (
                <p className="muted">
                  No movies are available in this genre yet.
                </p>
              )}
              {row.page < row.totalPages && (
                <div className="load-more-wrap">
                  <button
                    type="button"
                    className="button button-outline button-small"
                    disabled={loadingGenre !== null}
                    onClick={() => void loadGenre(row.genre)}
                  >
                    {loadingGenre === row.genre.id ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <ArrowDown size={15} />
                    )}{" "}
                    More {row.genre.name.toLowerCase()} films
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="catalog-unavailable">
            <div className="empty-projector">
              <Film size={32} strokeWidth={1.1} />
            </div>
            <p className="eyebrow">A BRIEF INTERMISSION</p>
            <h3>
              {catalogError
                ? "The discovery room is warming up."
                : "The next great film is on its way."}
            </h3>
            <p>
              {catalogError ||
                "There are no movies to show just yet. Check back soon for your next favorite."}
            </p>
            <button
              type="button"
              className="button button-outline button-small"
              onClick={() => window.location.reload()}
            >
              Try again <ArrowUpRight size={15} />
            </button>
            <div className="intermission-line">
              <span />
              <Aperture size={14} />
              <span />
            </div>
          </div>
        )}
      </section>
      {!viewer && (
        <section className="shell collection-invitation">
          <div className="invitation-icon">
            <Bookmark size={30} strokeWidth={1.2} />
          </div>
          <div>
            <p className="eyebrow">LESS SCROLLING. MORE REMEMBERING.</p>
            <h2>Your favorites deserve a home.</h2>
            <p>
              Start a personal collection, one unforgettable film at a time.
            </p>
          </div>
          <button
            type="button"
            className="button button-primary"
            disabled={!authReady}
            title={
              !authReady ? "Google sign-in isn’t available yet" : undefined
            }
            onClick={() =>
              startTransition(async () => {
                await signInWithGoogle();
              })
            }
          >
            Make it yours <ArrowRight size={16} />
          </button>
        </section>
      )}
      <FactDialog
        key={activeMovie?.tmdbId || "closed"}
        movie={activeMovie}
        onClose={() => setActiveMovie(null)}
      />
    </>
  );
}

export function CatalogSkeleton() {
  return (
    <div className="movie-grid" role="status" aria-label="Loading movies">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="movie-card movie-skeleton" key={index}>
          <div className="poster-wrap" />
          <span className="skeleton-line" />
          <span className="skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function CatalogMovies({
  movies,
  favoriteIds,
  busyIds,
  onFavorite,
  onFact,
  strip = false,
}: {
  movies: MovieSummary[];
  favoriteIds: Set<number>;
  busyIds: Set<number>;
  onFavorite: (movie: MovieSummary) => Promise<void>;
  onFact: (movie: MovieSummary) => void;
  strip?: boolean;
}) {
  return (
    <div
      className={strip ? "movie-strip" : "movie-grid"}
      tabIndex={strip ? 0 : undefined}
      aria-label={strip ? "Movie posters; scroll to see more" : undefined}
    >
      {movies.map((movie) => (
        <MovieCard
          key={movie.tmdbId}
          movie={movie}
          saved={favoriteIds.has(movie.tmdbId)}
          busy={busyIds.has(movie.tmdbId)}
          onFavorite={() => void onFavorite(movie)}
          onFact={() => onFact(movie)}
        />
      ))}
    </div>
  );
}

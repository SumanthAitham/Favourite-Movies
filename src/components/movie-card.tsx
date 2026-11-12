"use client";

import Image from "next/image";
import { useState } from "react";
import { Film, Heart, LoaderCircle, Sparkles, Check } from "lucide-react";
import type { MovieSummary } from "@/lib/types";

export function MoviePoster({
  movie,
  priority = false,
}: {
  movie: MovieSummary;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return movie.posterPath && !failed ? (
    <Image
      src={`https://image.tmdb.org/t/p/w500${movie.posterPath}`}
      alt={`${movie.title} poster`}
      width={500}
      height={750}
      className="poster-image"
      unoptimized
      priority={priority}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="poster-placeholder">
      <Film size={35} strokeWidth={1} aria-hidden="true" />
      <span>{movie.title}</span>
      <small>Poster unavailable</small>
    </div>
  );
}

export function MovieCard({
  movie,
  saved = false,
  busy = false,
  onFavorite,
  onFact,
  onSelect,
  selected = false,
}: {
  movie: MovieSummary;
  saved?: boolean;
  busy?: boolean;
  onFavorite?: () => void;
  onFact?: () => void;
  onSelect?: () => void;
  selected?: boolean;
}) {
  return (
    <article className={`movie-card${selected ? " selected" : ""}`}>
      <div className="poster-wrap">
        {onSelect ? (
          <button
            type="button"
            className="poster-select"
            onClick={onSelect}
            aria-label={`Select ${movie.title}${movie.releaseYear ? ` (${movie.releaseYear})` : ""}`}
            aria-pressed={selected}
          >
            <MoviePoster movie={movie} />
            {selected && (
              <span className="selected-badge">
                <Check size={18} />
              </span>
            )}
          </button>
        ) : (
          <MoviePoster movie={movie} />
        )}
        {onFavorite && (
          <button
            type="button"
            className={`favorite-button${saved ? " saved" : ""}`}
            aria-label={`${saved ? "Remove" : "Save"} ${movie.title}${saved ? " from" : " to"} favorites`}
            aria-pressed={saved}
            disabled={busy}
            onClick={onFavorite}
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Heart
                size={18}
                fill={saved ? "currentColor" : "none"}
                strokeWidth={1.8}
              />
            )}
          </button>
        )}
        {saved && onFact && (
          <button type="button" className="poster-fact-button" onClick={onFact}>
            <Sparkles size={13} /> Did you know?
          </button>
        )}
      </div>
      <div className="movie-caption">
        <h3>{movie.title}</h3>
        <p>
          {movie.releaseYear || "Year unavailable"}
          {saved && (
            <span className="saved-label">
              <span /> Saved
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

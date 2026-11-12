"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { FactResult, MovieSummary } from "@/lib/types";
import { errorMessage, requestJson } from "./client-api";
import { MoviePoster } from "./movie-card";

export function FactDialog({
  movie,
  onClose,
  continueHref,
}: {
  movie: MovieSummary | null;
  onClose: () => void;
  continueHref?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [result, setResult] = useState<FactResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const id = movie?.tmdbId;

  useEffect(() => {
    if (id) dialog.current?.showModal();
    else dialog.current?.close();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let current = true;
    // Parents key this component by movie ID, so a new movie starts clean.
    requestJson<FactResult>("/api/facts", {
      method: "POST",
      body: JSON.stringify({ tmdbId: id }),
      signal: controller.signal,
    })
      .then((fact) => {
        if (current) setResult(fact);
      })
      .catch((cause) => {
        if (current && !controller.signal.aborted)
          setError(errorMessage(cause));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [id, attempt]);

  return (
    <dialog
      ref={dialog}
      className="fact-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {movie && (
        <div className="fact-dialog-content">
          <button
            className="icon-button dialog-close"
            type="button"
            aria-label="Close movie fact"
            onClick={onClose}
          >
            <X size={20} />
          </button>
          <div className="fact-movie">
            <div className="fact-poster">
              <MoviePoster movie={movie} />
            </div>
            <div>
              <span className="eyebrow">IN YOUR COLLECTION</span>
              <h2>{movie.title}</h2>
              <p>
                {movie.releaseYear || "Year unavailable"}{" "}
                <span className="fact-saved">
                  <Check size={13} /> Saved
                </span>
              </p>
            </div>
          </div>
          <div className="fact-divider" />
          <span className="fact-spark">
            <Sparkles size={24} strokeWidth={1.4} />
          </span>
          <h3 id={titleId}>Did you know?</h3>
          <div className="fact-body" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <div className="fact-loading">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line short" />
                <p>
                  <LoaderCircle size={13} className="spin" /> Finding a little
                  movie magic…
                </p>
              </div>
            ) : error ? (
              <div className="inline-error">
                <p>{error}</p>
                <button
                  className="button button-outline button-small"
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setError(null);
                    setLoading(true);
                    setAttempt((value) => value + 1);
                  }}
                >
                  <RotateCcw size={14} /> Try again
                </button>
              </div>
            ) : (
              <>
                <p className="fact-text">{result?.content}</p>
                {result?.source === "stale" && (
                  <p className="fact-fallback">
                    Here’s your last saved fact. A fresh one couldn’t be loaded
                    just now.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="fact-footnote">
            <Sparkles size={12} />
            <span>
              AI-generated. A detail to explore, not an independently verified
              source.
            </span>
          </div>
          {continueHref && (
            <Link
              className="button button-primary onboarding-continue"
              href={continueHref}
            >
              Go to my collection <ArrowRight size={16} />
            </Link>
          )}
        </div>
      )}
    </dialog>
  );
}

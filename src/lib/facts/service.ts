import { AppError } from "@/lib/errors";
import type { FactResult } from "@/lib/types";
import { FactGenerationError } from "./generation-error";

export type { FactResult } from "@/lib/types";

export const FACT_TTL_MS = 60_000;
export const MAX_FACT_LENGTH = 1_000;

export type FactMovie = {
  id: string;
  title: string;
  releaseYear: number | null;
  tmdbId?: number;
  overview?: string;
};

export type StoredFact = {
  content: string;
  createdAt: Date;
};

export type FactRepository = {
  findFavoriteMovie: (
    userId: string,
    tmdbId: number,
  ) => Promise<FactMovie | null>;
  findLatest: (userId: string, movieId: string) => Promise<StoredFact | null>;
  save: (
    userId: string,
    movieId: string,
    content: string,
  ) => Promise<StoredFact>;
};

type FactServiceDependencies = {
  repository: FactRepository;
  generate: (movie: FactMovie) => Promise<string>;
  now?: () => number;
};

function toFactResult(fact: StoredFact, source: FactResult["source"]): FactResult {
  return {
    content: fact.content,
    createdAt: fact.createdAt.toISOString(),
    source,
  };
}

function validateFactContent(content: unknown): string {
  if (typeof content !== "string") {
    throw new Error("Invalid generated fact");
  }

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_FACT_LENGTH) {
    throw new Error("Invalid generated fact");
  }

  return trimmed;
}

function favoriteNotFound(): AppError {
  return new AppError(
    "FAVORITE_NOT_FOUND",
    "Save this movie to your favorites before viewing its fact.",
    404,
  );
}

export function createFactService({
  repository,
  generate,
  now = Date.now,
}: FactServiceDependencies) {
  // Shared within this process. Multiple replicas need a database-backed guard.
  const pendingGenerations = new Map<string, Promise<FactResult>>();
  const isFresh = (fact: StoredFact) =>
    now() - fact.createdAt.getTime() < FACT_TTL_MS;

  return async function getFact(
    userId: string | null | undefined,
    tmdbId: number,
  ): Promise<FactResult> {
    if (typeof userId !== "string" || !userId.trim()) {
      throw new AppError(
        "UNAUTHENTICATED",
        "Please sign in to see movie facts.",
        401,
      );
    }
    if (
      !Number.isSafeInteger(tmdbId) ||
      tmdbId <= 0 ||
      tmdbId > 2_147_483_647
    ) {
      throw new AppError("INVALID_MOVIE", "Choose a valid movie.", 400);
    }

    // Authorization precedes cache access, including joining an active request.
    const movie = await repository.findFavoriteMovie(userId, tmdbId);
    if (!movie) throw favoriteNotFound();

    const ensureStillFavorite = async () => {
      const current = await repository.findFavoriteMovie(userId, tmdbId);
      if (!current || current.id !== movie.id) throw favoriteNotFound();
    };

    const cached = await repository.findLatest(userId, movie.id);
    if (cached && isFresh(cached)) return toFactResult(cached, "cache");

    const key = JSON.stringify([userId, movie.id]);
    const existing = pendingGenerations.get(key);
    if (existing) return existing;

    // Register the promise before starting work so simultaneous requests join it.
    const operation = Promise.resolve()
      .then(async (): Promise<FactResult> => {
        const latest = await repository.findLatest(userId, movie.id);
        if (latest && isFresh(latest)) return toFactResult(latest, "cache");

        try {
          const content = validateFactContent(await generate(movie));
          // Generation can take seconds. Honor a removal made while it ran.
          await ensureStillFavorite();
          // The repository timestamps successful storage, not request start.
          const saved = await repository.save(userId, movie.id, content);
          return toFactResult(saved, "generated");
        } catch (error) {
          if (
            error instanceof AppError &&
            error.code === "FAVORITE_NOT_FOUND"
          ) {
            throw error;
          }
          // A provider/storage failure must not bypass an intervening removal.
          await ensureStillFavorite();
          // Returning a stale fact never writes or refreshes its timestamp.
          if (latest) return toFactResult(latest, "stale");
          if (error instanceof FactGenerationError) {
            throw new AppError(
              error.code,
              `Your movie is saved. ${error.message}`,
              error.status,
            );
          }
          throw new AppError(
            "FACT_UNAVAILABLE",
            "Your movie is saved, but its fact is unavailable right now. Please try again.",
            503,
          );
        }
      })
      .finally(() => {
        if (pendingGenerations.get(key) === operation) {
          pendingGenerations.delete(key);
        }
      });

    pendingGenerations.set(key, operation);
    return operation;
  };
}

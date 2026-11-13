import { AppError } from "@/lib/errors";
import type { FactResult } from "@/lib/types";
import { isRepeatedFact } from "./similarity";
import { FactGenerationError } from "./generation-error";

export type { FactResult } from "@/lib/types";

export const FACT_TTL_MS = 60_000;
export const MAX_FACT_LENGTH = 1_000;
export const FACT_HISTORY_LIMIT = 5;

export type FactMovie = {
  id: string;
  title: string;
  releaseYear: number | null;
  tmdbId?: number;
  overview?: string;
  previousFacts?: string[];
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
  findRecent: (userId: string, movieId: string) => Promise<StoredFact[]>;
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
  coordinate?: (
    userId: string,
    movieId: string,
    work: (repository: FactRepository) => Promise<FactResult>,
  ) => Promise<FactResult>;
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
  coordinate = (_userId, _movieId, work) => work(repository),
}: FactServiceDependencies) {
  // Coalesce local requests; the production coordinator also locks in Postgres.
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

    const ensureStillFavorite = async (store = repository) => {
      const current = await store.findFavoriteMovie(userId, tmdbId);
      if (!current || current.id !== movie.id) throw favoriteNotFound();
    };

    const cached = await repository.findLatest(userId, movie.id);
    if (cached && isFresh(cached)) return toFactResult(cached, "cache");

    const key = JSON.stringify([userId, movie.id]);
    const existing = pendingGenerations.get(key);
    if (existing) return existing;

    // Register the promise before starting work so simultaneous requests join it.
    const operation = Promise.resolve()
      .then(() =>
        coordinate(userId, movie.id, async (store): Promise<FactResult> => {
          await ensureStillFavorite(store);
          const latest = await store.findLatest(userId, movie.id);
          if (latest && isFresh(latest)) return toFactResult(latest, "cache");

          try {
            const history = await store.findRecent(userId, movie.id);
            const previousFacts = history.slice(0, FACT_HISTORY_LIMIT).map((fact) => fact.content);
            const content = validateFactContent(await generate(
              previousFacts.length ? { ...movie, previousFacts } : movie,
            ));
            if (previousFacts.some((previous) => isRepeatedFact(content, previous))) {
              throw new Error("Generated fact repeats a recent fact");
            }
            // Generation can take seconds. Honor a removal made while it ran.
            await ensureStillFavorite(store);
            // The repository timestamps successful storage, not request start.
            const saved = await store.save(userId, movie.id, content);
            return toFactResult(saved, "generated");
          } catch (error) {
            if (
              error instanceof AppError &&
              error.code === "FAVORITE_NOT_FOUND"
            ) {
              throw error;
            }
            // A provider/storage failure must not bypass an intervening removal.
            await ensureStillFavorite(store);
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
        }),
      )
      .catch(async (error) => {
        if (error instanceof AppError) throw error;
        // A transaction may fail at commit or while waiting for the lock.
        await ensureStillFavorite();
        const latest = await repository.findLatest(userId, movie.id);
        if (latest) return toFactResult(latest, "stale");
        throw new AppError(
          "FACT_UNAVAILABLE",
          "Your movie is saved, but its fact is unavailable right now. Please try again.",
          503,
        );
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

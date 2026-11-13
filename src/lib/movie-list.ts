import type { MovieSummary } from "./types";

export function appendMovies(
  current: MovieSummary[],
  nextPage: MovieSummary[],
): MovieSummary[] {
  const existingIds = new Set(current.map((movie) => movie.tmdbId));
  return [
    ...current,
    ...nextPage.filter((movie) => !existingIds.has(movie.tmdbId)),
  ];
}

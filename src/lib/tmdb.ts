import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { parsePage, parseTmdbId, validateTitle } from "@/lib/validation";
import type { Genre, MoviePage, MovieSummary } from "@/lib/types";

const API_BASE = "https://api.themoviedb.org/3";
const imagePath = z
  .string()
  .regex(/^\/[a-zA-Z0-9._-]+$/)
  .nullable()
  .optional();
const movieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  release_date: z.string().optional(),
  poster_path: imagePath,
  backdrop_path: imagePath,
  overview: z.string().optional(),
  adult: z.boolean().optional(),
});
const pageSchema = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  results: z.array(z.unknown()),
});
const genreSchema = z.object({
  genres: z.array(
    z.object({ id: z.number().int().positive(), name: z.string().min(1) }),
  ),
});

export function isTmdbConfigured() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN?.trim());
}

async function tmdbRequest(
  path: string,
  params: Record<string, string> = {},
  revalidate = 300,
): Promise<unknown> {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token)
    throw new AppError(
      "CATALOG_UNAVAILABLE",
      "The movie catalog is taking an intermission. Please try again soon.",
      503,
    );
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate },
    });
    if (response.status === 404)
      throw new AppError(
        "MOVIE_NOT_FOUND",
        "We couldn’t find that movie. Please choose another.",
        404,
      );
    if (!response.ok)
      throw new AppError(
        "CATALOG_UNAVAILABLE",
        "The movie catalog is taking an intermission. Please try again soon.",
        503,
      );
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "CATALOG_UNAVAILABLE",
      "We couldn’t reach the movie catalog. Please try again soon.",
      503,
    );
  }
}

function toMovie(movie: z.infer<typeof movieSchema>): MovieSummary {
  const year = movie.release_date?.match(/^(\d{4})-/)?.[1];
  return {
    tmdbId: parseTmdbId(movie.id),
    title: validateTitle(movie.title),
    releaseYear: year ? Number(year) : null,
    posterPath: movie.poster_path ?? null,
    backdropPath: movie.backdrop_path ?? null,
    overview: movie.overview ?? "",
  };
}

export async function getGenres(): Promise<Genre[]> {
  const parsed = genreSchema.safeParse(
    await tmdbRequest("/genre/movie/list", {}, 86_400),
  );
  if (!parsed.success)
    throw new AppError(
      "CATALOG_UNAVAILABLE",
      "The movie catalog returned an unexpected response. Please try again.",
      502,
    );
  return parsed.data.genres;
}

function toMoviePage(value: unknown): MoviePage {
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError(
      "CATALOG_UNAVAILABLE",
      "We couldn’t load these movies. Please try again.",
      502,
    );
  // Invalid upstream records do not make the rest of a catalog page disappear.
  const movies = parsed.data.results.flatMap((value) => {
    const movie = movieSchema.safeParse(value);
    if (!movie.success || movie.data.adult) return [];
    try {
      return [toMovie(movie.data)];
    } catch {
      return [];
    }
  });
  return {
    movies,
    page: parsed.data.page,
    totalPages: Math.min(parsed.data.total_pages, 500),
  };
}

export async function discoverMovies(
  genre: number,
  page = 1,
): Promise<MoviePage> {
  parsePage(String(page));
  const genres = await getGenres();
  if (!genres.some((entry) => entry.id === genre))
    throw new AppError(
      "INVALID_GENRE",
      "Please choose a genre from the catalog.",
      400,
    );
  return toMoviePage(
    await tmdbRequest("/discover/movie", {
      with_genres: String(genre),
      page: String(page),
      sort_by: "popularity.desc",
      include_adult: "false",
      include_video: "false",
    }),
  );
}

export async function searchMovies(
  query: string,
  page = 1,
): Promise<MoviePage> {
  parsePage(String(page));
  const trimmed = query.trim();
  if (trimmed.length < 1 || trimmed.length > 200)
    throw new AppError(
      "INVALID_QUERY",
      "Enter a movie title between 1 and 200 characters.",
      400,
    );
  return toMoviePage(
    await tmdbRequest("/search/movie", {
      query: trimmed,
      page: String(page),
      include_adult: "false",
    }),
  );
}

export async function getMovie(tmdbId: number): Promise<MovieSummary> {
  const id = parseTmdbId(tmdbId);
  const parsed = movieSchema.safeParse(
    await tmdbRequest(`/movie/${id}`, {}, 3_600),
  );
  if (!parsed.success || parsed.data.id !== id || parsed.data.adult)
    throw new AppError(
      "INVALID_MOVIE",
      "This movie isn’t available. Please choose another.",
      400,
    );
  return toMovie(parsed.data);
}

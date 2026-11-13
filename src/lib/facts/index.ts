import "server-only";

import { prisma } from "@/lib/db";
import { generateMovieFact } from "@/lib/openai";
import { getMovie } from "@/lib/tmdb";
import { createDatabaseFactService } from "./database";

export const getMovieFact = createDatabaseFactService(prisma, async (movie) => {
  let overview: string | undefined;
  try {
    if (movie.tmdbId) overview = (await getMovie(movie.tmdbId)).overview;
  } catch {
    // The stored title and year are enough if TMDB is unavailable.
  }
  return generateMovieFact({ ...movie, overview });
});

export type { FactResult } from "./service";

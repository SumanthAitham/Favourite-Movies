import "server-only";

import { prisma } from "@/lib/db";
import { generateMovieFact } from "@/lib/gemini";
import { getMovie } from "@/lib/tmdb";
import { createFactService, type FactRepository } from "./service";

const repository: FactRepository = {
  async findFavoriteMovie(userId, tmdbId) {
    const favorite = await prisma.favorite.findFirst({
      where: { userId, movie: { tmdbId } },
      select: {
        movie: {
          select: { id: true, tmdbId: true, title: true, releaseYear: true },
        },
      },
    });
    return favorite?.movie ?? null;
  },
  findLatest(userId, movieId) {
    return prisma.movieFact.findFirst({
      where: { userId, movieId },
      orderBy: { createdAt: "desc" },
      select: { content: true, createdAt: true },
    });
  },
  save(userId, movieId, content) {
    return prisma.movieFact.create({
      data: { userId, movieId, content },
      select: { content: true, createdAt: true },
    });
  },
};

// One service/map per module instance, shared across incoming requests.
export const getMovieFact = createFactService({
  repository,
  async generate(movie) {
    let overview: string | undefined;
    try {
      if (movie.tmdbId) overview = (await getMovie(movie.tmdbId)).overview;
    } catch {
      // Extra context is optional. A TMDB outage must not prevent using the
      // already-persisted title/year or the stale-fact fallback.
    }
    return generateMovieFact({ ...movie, overview });
  },
});

export type { FactResult } from "./service";

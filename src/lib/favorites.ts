import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getMovie } from "@/lib/tmdb";
import type { MovieSummary } from "@/lib/types";
import { parseTmdbId, validateTitle } from "@/lib/validation";

const movieSelect = {
  tmdbId: true,
  title: true,
  releaseYear: true,
  posterPath: true,
} satisfies Prisma.MovieSelect;

function assertUser(userId: string): void {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
}

export async function listFavorites(userId: string): Promise<MovieSummary[]> {
  assertUser(userId);
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { movie: { select: movieSelect } },
  });
  return favorites.map((favorite) => favorite.movie);
}

export async function addFavorite(
  userId: string,
  tmdbId: number,
  onboarding = false,
): Promise<MovieSummary> {
  assertUser(userId);
  const id = parseTmdbId(tmdbId);
  const trustedMovie = await getMovie(id);
  const metadata = {
    tmdbId: id,
    title: validateTitle(trustedMovie.title),
    releaseYear: trustedMovie.releaseYear,
    posterPath: trustedMovie.posterPath,
  };

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const movie = await tx.movie.upsert({
          where: { tmdbId: id },
          create: metadata,
          update: metadata,
          select: { id: true, ...movieSelect },
        });

        await tx.favorite.upsert({
          where: { userId_movieId: { userId, movieId: movie.id } },
          create: { userId, movieId: movie.id },
          update: {},
        });

        if (onboarding) {
          // Keep the original completion time if onboarding is submitted again.
          await tx.user.updateMany({
            where: { id: userId, onboardingCompletedAt: null },
            data: { onboardingCompletedAt: new Date() },
          });
        }

        return {
          tmdbId: movie.tmdbId,
          title: movie.title,
          releaseYear: movie.releaseYear,
          posterPath: movie.posterPath,
        };
      });
    } catch (error) {
      // Prisma may implement an upsert with a read followed by an insert.
      // A competing insert can win; retry the entire rolled-back transaction.
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
}

export async function removeFavorite(
  userId: string,
  tmdbId: number,
): Promise<void> {
  assertUser(userId);
  const id = parseTmdbId(tmdbId);
  await prisma.favorite.deleteMany({
    where: { userId, movie: { tmdbId: id } },
  });
}

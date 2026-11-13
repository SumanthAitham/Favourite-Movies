import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { createFactService, type FactRepository, type FactMovie, FACT_HISTORY_LIMIT } from "./service";

function repositoryFor(client: Prisma.TransactionClient): FactRepository {
  return {
    async findFavoriteMovie(userId, tmdbId) {
      const favorite = await client.favorite.findFirst({
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
      return client.movieFact.findFirst({
        where: { userId, movieId },
        orderBy: { createdAt: "desc" },
        select: { content: true, createdAt: true },
      });
    },
    findRecent(userId, movieId) {
      return client.movieFact.findMany({
        where: { userId, movieId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: FACT_HISTORY_LIMIT,
        select: { content: true, createdAt: true },
      });
    },
    save(userId, movieId, content) {
      return client.movieFact.create({
        // Postgres now() is the transaction start, before generation or lock waits.
        data: { userId, movieId, content, createdAt: new Date() },
        select: { content: true, createdAt: true },
      });
    },
  };
}

export function createDatabaseFactService(
  client: PrismaClient,
  generate: (movie: FactMovie) => Promise<string>,
) {
  return createFactService({
    repository: repositoryFor(client),
    generate,
    coordinate(userId, movieId, work) {
      return client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '25s'`;
          // Transaction locks stay on one connection, including through a pooler.
          const key = JSON.stringify(["movie-fact", userId, movieId]);
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
          return work(repositoryFor(tx));
        },
        { isolationLevel: "ReadCommitted", maxWait: 3_000, timeout: 50_000 },
      );
    },
  });
}

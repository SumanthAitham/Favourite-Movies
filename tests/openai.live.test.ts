import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getMovieFact } from "@/lib/facts";

// Explicit opt-in: consumes OpenAI quota and uses the local development DB.
describe.skipIf(process.env.RUN_OPENAI_LIVE_TESTS !== "1")(
  "live OpenAI fact pipeline",
  () => {
    const userId = `openai-smoke-${randomUUID()}`;
    const tmdbId = Number(process.env.OPENAI_SMOKE_TMDB_ID || "272");
    let fixtureCreated = false;

    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL || "");
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.pathname !== "/movie_memory"
      )
        throw new Error("Live checks require the local movie_memory database.");
      if (!process.env.OPENAI_API_KEY || !process.env.TMDB_READ_ACCESS_TOKEN)
        throw new Error("Configure OpenAI and TMDB before running this check.");
      const movie = await prisma.movie.findUnique({ where: { tmdbId } });
      if (!movie)
        throw new Error("Save the selected movie before running this check.");
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          favorites: { create: { movieId: movie.id } },
        },
      });
      fixtureCreated = true;
    });

    afterAll(async () => {
      if (fixtureCreated) await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it("generates and persists a real fact, then serves the saved cache", async () => {
      const fact = await getMovieFact(userId, tmdbId);
      expect(fact.source).toBe("generated");
      expect(fact.content.length).toBeGreaterThan(0);
      expect(fact.content.length).toBeLessThanOrEqual(1000);
      expect(await prisma.movieFact.count({ where: { userId } })).toBe(1);
      expect(await getMovieFact(userId, tmdbId)).toMatchObject({
        source: "cache",
        content: fact.content,
        createdAt: fact.createdAt,
      });
    }, 35_000);
  },
);

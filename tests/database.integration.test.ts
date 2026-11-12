import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMovie: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/tmdb", () => ({ getMovie: mocks.getMovie }));
vi.mock("@/lib/gemini", () => ({ generateMovieFact: mocks.generate }));

import { prisma } from "@/lib/db";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites";
import { getMovieFact } from "@/lib/facts";

// Opt-in only. These tests use real Postgres; external API responses are mocked.
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "Postgres integration",
  () => {
    const alice = `integration-alice-${randomUUID()}`;
    const bob = `integration-bob-${randomUUID()}`;
    const movieId = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    const secondId = movieId + 1;
    const createdMovieIds: string[] = [];
    let localDatabaseVerified = false;

    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL || "");
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.pathname !== "/movie_memory"
      ) {
        throw new Error(
          "Integration checks require the local movie_memory database; never run against production.",
        );
      }
      localDatabaseVerified = true;
      await prisma.user.createMany({
        data: [
          { id: alice, email: `${alice}@example.test` },
          { id: bob, email: `${bob}@example.test` },
        ],
      });
      mocks.getMovie.mockImplementation(async (tmdbId: number) => ({
        tmdbId,
        title: "Integration fixture",
        releaseYear: 2000,
        posterPath: null,
      }));
      mocks.generate.mockResolvedValue(
        "A mocked fact for a real database test.",
      );
    });

    afterAll(async () => {
      if (!localDatabaseVerified) {
        await prisma.$disconnect();
        return;
      }
      // Cleanup is limited to fixtures created by this run; shared app data is untouched.
      const movies = await prisma.movie.findMany({
        where: { tmdbId: { in: [movieId, secondId] } },
        select: { id: true },
      });
      createdMovieIds.push(...movies.map((movie) => movie.id));
      await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
      await prisma.movie.deleteMany({
        where: {
          id: { in: createdMovieIds },
          favorites: { none: {} },
          facts: { none: {} },
        },
      });
      await prisma.$disconnect();
    });

    it("commits one favorite under concurrent repeated submissions", async () => {
      await Promise.all(
        Array.from({ length: 5 }, () => addFavorite(alice, movieId, true)),
      );
      expect(
        await prisma.favorite.count({
          where: { userId: alice, movie: { tmdbId: movieId } },
        }),
      ).toBe(1);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: alice },
      });
      expect(user.onboardingCompletedAt).toBeInstanceOf(Date);
    });

    it("preserves the first onboarding timestamp on repeated confirmation", async () => {
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: alice },
      });
      await addFavorite(alice, secondId, true);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: alice },
      });
      expect(after.onboardingCompletedAt).toEqual(before.onboardingCompletedAt);
      expect(await listFavorites(alice)).toHaveLength(2);
    });

    it("persists one generation for concurrent fact requests and returns the cache", async () => {
      mocks.generate.mockClear();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => getMovieFact(alice, movieId)),
      );
      expect(mocks.generate).toHaveBeenCalledTimes(1);
      expect(results.every((fact) => fact.content === results[0].content)).toBe(
        true,
      );
      expect(
        await prisma.movieFact.count({
          where: { userId: alice, movie: { tmdbId: movieId } },
        }),
      ).toBe(1);
      expect((await getMovieFact(alice, movieId)).source).toBe("cache");
      await expect(getMovieFact(bob, movieId)).rejects.toMatchObject({
        code: "FAVORITE_NOT_FOUND",
      });
    });

    it("removes only the caller's favorite and leaves shared metadata and onboarding intact", async () => {
      await addFavorite(bob, movieId, true);
      await removeFavorite(alice, movieId);
      await removeFavorite(alice, secondId);
      expect(await listFavorites(alice)).toEqual([]);
      expect(await listFavorites(bob)).toHaveLength(1);
      expect(
        await prisma.movie.findUnique({ where: { tmdbId: movieId } }),
      ).not.toBeNull();
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: alice } }))
          .onboardingCompletedAt,
      ).not.toBeNull();
      await expect(getMovieFact(alice, movieId)).rejects.toMatchObject({
        code: "FAVORITE_NOT_FOUND",
      });
    });

    it("rolls back a new movie when its favorite cannot reference a valid user", async () => {
      // first remove a test-only orphan so this case exercises a new shared movie.
      await prisma.movie.deleteMany({
        where: {
          tmdbId: secondId,
          favorites: { none: {} },
          facts: { none: {} },
        },
      });
      await expect(
        addFavorite(`missing-${randomUUID()}`, secondId, true),
      ).rejects.toBeDefined();
      expect(
        await prisma.movie.findUnique({ where: { tmdbId: secondId } }),
      ).toBeNull();
    });
  },
);

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMovie: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  movieUpsert: vi.fn(),
  favoriteUpsert: vi.fn(),
  userUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    favorite: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/tmdb", () => ({ getMovie: mocks.getMovie }));

import { Prisma } from "@/generated/prisma/client";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites";

const movie = {
  tmdbId: 27205,
  title: "Inception",
  releaseYear: 2010,
  posterPath: "/poster.jpg",
};
const storedMovie = { id: "movie-inception", ...movie };
const tx = {
  movie: { upsert: mocks.movieUpsert },
  favorite: { upsert: mocks.favoriteUpsert },
  user: { updateMany: mocks.userUpdateMany },
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getMovie.mockResolvedValue({
    ...movie,
    title: "  Inception  ",
    overview: "This should not be persisted.",
    backdropPath: "/backdrop.jpg",
  });
  mocks.movieUpsert.mockResolvedValue(storedMovie);
  mocks.favoriteUpsert.mockResolvedValue({ id: "favorite-a" });
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.findMany.mockResolvedValue([{ movie }]);
  mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (operation) => operation(tx));
});

describe("favorite authorization", () => {
  it.each(["", "   "])(
    "rejects a missing user ID (%j) for every operation",
    async (userId) => {
      await expect(listFavorites(userId)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        status: 401,
      });
      await expect(addFavorite(userId, movie.tmdbId)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        status: 401,
      });
      await expect(removeFavorite(userId, movie.tmdbId)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        status: 401,
      });
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.getMovie).not.toHaveBeenCalled();
      expect(mocks.deleteMany).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("lists only the current user's favorites with stored metadata", async () => {
    await expect(listFavorites("user-a")).resolves.toEqual([movie]);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: "user-a" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        movie: {
          select: {
            tmdbId: true,
            title: true,
            releaseYear: true,
            posterPath: true,
          },
        },
      },
    });
    expect(mocks.getMovie).not.toHaveBeenCalled();
  });

  it("scopes removal by both user and TMDB identity", async () => {
    await removeFavorite("user-b", movie.tmdbId);

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-b", movie: { tmdbId: movie.tmdbId } },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows an idempotent removal when the current user has no matching favorite", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      removeFavorite("user-b", movie.tmdbId),
    ).resolves.toBeUndefined();
  });

  it.each([0, -1, 1.5, NaN, 2_147_483_648])(
    "rejects an invalid movie ID (%s) before reading services",
    async (id) => {
      await expect(addFavorite("user-a", id)).rejects.toMatchObject({
        code: "INVALID_MOVIE",
      });
      await expect(removeFavorite("user-a", id)).rejects.toMatchObject({
        code: "INVALID_MOVIE",
      });
      expect(mocks.getMovie).not.toHaveBeenCalled();
      expect(mocks.deleteMany).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
});

describe("saving favorites", () => {
  it("resolves trusted movie details and persists only approved metadata", async () => {
    await expect(addFavorite("user-a", movie.tmdbId)).resolves.toEqual(movie);

    expect(mocks.getMovie).toHaveBeenCalledWith(movie.tmdbId);
    expect(mocks.movieUpsert).toHaveBeenCalledWith({
      where: { tmdbId: movie.tmdbId },
      create: movie,
      update: movie,
      select: {
        id: true,
        tmdbId: true,
        title: true,
        releaseYear: true,
        posterPath: true,
      },
    });
    expect(mocks.favoriteUpsert).toHaveBeenCalledWith({
      where: { userId_movieId: { userId: "user-a", movieId: storedMovie.id } },
      create: { userId: "user-a", movieId: storedMovie.id },
      update: {},
    });
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it("validates the trusted title before entering the transaction", async () => {
    mocks.getMovie.mockResolvedValue({ ...movie, title: "   " });

    await expect(addFavorite("user-a", movie.tmdbId)).rejects.toMatchObject({
      code: "INVALID_MOVIE",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not save when TMDB validation fails", async () => {
    mocks.getMovie.mockRejectedValue(new Error("Catalog unavailable"));

    await expect(addFavorite("user-a", movie.tmdbId, true)).rejects.toThrow(
      "Catalog unavailable",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it("uses the same compound unique key on repeated saves", async () => {
    await addFavorite("user-a", movie.tmdbId);
    await addFavorite("user-a", movie.tmdbId);

    expect(mocks.favoriteUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.favoriteUpsert.mock.calls[0]).toEqual(
      mocks.favoriteUpsert.mock.calls[1],
    );
    expect(mocks.favoriteUpsert.mock.calls[0][0].update).toEqual({});
  });

  it("saves onboarding and the first favorite in the same transaction without overwriting an earlier timestamp", async () => {
    await addFavorite("user-a", movie.tmdbId, true);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-a", onboardingCompletedAt: null },
      data: { onboardingCompletedAt: expect.any(Date) },
    });
    expect(mocks.favoriteUpsert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.userUpdateMany.mock.invocationCallOrder[0],
    );
  });

  it("never completes onboarding if saving the favorite fails", async () => {
    mocks.favoriteUpsert.mockRejectedValue(new Error("Write failed"));

    await expect(addFavorite("user-a", movie.tmdbId, true)).rejects.toThrow(
      "Write failed",
    );
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it("propagates an onboarding failure so Prisma rolls back the entire transaction", async () => {
    mocks.userUpdateMany.mockRejectedValue(
      new Error("Onboarding write failed"),
    );

    await expect(addFavorite("user-a", movie.tmdbId, true)).rejects.toThrow(
      "Onboarding write failed",
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("retries a unique-key race in a new transaction without repeating the TMDB request", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );
    mocks.transaction.mockRejectedValueOnce(conflict);

    await expect(addFavorite("user-a", movie.tmdbId, true)).resolves.toEqual(
      movie,
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.getMovie).toHaveBeenCalledOnce();
    expect(mocks.userUpdateMany).toHaveBeenCalledOnce();
  });

  it("bounds retries when a uniqueness conflict persists", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );
    mocks.transaction.mockRejectedValue(conflict);

    await expect(addFavorite("user-a", movie.tmdbId)).rejects.toBe(conflict);
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });

  it("does not retry arbitrary database errors", async () => {
    mocks.transaction.mockRejectedValue(new Error("Database unavailable"));

    await expect(addFavorite("user-a", movie.tmdbId)).rejects.toThrow(
      "Database unavailable",
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});

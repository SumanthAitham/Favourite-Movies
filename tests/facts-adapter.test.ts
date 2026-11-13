import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  favorite: vi.fn(),
  latest: vi.fn(),
  recent: vi.fn(),
  save: vi.fn(),
  movie: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (work: (tx: unknown) => unknown) => work({
      $executeRaw: vi.fn(), $queryRaw: vi.fn(),
      favorite: { findFirst: mocks.favorite },
      movieFact: { findFirst: mocks.latest, findMany: mocks.recent, create: mocks.save },
    }),
    favorite: { findFirst: mocks.favorite },
    movieFact: { findFirst: mocks.latest, findMany: mocks.recent, create: mocks.save },
  },
}));
vi.mock("@/lib/tmdb", () => ({ getMovie: mocks.movie }));
vi.mock("@/lib/openai", () => ({ generateMovieFact: mocks.generate }));
import { getMovieFact } from "@/lib/facts";

const movie = {
  id: "movie-1",
  tmdbId: 123,
  title: "A recent film",
  releaseYear: 2026,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.favorite.mockResolvedValue({ movie });
  mocks.latest.mockResolvedValue(null);
  mocks.recent.mockResolvedValue([]);
  mocks.movie.mockResolvedValue({
    ...movie,
    overview: "A traveler discovers a hidden city.",
  });
  mocks.generate.mockResolvedValue(
    "The film follows a traveler exploring a hidden city.",
  );
  mocks.save.mockImplementation(async ({ data }) => ({
    content: data.content,
    createdAt: new Date(),
  }));
});
describe("fact provider context", () => {
  it("provides trusted TMDB context only when generation is needed", async () => {
    await getMovieFact("user-1", 123);
    expect(mocks.movie).toHaveBeenCalledWith(123);
    expect(mocks.generate).toHaveBeenCalledWith({
      ...movie,
      overview: "A traveler discovers a hidden city.",
    });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.recent).toHaveBeenCalledWith({
      where: { userId: "user-1", movieId: "movie-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: { content: true, createdAt: true },
    });
  });
  it("uses stored title and year if TMDB context is unavailable", async () => {
    mocks.movie.mockRejectedValue(new Error("TMDB unavailable"));
    await expect(getMovieFact("user-1", 123)).resolves.toMatchObject({
      source: "generated",
    });
    expect(mocks.generate).toHaveBeenCalledWith({
      ...movie,
      overview: undefined,
    });
  });
  it("returns a fresh fact without calling either external provider", async () => {
    mocks.latest.mockResolvedValue({
      content: "Already saved.",
      createdAt: new Date(),
    });
    await expect(getMovieFact("user-1", 123)).resolves.toMatchObject({
      source: "cache",
    });
    expect(mocks.movie).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

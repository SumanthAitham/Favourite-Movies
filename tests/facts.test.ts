import { describe, expect, it, vi } from "vitest";
import { FactGenerationError } from "@/lib/facts/generation-error";
import {
  createFactService,
  FACT_TTL_MS,
  type FactMovie,
  type StoredFact,
} from "@/lib/facts/service";

const START = Date.parse("2026-11-11T12:00:00.000Z");
const MOVIES = new Map<number, FactMovie>([
  [101, { id: "movie-a", title: "A Movie", releaseYear: 2001 }],
  [202, { id: "movie-b", title: "Another Movie", releaseYear: 2020 }],
]);
const key = (userId: string, movieId: string) =>
  JSON.stringify([userId, movieId]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setup() {
  let time = START;
  const rows = new Map<string, StoredFact[]>();
  const favorites = new Set([key("user-a", "movie-a")]);
  const generate = vi
    .fn<(movie: FactMovie) => Promise<string>>()
    .mockResolvedValue("The production used hand-built miniature sets.");
  const repository = {
    findFavoriteMovie: vi.fn(async (userId: string, tmdbId: number) => {
      const movie = MOVIES.get(tmdbId);
      return movie && favorites.has(key(userId, movie.id)) ? movie : null;
    }),
    findLatest: vi.fn(async (userId: string, movieId: string) => {
      return rows.get(key(userId, movieId))?.at(-1) ?? null;
    }),
    findRecent: vi.fn(async (userId: string, movieId: string) =>
      [...(rows.get(key(userId, movieId)) ?? [])].reverse().slice(0, 5),
    ),
    save: vi.fn(async (userId: string, movieId: string, content: string) => {
      const fact = { content, createdAt: new Date(time) };
      const rowKey = key(userId, movieId);
      rows.set(rowKey, [...(rows.get(rowKey) ?? []), fact]);
      return fact;
    }),
  };

  return {
    getFact: createFactService({ repository, generate, now: () => time }),
    generate,
    repository,
    rows,
    favorites,
    setTime: (value: number) => {
      time = value;
    },
    seed: (age: number, userId = "user-a", movieId = "movie-a") => {
      const fact = {
        content: "An existing movie fact.",
        createdAt: new Date(time - age),
      };
      rows.set(key(userId, movieId), [fact]);
      return fact;
    },
  };
}

describe("personal movie fact cache", () => {
  it("returns a clear no-fact error for an empty provider result", async () => {
    const h = setup();
    h.generate.mockRejectedValue(new FactGenerationError("empty_response"));
    await expect(h.getFact("user-a", 101)).rejects.toMatchObject({
      code: "FACT_NOT_AVAILABLE",
      status: 422,
      message: expect.stringContaining("Your movie is saved."),
    });
    expect(h.repository.save).not.toHaveBeenCalled();
  });

  it("prefers an existing stale fact over the provider's no-fact response", async () => {
    const h = setup();
    const old = h.seed(FACT_TTL_MS);
    h.generate.mockRejectedValue(new FactGenerationError("empty_response"));
    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({
      content: old.content,
      source: "stale",
      createdAt: old.createdAt.toISOString(),
    });
    expect(h.repository.save).not.toHaveBeenCalled();
  });

  it("returns a fact younger than 60 seconds without calling the AI provider", async () => {
    const h = setup();
    const fact = h.seed(FACT_TTL_MS - 1);

    await expect(h.getFact("user-a", 101)).resolves.toEqual({
      content: fact.content,
      createdAt: fact.createdAt.toISOString(),
      source: "cache",
    });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.repository.save).not.toHaveBeenCalled();
  });

  it.each([FACT_TTL_MS, FACT_TTL_MS + 1])(
    "generates a new fact when the latest fact is %i milliseconds old",
    async (age) => {
      const h = setup();
      h.seed(age);

      const fact = await h.getFact("user-a", 101);

      expect(fact.source).toBe("generated");
      expect(h.generate).toHaveBeenCalledOnce();
      expect(h.repository.save).toHaveBeenCalledOnce();
      expect(h.rows.get(key("user-a", "movie-a"))).toHaveLength(2);
    },
  );

  it("generates and persists a missing fact using trusted movie metadata", async () => {
    const h = setup();
    h.generate.mockResolvedValue("  A useful fact.  ");

    await expect(h.getFact("user-a", 101)).resolves.toEqual({
      content: "A useful fact.",
      createdAt: new Date(START).toISOString(),
      source: "generated",
    });
    expect(h.generate).toHaveBeenCalledWith(MOVIES.get(101));
    expect(h.repository.save).toHaveBeenCalledWith(
      "user-a",
      "movie-a",
      "A useful fact.",
    );
  });

  it("timestamps storage after generation completes", async () => {
    const h = setup();
    h.generate.mockImplementation(async () => {
      h.setTime(START + 8_000);
      return "A useful fact.";
    });

    const fact = await h.getFact("user-a", 101);

    expect(fact.createdAt).toBe(new Date(START + 8_000).toISOString());
  });

  it("shares one generation across concurrent requests for a user/movie", async () => {
    const h = setup();
    const started = deferred<void>();
    const generated = deferred<string>();
    h.generate.mockImplementation(() => {
      started.resolve();
      return generated.promise;
    });
    const requests = Array.from({ length: 12 }, () => h.getFact("user-a", 101));
    await started.promise;
    expect(h.generate).toHaveBeenCalledOnce();
    generated.resolve("A shared fact.");

    const results = await Promise.all(requests);

    expect(results.every((fact) => fact.content === "A shared fact.")).toBe(
      true,
    );
    expect(h.generate).toHaveBeenCalledOnce();
    expect(h.repository.save).toHaveBeenCalledOnce();
  });

  it("rechecks the database inside the coordinated operation", async () => {
    const h = setup();
    const old = h.seed(FACT_TTL_MS);
    const recent = {
      content: "Stored by another request.",
      createdAt: new Date(START),
    };
    h.repository.findLatest
      .mockResolvedValueOnce(old)
      .mockResolvedValueOnce(recent);

    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({
      content: recent.content,
      source: "cache",
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("does not resolve waiting requests before the fact has been persisted", async () => {
    const h = setup();
    const saving = deferred<void>();
    const saved = deferred<StoredFact>();
    h.repository.save.mockImplementation(() => {
      saving.resolve();
      return saved.promise;
    });
    let resolved = false;
    const request = h.getFact("user-a", 101).then((fact) => {
      resolved = true;
      return fact;
    });
    await saving.promise;
    expect(resolved).toBe(false);
    saved.resolve({ content: "A persisted fact.", createdAt: new Date(START) });
    await expect(request).resolves.toMatchObject({
      content: "A persisted fact.",
    });
  });

  it("uses separate cache entries and in-flight operations for users and movies", async () => {
    const h = setup();
    h.favorites.add(key("user-a", "movie-b"));
    h.favorites.add(key("user-b", "movie-a"));
    h.favorites.add(key("user-b", "movie-b"));
    h.seed(0, "user-a", "movie-a");

    const results = await Promise.all([
      h.getFact("user-a", 101),
      h.getFact("user-a", 202),
      h.getFact("user-b", 101),
      h.getFact("user-b", 202),
    ]);

    expect(results.map((fact) => fact.source)).toEqual([
      "cache",
      "generated",
      "generated",
      "generated",
    ]);
    expect(h.generate).toHaveBeenCalledTimes(3);
    expect(
      h.repository.save.mock.calls.map(([user, movie]) => key(user, movie)),
    ).toEqual(
      expect.arrayContaining([
        key("user-a", "movie-b"),
        key("user-b", "movie-a"),
        key("user-b", "movie-b"),
      ]),
    );
  });
});

describe("fact authorization", () => {
  it.each(["", "   ", null, undefined])(
    "rejects a missing authenticated user (%j)",
    async (userId) => {
      const h = setup();

      await expect(h.getFact(userId, 101)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      expect(h.repository.findFavoriteMovie).not.toHaveBeenCalled();
      expect(h.repository.findLatest).not.toHaveBeenCalled();
      expect(h.generate).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity, 2_147_483_648])(
    "rejects an invalid movie ID (%s)",
    async (tmdbId) => {
      const h = setup();

      await expect(h.getFact("user-a", tmdbId)).rejects.toMatchObject({
        code: "INVALID_MOVIE",
      });
      expect(h.repository.findFavoriteMovie).not.toHaveBeenCalled();
    },
  );

  it("does not read another user's facts or generate for an unsaved movie", async () => {
    const h = setup();
    h.seed(0);

    await expect(h.getFact("user-b", 101)).rejects.toMatchObject({
      code: "FAVORITE_NOT_FOUND",
    });
    expect(h.repository.findFavoriteMovie).toHaveBeenCalledWith("user-b", 101);
    expect(h.repository.findLatest).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("checks favorite ownership again when revisiting a previously cached fact", async () => {
    const h = setup();
    h.seed(0);
    await h.getFact("user-a", 101);
    h.favorites.delete(key("user-a", "movie-a"));

    await expect(h.getFact("user-a", 101)).rejects.toMatchObject({
      code: "FAVORITE_NOT_FOUND",
    });
    expect(h.repository.findLatest).toHaveBeenCalledOnce();
  });

  it("does not store a fact if the movie is removed while generation is running", async () => {
    const h = setup();
    const started = deferred<void>();
    const generated = deferred<string>();
    h.generate.mockImplementation(() => {
      started.resolve();
      return generated.promise;
    });
    const request = h.getFact("user-a", 101);
    await started.promise;
    h.favorites.delete(key("user-a", "movie-a"));
    generated.resolve("A late fact.");

    await expect(request).rejects.toMatchObject({ code: "FAVORITE_NOT_FOUND" });
    expect(h.repository.save).not.toHaveBeenCalled();

    // Re-adding the movie can retry because the rejected operation was released.
    h.favorites.add(key("user-a", "movie-a"));
    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({
      source: "generated",
    });
    expect(h.generate).toHaveBeenCalledTimes(2);
  });

  it("does not return a stale fact after favorite removal during a failed generation", async () => {
    const h = setup();
    h.seed(FACT_TTL_MS);
    h.generate.mockImplementation(async () => {
      h.favorites.delete(key("user-a", "movie-a"));
      throw new Error("Provider failed");
    });

    await expect(h.getFact("user-a", 101)).rejects.toMatchObject({
      code: "FAVORITE_NOT_FOUND",
    });
    expect(h.repository.save).not.toHaveBeenCalled();
  });
});

describe("generation failures", () => {
  it("returns the same user's stale fact without changing its timestamp", async () => {
    const h = setup();
    const old = h.seed(5 * FACT_TTL_MS);
    h.generate.mockRejectedValue(
      new Error("Provider timed out; secret diagnostic data"),
    );

    await expect(h.getFact("user-a", 101)).resolves.toEqual({
      content: old.content,
      createdAt: old.createdAt.toISOString(),
      source: "stale",
    });
    expect(h.repository.save).not.toHaveBeenCalled();
    expect(h.rows.get(key("user-a", "movie-a"))).toEqual([old]);
  });

  it("returns a safe retryable error when no stored fact exists", async () => {
    const h = setup();
    h.generate.mockRejectedValue(new Error("Provider secret diagnostics"));

    await expect(h.getFact("user-a", 101)).rejects.toMatchObject({
      code: "FACT_UNAVAILABLE",
      message:
        "Your movie is saved, but its fact is unavailable right now. Please try again.",
    });
    expect(h.repository.save).not.toHaveBeenCalled();
  });

  it.each(["", "  \n\t ", "x".repeat(1_001)])(
    "does not persist empty or oversized generated output (case %#)",
    async (output) => {
      const h = setup();
      h.generate.mockResolvedValue(output);

      await expect(h.getFact("user-a", 101)).rejects.toMatchObject({
        code: "FACT_UNAVAILABLE",
      });
      expect(h.repository.save).not.toHaveBeenCalled();
    },
  );

  it("falls back to a stale fact for invalid generated output", async () => {
    const h = setup();
    const old = h.seed(FACT_TTL_MS);
    h.generate.mockResolvedValue("  ");

    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({
      content: old.content,
      source: "stale",
    });
  });

  it("releases the guard after failure so a subsequent retry can succeed", async () => {
    const h = setup();
    h.generate
      .mockRejectedValueOnce(new Error("Temporary outage"))
      .mockResolvedValueOnce("The retry succeeded.");

    await expect(h.getFact("user-a", 101)).rejects.toMatchObject({
      code: "FACT_UNAVAILABLE",
    });
    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({
      content: "The retry succeeded.",
      source: "generated",
    });
    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(h.repository.save).toHaveBeenCalledOnce();
  });

  it("does not mark an expired fallback fresh, permitting retry on the next request", async () => {
    const h = setup();
    h.seed(FACT_TTL_MS);
    h.generate.mockRejectedValueOnce(new Error("Temporary outage"));

    expect((await h.getFact("user-a", 101)).source).toBe("stale");
    expect((await h.getFact("user-a", 101)).source).toBe("generated");
    expect(h.generate).toHaveBeenCalledTimes(2);
  });

  it("returns a stale fact when storage fails instead of claiming a generated fact was saved", async () => {
    const h = setup();
    const old = h.seed(FACT_TTL_MS);
    h.repository.save.mockRejectedValue(new Error("Database unavailable"));

    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({
      content: old.content,
      source: "stale",
    });
  });

  it("reports a safe error if a new fact cannot be persisted and allows retry", async () => {
    const h = setup();
    h.repository.save.mockRejectedValueOnce(
      new Error("Database connection secret"),
    );

    await expect(h.getFact("user-a", 101)).rejects.toMatchObject({
      code: "FACT_UNAVAILABLE",
    });
    expect(h.rows.size).toBe(0);
    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({
      source: "generated",
    });
    expect(h.generate).toHaveBeenCalledTimes(2);
  });
});

describe("database coordinator failures", () => {
  it("returns an unchanged stale fact when lock acquisition fails", async () => {
    const h = setup();
    const old = h.seed(FACT_TTL_MS);
    const getFact = createFactService({
      repository: h.repository,
      generate: h.generate,
      now: () => START,
      coordinate: async () => { throw new Error("Lock wait timed out"); },
    });
    await expect(getFact("user-a", 101)).resolves.toMatchObject({
      content: old.content, createdAt: old.createdAt.toISOString(), source: "stale",
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the lock fails without a cached fact", async () => {
    const h = setup();
    const getFact = createFactService({
      repository: h.repository,
      generate: h.generate,
      coordinate: async () => { throw new Error("Lock unavailable"); },
    });
    await expect(getFact("user-a", 101)).rejects.toMatchObject({ code: "FACT_UNAVAILABLE", status: 503 });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("rechecks ownership after waiting for another worker", async () => {
    const h = setup();
    const getFact = createFactService({
      repository: h.repository,
      generate: h.generate,
      coordinate: async (_user, _movie, work) => {
        h.favorites.clear();
        return work(h.repository);
      },
    });
    await expect(getFact("user-a", 101)).rejects.toMatchObject({ code: "FAVORITE_NOT_FOUND" });
    expect(h.generate).not.toHaveBeenCalled();
  });
});

describe("fact variety", () => {
  it("passes only recent history for the current user and movie", async () => {
    const h = setup();
    h.seed(FACT_TTL_MS, "user-b");
    const history = Array.from({ length: 7 }, (_, index) => ({ content: `Earlier fact ${index}`, createdAt: new Date(START - FACT_TTL_MS) }));
    h.rows.set(key("user-a", "movie-a"), history);
    await h.getFact("user-a", 101);
    expect(h.repository.findRecent).toHaveBeenCalledWith("user-a", "movie-a");
    expect(h.generate).toHaveBeenCalledWith({ ...MOVIES.get(101), previousFacts: history.slice(-5).reverse().map((fact) => fact.content) });
  });
  it("does not save repeated text as a newly generated fact", async () => {
    const h = setup();
    const old = h.seed(FACT_TTL_MS);
    h.generate.mockResolvedValue(old.content.toUpperCase());
    await expect(h.getFact("user-a", 101)).resolves.toMatchObject({ source: "stale", createdAt: old.createdAt.toISOString() });
    expect(h.repository.save).not.toHaveBeenCalled();
    expect(h.generate).toHaveBeenCalledOnce();
  });
  it("does not load history on a fresh cache hit", async () => {
    const h = setup();
    h.seed(1000);
    await h.getFact("user-a", 101);
    expect(h.repository.findRecent).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });
});

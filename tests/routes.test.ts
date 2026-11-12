import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  addFavorite: vi.fn(),
  listFavorites: vi.fn(),
  removeFavorite: vi.fn(),
  getMovieFact: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/favorites", () => ({
  addFavorite: mocks.addFavorite,
  listFavorites: mocks.listFavorites,
  removeFavorite: mocks.removeFavorite,
}));
vi.mock("@/lib/facts", () => ({ getMovieFact: mocks.getMovieFact }));

import { GET, POST } from "@/app/api/favorites/route";
import { DELETE } from "@/app/api/favorites/[tmdbId]/route";
import { POST as factPOST } from "@/app/api/facts/route";

const movie = {
  tmdbId: 123,
  title: "A film",
  releaseYear: 2000,
  posterPath: null,
};
const user = { id: "alice", onboardingCompletedAt: new Date() };
const origin = "http://localhost:3000";
function request(
  path: string,
  body: unknown = { tmdbId: 123 },
  overrides: RequestInit = {},
) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_URL", origin);
  mocks.requireUser.mockResolvedValue(user);
  mocks.addFavorite.mockResolvedValue(movie);
  mocks.listFavorites.mockResolvedValue([movie]);
  mocks.removeFavorite.mockResolvedValue(undefined);
  mocks.getMovieFact.mockResolvedValue({
    content: "A fact.",
    createdAt: "2026-11-11T00:00:00.000Z",
    source: "generated",
  });
});

describe("personal API authorization", () => {
  it("denies all personal operations before accessing data when signed out", async () => {
    mocks.requireUser.mockRejectedValue(
      new AppError("UNAUTHENTICATED", "Please sign in.", 401),
    );
    const responses = await Promise.all([
      GET(),
      POST(request("/api/favorites")),
      factPOST(request("/api/facts")),
      DELETE(request("/api/favorites/123", undefined, { method: "DELETE" }), {
        params: Promise.resolve({ tmdbId: "123" }),
      }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401,
    ]);
    for (const fn of [
      mocks.addFavorite,
      mocks.listFavorites,
      mocks.removeFavorite,
      mocks.getMovieFact,
    ])
      expect(fn).not.toHaveBeenCalled();
  });

  it("ignores forged user IDs and metadata on favorite creation", async () => {
    const response = await POST(
      request("/api/favorites", {
        tmdbId: 123,
        userId: "bob",
        title: "Forged",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.addFavorite).toHaveBeenCalledWith("alice", 123, false);
    expect(mocks.getMovieFact).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses session identity for listing, removing and facts", async () => {
    await GET();
    await DELETE(
      request("/api/favorites/123?userId=bob", undefined, { method: "DELETE" }),
      { params: Promise.resolve({ tmdbId: "123" }) },
    );
    const response = await factPOST(
      request("/api/facts", { tmdbId: 123, userId: "bob" }),
    );
    expect(mocks.listFavorites).toHaveBeenCalledWith("alice");
    expect(mocks.removeFavorite).toHaveBeenCalledWith("alice", 123);
    expect(mocks.getMovieFact).toHaveBeenCalledWith("alice", 123);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["https://attacker.example", "null", ""])(
    "rejects an untrusted origin: %s",
    async (untrustedOrigin) => {
      const headers = {
        Origin: untrustedOrigin,
        "Content-Type": "application/json",
      };
      expect(
        (await POST(request("/api/favorites", {}, { headers }))).status,
      ).toBe(403);
      expect(
        (await factPOST(request("/api/facts", {}, { headers }))).status,
      ).toBe(403);
      const deletion = await DELETE(
        request("/api/favorites/123", undefined, { method: "DELETE", headers }),
        { params: Promise.resolve({ tmdbId: "123" }) },
      );
      expect(deletion.status).toBe(403);
      expect(mocks.addFavorite).not.toHaveBeenCalled();
      expect(mocks.removeFavorite).not.toHaveBeenCalled();
      expect(mocks.getMovieFact).not.toHaveBeenCalled();
    },
  );

  it("requires explicit first-favorite confirmation for onboarding", async () => {
    mocks.requireUser.mockResolvedValue({
      ...user,
      onboardingCompletedAt: null,
    });
    expect((await POST(request("/api/favorites"))).status).toBe(409);
    expect(mocks.addFavorite).not.toHaveBeenCalled();
    expect(
      (await POST(request("/api/favorites", { tmdbId: 123, onboarding: true })))
        .status,
    ).toBe(200);
    expect(mocks.addFavorite).toHaveBeenCalledWith("alice", 123, true);
  });

  it("returns safe internal errors without credentials or provider details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.addFavorite.mockRejectedValue(new Error("database-password=SECRET"));
    const response = await POST(request("/api/favorites"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SECRET");
    log.mockRestore();
  });
});

describe("personal API validation", () => {
  it.each([
    null,
    {},
    [],
    { tmdbId: -1 },
    { tmdbId: 1.5 },
    { tmdbId: "123abc" },
    { tmdbId: 2_147_483_648 },
  ])("rejects invalid fact selection %j", async (body) => {
    expect((await factPOST(request("/api/facts", body))).status).toBe(400);
    expect(mocks.getMovieFact).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unexpected content types", async () => {
    expect(
      (await POST(request("/api/favorites", {}, { body: "{" }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request(
            "/api/favorites",
            {},
            { headers: { Origin: origin, "Content-Type": "text/plain" } },
          ),
        )
      ).status,
    ).toBe(400);
  });

  it("bounds bodies even without a declared content length", async () => {
    const response = await POST(
      request("/api/favorites", { tmdbId: 123, padding: "x".repeat(2050) }),
    );
    expect(response.status).toBe(413);
    expect(mocks.addFavorite).not.toHaveBeenCalled();
  });

  it("rejects non-boolean onboarding flags", async () => {
    expect(
      (
        await POST(
          request("/api/favorites", { tmdbId: 123, onboarding: "false" }),
        )
      ).status,
    ).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, findUnique } = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique } } }));

import { AppError } from "@/lib/errors";
import {
  getCurrentUser,
  isAuthConfigured,
  requireUser,
  type CurrentUser,
} from "@/lib/session";

const configuredKeys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
] as const;

const user: CurrentUser = {
  id: "user-a",
  name: null,
  email: "movie-fan@example.com",
  image: null,
  onboardingCompletedAt: new Date("2026-11-11T12:00:00.000Z"),
};

beforeEach(() => {
  for (const key of configuredKeys) vi.stubEnv(key, "test-only-placeholder");
  auth.mockReset();
  findUnique.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authentication configuration", () => {
  it("requires all server-side authentication settings", () => {
    expect(isAuthConfigured()).toBe(true);
  });

  it.each(configuredKeys)(
    "keeps public pages usable without %s and never opens an auth or database request",
    async (key) => {
      vi.stubEnv(key, "");

      expect(isAuthConfigured()).toBe(false);
      await expect(getCurrentUser()).resolves.toBeNull();
      expect(auth).not.toHaveBeenCalled();
      expect(findUnique).not.toHaveBeenCalled();
    },
  );
});

describe("server session authorization", () => {
  it("does not read the database without an authenticated session", async () => {
    auth.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a session that has no user identity", async () => {
    auth.mockResolvedValue({ user: { email: user.email } });

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("loads the profile and explicit onboarding state using only the server session ID", async () => {
    auth.mockResolvedValue({ user: { id: user.id } });
    findUnique.mockResolvedValue(user);

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-a" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        onboardingCompletedAt: true,
      },
    });
  });

  it("preserves incomplete onboarding and missing Google profile fields", async () => {
    const newcomer = { ...user, onboardingCompletedAt: null };
    auth.mockResolvedValue({ user: { id: user.id } });
    findUnique.mockResolvedValue(newcomer);

    await expect(getCurrentUser()).resolves.toEqual(newcomer);
  });

  it("does not authorize a deleted user referenced by an old session", async () => {
    auth.mockResolvedValue({ user: { id: "deleted-user" } });
    findUnique.mockResolvedValue(null);

    await expect(requireUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("returns a safe 401 error when an unauthenticated operation requires a user", async () => {
    auth.mockResolvedValue(null);

    await expect(requireUser()).rejects.toEqual(
      new AppError("UNAUTHENTICATED", "Please sign in to continue.", 401),
    );
  });

  it("requires authentication even when the app has not been configured", async () => {
    vi.stubEnv("AUTH_SECRET", "");

    await expect(requireUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(auth).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns the authenticated database user to personal operations", async () => {
    auth.mockResolvedValue({ user: { id: user.id } });
    findUnique.mockResolvedValue(user);

    await expect(requireUser()).resolves.toEqual(user);
  });

  it("uses each request's identity instead of a process-wide profile cache", async () => {
    const secondUser = { ...user, id: "user-b", email: "second@example.com" };
    auth
      .mockResolvedValueOnce({ user: { id: user.id } })
      .mockResolvedValueOnce({ user: { id: secondUser.id } });
    findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(secondUser);

    await expect(getCurrentUser()).resolves.toEqual(user);
    await expect(getCurrentUser()).resolves.toEqual(secondUser);
    expect(findUnique.mock.calls.map(([args]) => args.where.id)).toEqual([
      "user-a",
      "user-b",
    ]);
  });

  it("never invents an authenticated user when a database query fails", async () => {
    auth.mockResolvedValue({ user: { id: user.id } });
    findUnique.mockRejectedValue(new Error("Database unavailable"));

    await expect(requireUser()).rejects.toThrow("Database unavailable");
  });
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ disconnect: vi.fn().mockResolvedValue(undefined), adapter: vi.fn() }));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class { constructor(options: unknown) { mocks.adapter(options); } },
}));
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class { $disconnect = mocks.disconnect; },
}));
const state = globalThis as typeof globalThis & {
  movieMemoryPrisma?: unknown;
  movieMemoryDatabaseUrl?: string;
};
beforeEach(() => {
  delete state.movieMemoryPrisma;
  delete state.movieMemoryDatabaseUrl;
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/first");
  vi.resetModules();
});
afterEach(() => {
  delete state.movieMemoryPrisma;
  delete state.movieMemoryDatabaseUrl;
  vi.unstubAllEnvs();
});
it("reuses the connection across reloads when the URL is unchanged", async () => {
  const first = await import("@/lib/db");
  vi.resetModules();
  expect((await import("@/lib/db")).prisma).toBe(first.prisma);
  expect(mocks.adapter).toHaveBeenCalledOnce();
  expect(mocks.disconnect).not.toHaveBeenCalled();
});
it("replaces the old connection when the database URL changes", async () => {
  const first = await import("@/lib/db");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/second");
  vi.resetModules();
  expect((await import("@/lib/db")).prisma).not.toBe(first.prisma);
  expect(mocks.adapter).toHaveBeenLastCalledWith(expect.objectContaining({ connectionString: "postgresql://localhost/second" }));
  expect(mocks.disconnect).toHaveBeenCalledOnce();
});
it("replaces a cached client left by the earlier version without URL tracking", async () => {
  state.movieMemoryPrisma = { $disconnect: mocks.disconnect };
  await import("@/lib/db");
  expect(mocks.adapter).toHaveBeenCalledOnce();
  expect(mocks.disconnect).toHaveBeenCalledOnce();
});

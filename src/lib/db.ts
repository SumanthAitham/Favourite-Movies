import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  movieMemoryPrisma?: PrismaClient;
  movieMemoryDatabaseUrl?: string;
};

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/movie_memory";

function createClient() {
  const adapter = new PrismaPg({
    // Constructing a client does not open a connection. This fallback lets
    // public pages and builds work before local services are configured.
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
  });

  return new PrismaClient({ adapter });
}

const previousClient = globalForPrisma.movieMemoryPrisma;
export const prisma =
  previousClient && globalForPrisma.movieMemoryDatabaseUrl === connectionString
    ? previousClient
    : createClient();

if (process.env.NODE_ENV !== "production") {
  // Hot reload preserves globals even when .env changes.
  if (previousClient && previousClient !== prisma) {
    void previousClient.$disconnect().catch(() => {});
  }
  globalForPrisma.movieMemoryPrisma = prisma;
  globalForPrisma.movieMemoryDatabaseUrl = connectionString;
}

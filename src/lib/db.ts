import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  movieMemoryPrisma?: PrismaClient;
};

function createClient() {
  const adapter = new PrismaPg({
    // Constructing a client does not open a connection. This fallback lets
    // public pages and builds work before local services are configured.
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/movie_memory",
    max: 10,
    connectionTimeoutMillis: 5_000,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.movieMemoryPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.movieMemoryPrisma = prisma;
}

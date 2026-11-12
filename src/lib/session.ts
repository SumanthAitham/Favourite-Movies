import "server-only";

import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  onboardingCompletedAt: Date | null;
}

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL &&
    process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET,
  );
}

// React cache deduplicates reads within a server render; it is not a global
// user cache and never shares a session between different requests.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isAuthConfigured()) return null;

  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      onboardingCompletedAt: true,
    },
  });
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  return user;
}

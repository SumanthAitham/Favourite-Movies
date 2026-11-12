"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { isAuthConfigured } from "@/lib/session";

export async function signInWithGoogle(tmdbId?: number): Promise<void> {
  if (!isAuthConfigured()) redirect("/?authError=configuration");

  if (
    tmdbId !== undefined &&
    (!Number.isSafeInteger(tmdbId) || tmdbId < 1 || tmdbId > 2_147_483_647)
  ) {
    redirect("/?authError=selection");
  }

  const redirectTo =
    tmdbId === undefined ? "/auth/continue" : `/auth/continue?movie=${tmdbId}`;

  try {
    await signIn("google", { redirectTo });
  } catch (error) {
    if (error instanceof AuthError) redirect("/?authError=signin");
    // Next.js implements redirects by throwing; those must be rethrown.
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  if (!isAuthConfigured()) redirect("/");
  await signOut({ redirectTo: "/" });
}

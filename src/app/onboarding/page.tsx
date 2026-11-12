import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Onboarding } from "@/components/onboarding";
import { getCurrentUser } from "@/lib/session";
import { getMovie } from "@/lib/tmdb";
import { parseTmdbId } from "@/lib/validation";
import type { MovieSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Your first favorite" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ movie?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const params = await searchParams;
  if (user.onboardingCompletedAt)
    redirect(
      `/dashboard${params.movie ? `?movie=${encodeURIComponent(params.movie)}` : ""}`,
    );
  let pendingMovie: MovieSummary | null = null;
  let pendingError: string | undefined;
  if (params.movie) {
    try {
      pendingMovie = await getMovie(parseTmdbId(params.movie));
    } catch {
      pendingError =
        "We couldn’t load your earlier selection. Search below to choose your first favorite.";
    }
  }
  return (
    <>
      <SiteHeader viewer={user} authReady />
      <main id="main-content">
        <Onboarding
          viewer={user}
          pendingMovie={pendingMovie}
          pendingError={pendingError}
        />
      </main>
      <SiteFooter />
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Dashboard } from "@/components/dashboard";
import { getCurrentUser } from "@/lib/session";
import { listFavorites } from "@/lib/favorites";
import { getMovie } from "@/lib/tmdb";
import { parseTmdbId } from "@/lib/validation";
import type { MovieSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Your collection" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ movie?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const params = await searchParams;
  const pendingQuery = params.movie
    ? `?movie=${encodeURIComponent(params.movie)}`
    : "";
  if (!user.onboardingCompletedAt) redirect(`/onboarding${pendingQuery}`);
  const favorites = await listFavorites(user.id);
  let pendingMovie: MovieSummary | null = null;
  let pendingError = false;
  if (params.movie) {
    try {
      pendingMovie = await getMovie(parseTmdbId(params.movie));
    } catch {
      pendingError = true;
    }
  }
  return (
    <>
      <SiteHeader viewer={user} authReady />
      <main id="main-content">
        {pendingError ? (
          <div className="page-notice" role="status">
            We couldn’t load the movie you selected before signing in. Your
            collection is safe; please find the movie again in Discover.
          </div>
        ) : null}
        <Dashboard
          viewer={user}
          favorites={favorites}
          pendingMovie={pendingMovie}
        />
      </main>
      <SiteFooter />
    </>
  );
}

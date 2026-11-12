import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Catalog } from "@/components/catalog";
import { getCurrentUser, isAuthConfigured } from "@/lib/session";
import { discoverMovies, getGenres } from "@/lib/tmdb";
import { listFavorites } from "@/lib/favorites";
import type { Genre, GenreSection } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [viewer, params] = await Promise.all([getCurrentUser(), searchParams]);
  let genres: Genre[] = [];
  let sections: GenreSection[] = [];
  let catalogError: string | undefined;
  try {
    genres = await getGenres();
    const preferred = ["Drama", "Science Fiction", "Animation"].flatMap(
      (name) => genres.filter((genre) => genre.name === name),
    );
    const selected = preferred.length ? preferred : genres.slice(0, 3);
    const results = await Promise.allSettled(
      selected.map(async (genre) => {
        const page = await discoverMovies(genre.id);
        return { genre, movies: page.movies, totalPages: page.totalPages };
      }),
    );
    sections = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (results.some((result) => result.status === "rejected"))
      catalogError =
        "Some genres couldn’t be loaded. Please try again in a moment.";
  } catch {
    catalogError =
      "The movie catalog is taking an intermission. Please try again soon.";
  }
  const favorites = viewer ? await listFavorites(viewer.id) : [];
  const authReady = isAuthConfigured();
  return (
    <>
      <SiteHeader viewer={viewer} authReady={authReady} />
      {params.authError || params.error ? (
        <div className="page-notice" role="status">
          {params.authError === "configuration"
            ? "Google sign-in isn’t available yet. Please try again later."
            : "We couldn’t complete sign-in. Please try again."}
        </div>
      ) : null}
      <main id="main-content">
        <Catalog
          sections={sections}
          genres={genres}
          viewer={viewer}
          initialFavoriteIds={favorites.map((movie) => movie.tmdbId)}
          authReady={authReady}
          catalogError={catalogError}
          needsOnboarding={Boolean(viewer && !viewer.onboardingCompletedAt)}
        />
      </main>
      <SiteFooter />
    </>
  );
}

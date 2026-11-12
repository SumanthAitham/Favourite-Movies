import { discoverMovies, getGenres, searchMovies } from "@/lib/tmdb";
import { parsePage, parseTmdbId } from "@/lib/validation";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const page = parsePage(params.get("page"));
    const query = params.get("query");
    const genre = params.get("genre");
    const result =
      query !== null
        ? await searchMovies(query, page)
        : genre !== null
          ? await discoverMovies(parseTmdbId(genre), page)
          : { genres: await getGenres() };
    // Only public catalog metadata can be cached by intermediaries.
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverMovies, getMovie, searchMovies } from "@/lib/tmdb";

const fetchMock = vi.fn();
const rawMovie = {
  id: 123,
  title: "  A Film  ",
  release_date: "2000-01-01",
  poster_path: "/poster.jpg",
  adult: false,
};
const page = (movies: unknown[]) => ({
  page: 1,
  total_pages: 900,
  results: movies,
});
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const respond = (data: unknown) =>
  fetchMock.mockResolvedValueOnce(Response.json(data));

describe("TMDB catalog boundary", () => {
  it("resolves trimmed metadata and year from the trusted movie endpoint", async () => {
    respond(rawMovie);
    expect(await getMovie(123)).toMatchObject({
      tmdbId: 123,
      title: "A Film",
      releaseYear: 2000,
      posterPath: "/poster.jpg",
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe("/3/movie/123");
    expect(url.searchParams.has("api_key")).toBe(false);
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("supports missing posters and release years", async () => {
    respond({ ...rawMovie, release_date: "", poster_path: null });
    expect(await getMovie(123)).toMatchObject({
      releaseYear: null,
      posterPath: null,
    });
  });

  it.each([
    { ...rawMovie, id: 124 },
    { ...rawMovie, title: " " },
    { ...rawMovie, title: "x".repeat(201) },
    { ...rawMovie, adult: true },
    { ...rawMovie, poster_path: "https://attacker.example/image" },
  ])("rejects mismatched or invalid movie metadata", async (movie) => {
    respond(movie);
    await expect(getMovie(123)).rejects.toMatchObject({
      code: "INVALID_MOVIE",
    });
  });

  it("skips bad individual records while keeping valid catalog results", async () => {
    respond(
      page([rawMovie, { id: 999 }, { ...rawMovie, id: 124, adult: true }]),
    );
    const result = await searchMovies("film");
    expect(result.movies).toHaveLength(1);
    expect(result.totalPages).toBe(500);
  });

  it("uses TMDB's genre list to validate a discover request", async () => {
    respond({ genres: [{ id: 18, name: "Drama" }] });
    await expect(discoverMovies(999)).rejects.toMatchObject({
      code: "INVALID_GENRE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds paging and search length before fetching", async () => {
    await expect(searchMovies("film", 501)).rejects.toMatchObject({
      code: "INVALID_PAGE",
    });
    await expect(discoverMovies(18, 0)).rejects.toMatchObject({
      code: "INVALID_PAGE",
    });
    await expect(searchMovies("x".repeat(201))).rejects.toMatchObject({
      code: "INVALID_QUERY",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes queries and excludes adult catalog results", async () => {
    respond(page([rawMovie]));
    await searchMovies("film & ?query=other", 2);
    const [url] = fetchMock.mock.calls[0];
    expect(url.searchParams.get("query")).toBe("film & ?query=other");
    expect(url.searchParams.get("include_adult")).toBe("false");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("handles unavailable configuration without issuing a request", async () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "");
    await expect(getMovie(123)).rejects.toMatchObject({
      code: "CATALOG_UNAVAILABLE",
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sanitizes network and upstream failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("secret provider details"));
    await expect(getMovie(123)).rejects.toMatchObject({
      code: "CATALOG_UNAVAILABLE",
      status: 503,
    });
    fetchMock.mockResolvedValueOnce(
      new Response("secret response", { status: 500 }),
    );
    await expect(getMovie(123)).rejects.toMatchObject({
      code: "CATALOG_UNAVAILABLE",
      status: 503,
    });
  });
});

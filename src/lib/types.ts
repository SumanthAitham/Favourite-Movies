export interface MovieSummary {
  tmdbId: number;
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
  backdropPath?: string | null;
  overview?: string;
}

export interface Genre {
  id: number;
  name: string;
}
export interface MoviePage {
  movies: MovieSummary[];
  page: number;
  totalPages: number;
}
export interface GenreSection {
  genre: Genre;
  movies: MovieSummary[];
  totalPages: number;
}
export interface Viewer {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}
export interface FactResult {
  content: string;
  createdAt: string;
  source: "cache" | "generated" | "stale";
}

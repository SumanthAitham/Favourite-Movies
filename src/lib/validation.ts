import { AppError } from "@/lib/errors";

export function parseTmdbId(value: unknown): number {
  const candidate =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < 1 ||
    candidate > 2_147_483_647
  ) {
    throw new AppError("INVALID_MOVIE", "Please choose a valid movie.", 400);
  }
  return candidate;
}

export function validateTitle(value: string): string {
  const title = value.trim();
  if (title.length < 1 || title.length > 200) {
    throw new AppError(
      "INVALID_MOVIE",
      "This movie’s title could not be validated. Please choose another movie.",
      400,
    );
  }
  return title;
}

export function parsePage(value: string | null): number {
  if (value === null) return 1;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 500) {
    throw new AppError(
      "INVALID_PAGE",
      "Please choose a page between 1 and 500.",
      400,
    );
  }
  return Number(value);
}

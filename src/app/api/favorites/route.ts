import { requireUser } from "@/lib/session";
import { addFavorite, listFavorites } from "@/lib/favorites";
import { AppError } from "@/lib/errors";
import {
  errorResponse,
  privateHeaders,
  readJson,
  requireSameOrigin,
} from "@/lib/http";
import { parseTmdbId } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(
      { movies: await listFavorites(user.id) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireSameOrigin(request);
    const body = await readJson(request);
    if (body.onboarding !== undefined && typeof body.onboarding !== "boolean")
      throw new AppError(
        "INVALID_REQUEST",
        "Please send a valid request.",
        400,
      );
    if (!user.onboardingCompletedAt && body.onboarding !== true)
      throw new AppError(
        "ONBOARDING_REQUIRED",
        "Please confirm your first favorite to finish getting started.",
        409,
      );
    // Ignore browser-supplied user IDs and movie metadata. Resolve both on the server.
    const movie = await addFavorite(
      user.id,
      parseTmdbId(body.tmdbId),
      body.onboarding === true,
    );
    return Response.json({ movie }, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

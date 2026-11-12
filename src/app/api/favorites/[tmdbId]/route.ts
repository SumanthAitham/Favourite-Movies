import { requireUser } from "@/lib/session";
import { removeFavorite } from "@/lib/favorites";
import { errorResponse, privateHeaders, requireSameOrigin } from "@/lib/http";
import { parseTmdbId } from "@/lib/validation";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ tmdbId: string }> },
) {
  try {
    const user = await requireUser();
    requireSameOrigin(request);
    await removeFavorite(user.id, parseTmdbId((await context.params).tmdbId));
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

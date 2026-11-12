import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ContinueAfterSignIn({
  searchParams,
}: {
  searchParams: Promise<{ movie?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { movie } = await searchParams;
  const parsed =
    typeof movie === "string" && /^\d+$/.test(movie) ? Number(movie) : NaN;
  const pendingMovie =
    Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647
      ? `?movie=${parsed}`
      : "";

  // Redirect only: favorite creation remains an authenticated mutation.
  const destination = user.onboardingCompletedAt ? "/dashboard" : "/onboarding";
  redirect(`${destination}${pendingMovie}`);
}

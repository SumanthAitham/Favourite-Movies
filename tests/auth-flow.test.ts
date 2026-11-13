import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), favorites: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class extends Error {} }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.user, isAuthConfigured: () => true }));
vi.mock("@/lib/favorites", () => ({ listFavorites: mocks.favorites }));
vi.mock("@/lib/tmdb", () => ({ getMovie: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/dashboard", () => ({ Dashboard: () => null }));
vi.mock("@/components/onboarding", () => ({ Onboarding: () => null }));

import Continue from "@/app/auth/continue/page";
import Dashboard from "@/app/dashboard/page";
import Onboarding from "@/app/onboarding/page";
import { signInWithGoogle, signOutUser } from "@/actions/auth";

beforeEach(() => { mocks.user.mockResolvedValue(null); });

it("redirects logged-out dashboard and onboarding requests to login before reading data", async () => {
  for (const page of [Dashboard, Onboarding]) {
    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/");
  }
  expect(mocks.favorites).not.toHaveBeenCalled();
});
it("sends a new Google user to onboarding with their pending movie", async () => {
  mocks.user.mockResolvedValue({ id: "new", onboardingCompletedAt: null });
  await expect(Continue({ searchParams: Promise.resolve({ movie: "272" }) })).rejects.toThrow("redirect:/onboarding?movie=272");
});
it("sends a returning user to the dashboard even if their collection is empty", async () => {
  mocks.user.mockResolvedValue({ id: "returning", onboardingCompletedAt: new Date() });
  await expect(Continue({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/dashboard");
  await expect(Onboarding({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/dashboard");
  expect(mocks.favorites).not.toHaveBeenCalled();
});
it("keeps unfinished onboarding protected when visiting the dashboard directly", async () => {
  mocks.user.mockResolvedValue({ id: "new", onboardingCompletedAt: null });
  await expect(Dashboard({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/onboarding");
});
it.each(["https://attacker.example", "-1", "0", "1.2", "2147483648"])("discards an invalid pending selection: %s", async (movie) => {
  mocks.user.mockResolvedValue({ id: "new", onboardingCompletedAt: null });
  await expect(Continue({ searchParams: Promise.resolve({ movie }) })).rejects.toThrow(/^redirect:\/onboarding$/);
});
it("starts Google sign-in with the internal routing destination", async () => {
  await signInWithGoogle();
  expect(mocks.signIn).toHaveBeenCalledWith("google", { redirectTo: "/auth/continue" });
});
it("signs out through Auth.js and returns to the landing page", async () => {
  await signOutUser();
  expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/" });
});

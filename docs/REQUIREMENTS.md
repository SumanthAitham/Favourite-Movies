# Assignment checklist

Scope: the original SWE Take-Home Exercise (Full-Stack), base implementation plus Variant A. Variant B is not selected. TMDB browsing and multiple favorites are additional agreed features.

## Implementation

| Requirement | Evidence | Status |
| --- | --- | --- |
| TypeScript, Next.js, React, Tailwind, Postgres, Prisma, Google OAuth, OpenAI | `package.json`, `src/auth.ts`, `src/lib/openai.ts`, Prisma schema | Implemented |
| Landing page and Google sign-in | `src/app/page.tsx`, `src/components/site-header.tsx` | Implemented; deployed landing checked |
| First-time onboarding and returning-user dashboard | `src/app/auth/continue/page.ts`, `tests/auth-flow.test.ts` | Implemented; server routing tested |
| Trim and validate movie input; save it for the authenticated user | `src/lib/validation.ts`, `src/lib/favorites.ts`, favorites and database tests | Implemented; tested |
| Profile name, email, optional photo, stored favorite, logout | `src/components/dashboard.tsx`, `src/components/site-header.tsx` | Implemented; browser walkthrough pending |
| Logged-out dashboard redirects to login | `src/app/dashboard/page.tsx`, auth-flow tests | Tested locally and against deployment |
| Generate a fact using OpenAI and store it | `src/lib/openai.ts`, `src/lib/facts/database.ts` | Live service check passed |
| Rolling 60-second cache per user/movie | `src/lib/facts/service.ts`, `tests/facts.test.ts` | Boundary tests pass, including exactly 60 seconds |
| Burst/idempotency protection | Local Promise Map plus PostgreSQL transaction advisory lock | Independent-service integration test passes |
| Provider failures use an old fact or friendly error | Fact service, OpenAI adapter, fact dialog | Tested; stale timestamps remain unchanged |
| Required backend tests: timing and authorization | Facts, routes, auth, and favorites tests | Pass |
| Users cannot read or change others' data | Session-derived identity and user-scoped database operations | Backend tests pass |
| Credentials kept out of browser; missing name/photo handled | Server-only modules, profile fallbacks | Code reviewed; visual fallback check pending |
| README setup, env vars, migrations, architecture, variant/reason, tradeoffs | README and architecture overview | Present |
| Future improvements and AI-usage bullets | README | Present |
| GitHub repository | Existing project remote | Latest changes must be committed and pushed for submission |

## Verification

- 168 unit/handler tests pass. The default suite skips seven database tests and one paid live-provider test.
- All seven tests against local PostgreSQL pass, including independent-service lock contention and retry after provider failure.
- The opt-in live test passed with real TMDB, OpenAI, and local PostgreSQL. It generated a fact, stored it, and reused it from cache; its disposable user was removed afterward.
- Public deployment checked at `https://moviememory.vercel.app/`: landing HTTP 200 with Google sign-in; Google callback points to the production domain; logged-out dashboard redirects to the landing page; personal favorites API returns 401 without a session.
- The deployment checks cover the currently published version. The new database coordination code is local until committed, pushed, and redeployed. No schema migration is required for this change.

## Remaining acceptance checks

Browser automation was unavailable. These are verification gaps, not claims of missing implementations:

1. Complete Google consent/login as a new user, confirm a movie, and reach the dashboard.
2. Sign out, sign back in, and confirm the returning-user dashboard and profile.
3. Add/remove favorites, remove the last favorite, and confirm onboarding does not restart.
4. Exercise fact loading, retry, stale fallback, and switching films in the dialog.
5. Check mobile layout, keyboard navigation, dialog focus/Escape, and missing-image fallbacks.

The assignment requires describing improvements with two more hours, not implementing all of them. The walkthrough video is optional. The submitter should be prepared to explain schema choices, cache timing, authorization, concurrency, and the connection cost of the database lock.

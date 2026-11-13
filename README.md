# Movie Memory

A personal movie collection: discover films by genre, sign in with Google, save multiple favorites, and see a short AI-generated fact under **“Did you know?”**.

Built with TypeScript, Next.js App Router, React, Tailwind CSS, PostgreSQL, and Prisma. Google authentication uses Auth.js, catalog data comes from TMDB, and facts use the OpenAI API. The selected take-home variant is **Variant A**: backend caching, duplicate-generation protection, and failure recovery.

## Run locally

Prerequisites: Node.js 22.12+ (Node 24 recommended), npm, PostgreSQL 17 or Docker with Compose, and credentials for Google OAuth, TMDB, and OpenAI.

```bash
npm ci
cp .env.example .env
```

Keep your existing `.env` if you already have one. Fill in the credentials below and generate `AUTH_SECRET` with `openssl rand -base64 32`. `.env` is ignored by Git; `.env.example` should contain placeholders only. Keep credentials out of `NEXT_PUBLIC_` variables.

Start PostgreSQL and apply the checked-in migration:

```bash
docker compose -p movie-memory up -d --wait
npm run db:migrate
npm run dev
```

Use `docker-compose` if your system has standalone Compose. The database listens on `127.0.0.1:5432`; the credentials in `compose.yaml` are for local development.

Open **http://localhost:3000**. Use this hostname consistently with `AUTH_URL` and the Google redirect URI; `127.0.0.1` and `localhost` are different origins.

Without credentials, the homepage shows an unavailable catalog and a disabled sign-in button.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the application. The example matches Compose. |
| `DIRECT_DATABASE_URL` | Optional direct connection for migrations when the runtime connection uses a pooler. |
| `AUTH_SECRET` | Random session/authentication secret. Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | Canonical app origin, initially `http://localhost:3000`. |
| `AUTH_GOOGLE_ID` | Google OAuth web client ID. |
| `AUTH_GOOGLE_SECRET` | Google OAuth web client secret. |
| `TMDB_READ_ACCESS_TOKEN` | TMDB **API Read Access Token** used as a bearer token; not the v3 API key. |
| `OPENAI_API_KEY` | Server-side OpenAI API key from the OpenAI platform. |
| `OPENAI_MODEL` | Configurable text model; defaults to `gpt-4.1-mini`. |

In Google Cloud, configure an OAuth **Web application**, the consent screen, and any required test users. Add `http://localhost:3000` as an authorized JavaScript origin and `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Update both for a future deployment. Restart the development server after changing `.env`.

TMDB credentials are available in your TMDB account’s API settings. Create an OpenAI key in the [API dashboard](https://platform.openai.com/api-keys) and add it as `OPENAI_API_KEY` in `.env`. This is separate from the Google OAuth client ID and secret used for sign-in. Your OpenAI project needs access and quota for the configured model. Set `OPENAI_MODEL="gpt-4.1-mini"` (the default) and restart the development server after setting the key. Existing saved facts remain available through the same cache and fallback rules.

## User flow

1. Browse genre rows or search for a movie. Genres are read from TMDB; every additional results page requires an explicit action.
2. Selecting a favorite while signed out carries its TMDB ID through Google login.
3. A new user confirms their first favorite in onboarding. The favorite and `onboardingCompletedAt` commit in one transaction. Returning users go directly to their dashboard, and a pending movie is saved through an authenticated POST.
4. A successful save marks the movie as saved, then opens the fact dialog. Fact generation is a separate request; failures cannot roll back the favorite.
5. Reopen “Did you know?” for a saved film, or remove it. Removing every favorite does not restart onboarding.

On a fact-cache miss, the server supplies the last five user/movie facts and asks for a different underlying detail. Exact and near-verbatim repeats are rejected rather than saved as new facts; this wording check cannot detect every paraphrase. The server also tries to supply OpenAI with a trusted TMDB overview alongside the stored title and release year. This helps identify recent or unfamiliar films. If TMDB is unavailable, generation can still use the stored title/year. An empty OpenAI response is treated as **no fact available for this film** (`FACT_NOT_AVAILABLE`, HTTP 422), rather than a service outage. An existing saved fact is always preferred as the fallback, with its timestamp unchanged.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, cache algorithm, authorization boundaries, and tradeoffs, and [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the assignment checklist.

```text
src/app/                Server pages, protected routes, and API handlers
src/components/         Catalog, cards, onboarding, dashboard, and fact dialog
src/actions/auth.ts     Auth.js sign-in and sign-out server actions
src/lib/session.ts      Current-user lookup and authentication requirement
src/lib/favorites.ts    Trusted metadata resolution and transactional persistence
src/lib/facts/          Testable cache service and Prisma repository adapter
src/lib/tmdb.ts          TMDB validation, catalog requests, and catalog caching
src/lib/openai.ts        Server-only OpenAI integration
prisma/                 Schema and initial PostgreSQL migration
tests/                  Unit, HTTP-handler, and opt-in database tests
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The normal test suite uses mocked dependencies. It covers exact cache timing, one generation for simultaneous requests, user/movie isolation, authorization, malformed input, origin checks, failure fallback, retries, trusted metadata, favorite transactions, and the OpenAI adapter. Seven database integration checks and one live OpenAI check are skipped by default.

With the local database running and migrated (these checks refuse hosted databases):

```bash
DATABASE_URL="postgresql://movie_memory:movie_memory_local@localhost:5432/movie_memory?schema=public" npm run test:database
```

These **seven integration tests** use the real local Postgres database and mock only TMDB/OpenAI. They create uniquely named fixtures, clean up only their own records, and refuse non-local databases or a database name other than `movie_memory`.

Latest local checks: 168 unit/handler tests, seven PostgreSQL integration tests, lint, and the production build (including TypeScript) passed. The live OpenAI/TMDB/database check passed: generation, persistence, and cache reuse were verified using a disposable local test user. Full Google OAuth flows, mobile layout, and keyboard interactions still need browser acceptance testing.

To check the real OpenAI/TMDB/database pipeline for a movie already stored locally:

```bash
DATABASE_URL="postgresql://movie_memory:movie_memory_local@localhost:5432/movie_memory?schema=public" OPENAI_SMOKE_TMDB_ID=272 npm run test:openai
```

This opt-in check consumes OpenAI quota, creates an isolated test user, verifies generation/persistence/cache, and removes that user's fixtures. It does not modify existing users or their favorites. Use a stored TMDB ID; the default is `272` (Batman Begins).

Manual acceptance checks after configuring credentials:

- Google login/logout; new and returning user routing; pending movie confirmation.
- Multiple favorites, repeated saves, removals, and an empty returning-user collection.
- Catalog search, genres, pagination, provider errors, and missing poster/profile fallbacks.
- Fact loading, no-fact availability, keyboard focus/Escape in the dialog, retry, stale fallback, and switching movies while a request is in flight.
- Mobile and desktop layout.

For production locally, run `npm run build` then `npm start`. `npm run db:dev` creates development migrations; `npm run db:migrate` applies committed migrations. `npm run db:studio` opens Prisma Studio.

## Scope and tradeoffs

Variant A focuses on backend caching, concurrent requests, and failure recovery. Variant B's client-cache and optimistic-edit requirements are out of scope. Genre browsing and multiple favorites extend the original exercise. Fact generation uses the required OpenAI API.

- Facts are stored in PostgreSQL and reused for 60 seconds per user/movie. There is no Redis or background refresh job.
- A local Map shares running requests within a process. PostgreSQL transaction-scoped advisory locks coordinate generation across Vercel instances. The tradeoff is holding a database connection while the provider runs; waits and transactions are bounded.
- Saved favorites remain available during a TMDB outage. An OpenAI failure leaves the favorite saved and returns an older fact when possible.
- OpenAI can return no fact for a film. The UI offers retry and labels generated facts as unverified.
- Auth.js uses a pinned v5 beta. The initial dependency audit reported seven moderate development-tool findings in ESLint's dependency tree; review these before submission.

## With two more hours

Finish the browser acceptance checks above and add regression tests for onboarding and switching movies in the fact dialog. Then add per-user generation limits and operational metrics, review dependency updates, and consider a durable job queue if generation traffic grows.

## AI usage

- Used Codex to assist with scaffolding, implementation, and refactoring.
- Used Codex to develop and run tests, inspect failures, and review security boundaries.
- Used Codex to draft setup and architecture documentation. Automated and live service checks are reported separately from browser flows still awaiting manual verification.

## References and credits

- [Auth.js installation](https://authjs.dev/getting-started/installation?framework=Next.js)
- [Prisma PostgreSQL driver adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- [TMDB discovery](https://developer.themoviedb.org/reference/discover-movie), [attribution requirements](https://developer.themoviedb.org/docs/faq), and [approved logo source](https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) and [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

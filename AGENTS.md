# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Dev (all apps in parallel)
pnpm dev

# Dev (single app)
pnpm -F @studysuite/api dev       # Hono API on port 3000
pnpm -F @studysuite/web dev       # Vue frontend on port 5173
pnpm -F @studysuite/scraper dev   # Node scraper

# Type checking
pnpm typecheck                    # all packages
pnpm -F @studysuite/api typecheck # single package

# Lint / format
pnpm lint
pnpm format

# Database (requires DATABASE_URL in .env)
pnpm -F @studysuite/db db:generate  # generate migration from schema
pnpm -F @studysuite/db db:migrate   # apply migrations
pnpm -F @studysuite/db db:studio    # open Drizzle Studio
```

## Architecture

### Monorepo layout

```
apps/api      — Hono HTTP server, runs under Bun
apps/scraper  — Node scraper (Playwright)
apps/web      — Vue 3 + Vuetify SPA, served by Vite
packages/db      — Drizzle ORM client + schema (shared by api and scraper)
packages/shared  — Zero-runtime-dep package: Zod schemas and shared types
packages/tsconfig — Base tsconfig variants (base / node / bun)
```

### Workspace resolution

npm scope is `@studysuite`. When an app declares `"@studysuite/shared": "workspace:*"`, pnpm symlinks it to `packages/shared/`. Each package's `exports` field points to its raw TypeScript source (e.g. `"./src/index.ts"`), so Bun/Vite/tsx consume it directly without a build step.

`tsconfig.base.json` at the root defines `paths` for `@studysuite/shared` and `@studysuite/db` so TypeScript resolves them to the correct source files.

### DB package

`packages/db/src/client.ts` exports `createDb(connectionString: string)` — call it in the app with `process.env.DATABASE_URL`. Schema tables go in `packages/db/src/schema/index.ts`; re-export them from there and `drizzle-kit` picks them up via `drizzle.config.ts`.

### Scraper — two-pass reconciliation

The scraper (`apps/scraper`) scrapes a Celcat planning and syncs it to the DB.

**Pass 1** — per-week, inside a transaction:
- `applyWeekEvents(db, weekMonday, scraped[])` — loads existing events for the week, computes the diff, mutates the `events` table (delete removed, insert added/updated), returns a `WeekDiff` object with raw `added`, `removed`, and `updated` slots. Does **not** write `eventChanges`.

**Pass 2** — after all weeks, single batch:
- `insertAllChanges(db, diffs[])` — aggregates all `WeekDiff`s, matches removed+added pairs by `title|relKey` (relKey = sorted rooms + teachers + groups) to detect moves — **including cross-week moves**. Inserts all `eventChanges` in one `db.insert`.

`change_type` enum values: `added`, `removed`, `updated`, `moved`.
For `moved` events, `diff` contains `{ newStart, newEnd }` (ISO strings).

### Runtimes per app

| App     | Runtime | Dev tool  | tsconfig variant         |
|---------|---------|-----------|--------------------------|
| api     | Bun     | `bun --hot` | `@studysuite/tsconfig/bun.json` |
| scraper | Node    | `tsx watch` | `@studysuite/tsconfig/node.json` |
| web     | Node    | `vite`    | `@studysuite/tsconfig/base.json` |

### Web — icons

Vuetify is configured with both `mdi` (default) and `fa` iconsets. Use `mdi-*` for most icons. Use `fa:fab fa-*` for brand icons (e.g. Discord: `fa:fab fa-discord`).

### Discord integration

- Users store `discordAccessToken` + `discordTokenExpiresAt` (set on login).
- API has `/api/admin/guilds` (list configured guilds + nested roles) and `/api/me/guilds` (user's guilds from Discord token).
- `discord_role_mappings` table maps Discord guild+role to student group membership.
- Admins are exempt from the pending-redirect guard.

### Commit convention

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.
Common types: `feat`, `fix`, `chore`, `refactor`, `docs`, `build`, `ci`, `test`.

### Key constraints

- The web app never imports `@studysuite/db` — DB access is server-side only.
- `drizzle.config.ts` is excluded from `packages/db/tsconfig.json` (drizzle-kit bundles it itself; including it breaks `rootDir`).
- `schema/index.ts` must always have at least `export {}` to be a valid TS module.
- `pnpm.onlyBuiltDependencies: ["esbuild"]` in root `package.json` is required to allow esbuild's postinstall script.
- `ALTER TYPE ... ADD VALUE` (Postgres enum extension) cannot run inside a transaction — drizzle-kit handles this via migration breakpoints.

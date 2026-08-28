# AGENTS.md

This file provides guidance to agents when working with code in this repository.

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
apps/scraper  — Node scraper (Playwright), scrapes Prose Consult
apps/web      — Vue 3 + Vuetify SPA, served by Vite
packages/db      — Drizzle ORM client + schema (shared by api and scraper)
packages/shared  — Zero-runtime-dep package: Zod schemas, shared types, config loader
packages/tsconfig — Base tsconfig variants (base / node / bun)
```

### Workspace resolution

npm scope is `@studysuite`. When an app declares `"@studysuite/shared": "workspace:*"`, pnpm symlinks it to `packages/shared/`. Each package's `exports` field points to its raw TypeScript source (e.g. `"./src/index.ts"`), so Bun/Vite/tsx consume it directly without a build step.

`tsconfig.base.json` at the root defines `paths` for `@studysuite/shared` and `@studysuite/db` so TypeScript resolves them to the correct source files.

### Runtimes per app

| App     | Runtime | Dev tool    | tsconfig variant                 |
| ------- | ------- | ----------- | -------------------------------- |
| api     | Bun     | `bun --hot` | `@studysuite/tsconfig/bun.json`  |
| scraper | Node    | `tsx watch` | `@studysuite/tsconfig/node.json` |
| web     | Node    | `vite`      | `@studysuite/tsconfig/base.json` |

---

## packages/shared

Two entry points:

- `@studysuite/shared` — Zod schemas and TypeScript types for events (`ParsedEvent`, `Location`, `Teacher`, `StudentGroup`)
- `@studysuite/shared/config` — config loader utilities: `loadConfig`, `zBool`, `zInt`

`loadConfig` reads a YAML file then overlays env vars via an explicit `envMap` (`ENV_VAR_NAME → dot.path`). Both `apps/api` and `apps/scraper` use this pattern.

---

## packages/db

`createDb(connectionString)` returns a Drizzle client. Schema tables:

| Table                       | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `events`                    | Scraped course events (title, startDate, endDate) |
| `locations`                 | Room names                                        |
| `teachers`                  | Teacher first/last name                           |
| `student_groups`            | Group internal names (e.g. `BUT3-A`)              |
| `student_group_memberships` | Parent/child hierarchy between groups             |
| `event_locations`           | event ↔ location junction                         |
| `event_teachers`            | event ↔ teacher junction                          |
| `event_student_groups`      | event ↔ studentGroup junction                     |
| `event_changes`             | Audit log of scraper diffs                        |
| `users`                     | Discord-authenticated users                       |
| `discord_guilds`            | Configured Discord servers                        |
| `discord_role_mappings`     | Discord role → student group mapping              |

`event_changes.change_type` enum: `added`, `removed`, `updated`, `moved`.
For `moved`, `diff` JSON contains `{ newStart: ISO, newEnd: ISO }`.

### Scraper — two-pass reconciliation

**Pass 1** — per-week, inside a transaction:
`applyWeekEvents(db, weekMonday, scraped[])` — loads existing events for the week window, diffs against scraped list, mutates the `events` table (DELETE old, INSERT new/updated). Returns `WeekDiff { added: EventSlot[], removed: EventSlot[], updated: UpdatedEventChange[] }`. Does **not** write `eventChanges`.

`EventSlot` carries `title`, `startDate`, `endDate`, and a pre-computed `relKey` (`sortedRooms|sortedTeachers|sortedGroups`), used for move matching.

**Pass 2** — after all weeks scraped, one batch:
`insertAllChanges(db, diffs[])` — aggregates all `WeekDiff`s across the full run, matches `removed+added` pairs by `title|relKey` to detect moves (including **cross-week** moves). Inserts all `eventChanges` in a single `db.insert`.

---

## apps/scraper

Scrapes a **Prose Consult** planning page via Playwright.

**Config** (`config.yaml` + env overrides):
| Env var | Path | Default |
|---|---|---|
| `DATABASE_URL` | `database.url` | — |
| `PROSECONSULT_URL` | `scrape.url` | — |
| `HEADLESS` | `scrape.headless` | `true` |
| `SCRAPE_INTERVAL_MS` | `scrape.intervalMs` | `1800000` (30 min) |
| `SCRAPE_TIMEOUT_MS` | `scrape.timeoutMs` | `60000` (per page action) |
| `SCRAPE_DEBUG_DIR` | `scrape.debugDir` | `./debug` (failure screenshots) |
| `SCRAPE_STRICT_GROUPS` | `scrape.strictGroups` | `false` (only accept known group names) |

Run modes: watch loop (default) or `node index.js --once`.

**DOM structure** of the Prose Consult page:

- `#Planning > div` — event wrappers; `.style.left` gives pixel X position used to infer day column
- `div.labelLegend[style*="top: 20px"]` — day header cells; `.textContent` ends with `dd/mm/yyyy`; `.style.left` values used to compute column width
- `#x-auto-26` — week navigation container; children have IDs `x-auto-N`
- `.x-btn-pressed` — currently selected week button
- `.gwt-PopupPanel` — loading spinner; navigation waits for it to detach

**Event text parsing** (`apps/scraper/src/parser/`):

```
Line 0:         title
Lines 1..N-2:   rooms / teachers / groups (middle lines)
Line N-1:       hours  (format: "8h30 - 10h30")
```

Middle lines are categorized:

- **Teacher**: matches `UPPERCASE_LAST   TitleCase_First` (3-space separator after NBSP normalization). Regex: `/^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*   [A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' \-]*$/`
- **Path line**: contains `/` — building hierarchy, discarded
- **Room**: lines before the first teacher that are not path lines
- **Group**: lines after the last teacher that are not path lines

The site does not always emit a path line per room. When an event has no teacher,
the boundary is the last path line, so a trailing room with no path of its own is
read as a group (this is how `Salle 007` became a student group). With
`scrape.strictGroups` enabled, only names already in `student_groups` are accepted
and the rest are logged and dropped — run once without it to discover the real
groups, purge the bogus rows, then turn it on.

---

## apps/api

Hono server on Bun, port 3000.

**Config** env vars: `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `JWT_SECRET` (≥32 chars).

### Route table

| Method | Path                                        | Auth  | Description                                                        |
| ------ | ------------------------------------------- | ----- | ------------------------------------------------------------------ |
| GET    | `/health`                                   | —     | Health check                                                       |
| GET    | `/auth/discord`                             | —     | Redirect to Discord OAuth2 (`identify guilds guilds.members.read`) |
| GET    | `/auth/discord/callback`                    | —     | Exchange code, upsert user, issue JWT                              |
| GET    | `/auth/discord/my-guilds`                   | user  | User's guilds + roles from stored Discord token                    |
| GET    | `/auth/me`                                  | user  | Refresh JWT and return user DTO                                    |
| GET    | `/api/events/week`                          | —     | Events for a week (`?date=`)                                       |
| GET    | `/api/events/day`                           | —     | Events for a day (`?date=`)                                        |
| GET    | `/api/events/upcoming`                      | —     | Next N events (`?limit=`)                                          |
| GET    | `/api/events`                               | —     | Filtered events (`?from=&to=&teacherId=&roomId=&groupId=`)         |
| GET    | `/api/events/:id`                           | —     | Single event                                                       |
| GET    | `/api/teachers`                             | —     | All teachers                                                       |
| GET    | `/api/rooms`                                | —     | All rooms                                                          |
| GET    | `/api/groups`                               | —     | All groups with parent/child hierarchy                             |
| GET    | `/api/groups/:id`                           | —     | Single group with hierarchy                                        |
| GET    | `/api/groups/:id/events`                    | —     | Events for a group                                                 |
| POST   | `/api/groups/:id/parents`                   | —     | Add parent relation                                                |
| DELETE | `/api/groups/:id/parents/:parentId`         | —     | Remove parent relation                                             |
| GET    | `/api/admin/users`                          | admin | List all users                                                     |
| PATCH  | `/api/admin/users/:id`                      | admin | Update user (status, role, group, isAdmin)                         |
| GET    | `/api/admin/guilds`                         | admin | List guilds with nested role mappings                              |
| POST   | `/api/admin/guilds`                         | admin | Create guild                                                       |
| DELETE | `/api/admin/guilds/:id`                     | admin | Delete guild                                                       |
| POST   | `/api/admin/guilds/:id/mappings`            | admin | Add role→group mapping                                             |
| DELETE | `/api/admin/guilds/:id/mappings/:mappingId` | admin | Remove mapping                                                     |

**JWT**: HS256, 7-day expiry. Claims: `sub` (user UUID), `discordId`, `isAdmin`, `status`, `role`.

**Discord OAuth flow**:

1. `/auth/discord` → encodes optional `clientRedirectUri` in base64url `state` param
2. `/auth/discord/callback` → exchanges code, fetches `@me` + member roles across all configured guilds in parallel
3. If any guild role matches a `discord_role_mappings` entry → auto-approve user, assign `studentGroupId`
4. Issues JWT; redirects to `clientRedirectUri?token=...` if provided

---

## apps/web

Vue 3 + Vuetify 3 + Pinia SPA.

**Icon setup**: both `mdi` (default) and `fa` iconsets registered. Use `mdi-*` for standard icons, `fa:fab fa-*` for brand icons (e.g. Discord: `fa:fab fa-discord`).

**Route structure**:
| Path | Auth | Component |
|---|---|---|
| `/login` | — | LoginView |
| `/pending` | — | PendingView |
| `/auth/callback` | — | AuthCallbackView |
| `/` | — | HomeView |
| `/planning` | — | PlanningView |
| `/planning/compare` | — | PlanningComparisonView |
| `/teachers` | — | TeachersView |
| `/rooms` | — | RoomsView |
| `/profile` | user | ProfileView |
| `/admin/*` | admin | AdminLayout → groups / users / discord-mappings |

**Route guard logic**:

- Authenticated + approved → skip `/login`
- Pending (non-admin) → redirect to `/pending` on any non-exempt route
- `requiresAdmin` → redirect to `/` if not admin

**Stores**: `auth` (JWT decode + login/logout), `events`, `groups`, `notifications`.

**API client** (`src/lib/api.ts`): typed Hono client via `hono/client` using `AppType` exported from `apps/api`.

---

## Commit convention

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.
Common types: `feat`, `fix`, `chore`, `refactor`, `docs`, `build`, `ci`, `test`.

---

## Key constraints

- The web app never imports `@studysuite/db` — DB access is server-side only.
- `drizzle.config.ts` is excluded from `packages/db/tsconfig.json` (drizzle-kit bundles it itself; including it breaks `rootDir`).
- `schema/index.ts` must always have at least `export {}` to be a valid TS module.
- `pnpm.onlyBuiltDependencies: ["esbuild"]` in root `package.json` is required to allow esbuild's postinstall script.
- `ALTER TYPE ... ADD VALUE` (Postgres enum extension) cannot run inside a transaction — drizzle-kit handles this via migration breakpoints.
- Cross-week move detection works because `insertAllChanges` sees all weeks' diffs at once. Adding per-week change insertion would regress this.

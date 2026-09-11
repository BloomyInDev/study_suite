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

# Tests (vitest; packages/shared and apps/api carry them)
pnpm test                         # all packages
pnpm -F @studysuite/shared test   # single package

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

## Time: Paris wall-clock labelled UTC

Every event timestamp — `events.start_date`, `events.end_date`, and the `startDate` /
`endDate` an api response carries — is a **label, not an instant**. The scraper builds
them with `Date.UTC` from the hour the Prose Consult page displays, so a course at
10h00 Paris is stored as `10:00:00Z`. Reading it back with the UTC getters gives the
hour a student actually sees.

The consequence: **`new Date()` cannot be compared with one of them.** Doing so is off
by the Paris UTC offset — one hour in winter, two in summer. Every availability feature
("Disponibles maintenant", free rooms, teacher busy/free, current-or-next event) was
wrong by that amount because of exactly this.

`@studysuite/shared/time` is the only correct way across that boundary:

| Helper                                                      | Use                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `wallClockNow()`                                            | "now", comparable with an event timestamp                   |
| `toWallClock(instant)`                                      | convert a real instant you already hold                     |
| `wallClockDayStart(instant?)` / `wallClockDayEnd(instant?)` | the Paris day's bounds; `…End` is exclusive                 |
| `fromWallClock(label)`                                      | the real instant a label denotes (inverse of `toWallClock`) |
| `wallClockToOffsetIso(label)`                               | that instant as `…+02:00`, for the wire                     |

It resolves the offset through an explicit `Europe/Paris` `Intl.DateTimeFormat`, never
the local getters. The predecessor (`dateToUTC`) read the process timezone, which is
Europe/Paris on a laptop and **UTC in the api container** — so availability was right in
dev and two hours out in production.

Rules of thumb:

- Query params `from` / `to` on the event routes are wall-clock too, matching the
  responses. Sending `new Date().toISOString()` shifts the window.
- Timestamps that are genuinely instants — `users.updated_at`, `discord_token_expires_at`,
  `assignments.due_date`, iCal's `DTSTAMP` — stay real dates and compare with `new Date()`.
  `HomeView` holds both and keeps them apart as `now` and `wallNow`.
- Displaying an event time means UTC getters or `timeZone: 'UTC'`, which is what
  `apps/web/src/lib/date.ts` does throughout.
- **The api's JSON says `Z` while meaning Paris.** Every event route takes a
  `dateFormat` param; `iso` (the default), `unix` and `unix-ms` all hand out the
  raw wall-clock label, so `iso` carries a `Z` it does not mean and the numeric
  pair are off by the Paris offset. An external consumer that does date
  arithmetic on them lands one or two hours early — a transit lookup for an 08:00
  class targeted a 06:00Z arrival. The numeric pair are the worse half: an epoch
  has no label reading at all, so a consumer cannot compensate the way it can
  once it knows about the `Z`. `iso-offset`, `unix-instant` and `unix-ms-instant`
  emit the true instant and are what any client outside this repo should ask for.
  The wrong three stay on purpose: `apps/web` and existing consumers already read
  them that way, and correcting them in place would break those silently.
  `packages/shared/src/time/index.test.ts` pins the offsets either side of both
  DST transitions, and `apps/api/src/lib/serialize.test.ts` asserts the legacy
  three stay wrong by exactly the offset — a regression guard, not an
  aspiration. Both must pass under any `TZ`, which is the bug they exist for.

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
| `users`                     | Accounts; identity lives in `user_identities`     |
| `user_identities`           | One row per external account a user signs in with |
| `discord_guilds`            | Configured Discord servers                        |
| `discord_role_mappings`     | Discord role → student group mapping              |
| `iut_group_mappings`        | IUT directory group → student group mapping       |
| `push_subscriptions`        | One row per browser that wants course reminders   |
| `push_reminder_sends`       | Which reminder has already gone out               |

`event_changes.change_type` enum: `added`, `removed`, `updated`, `moved`.
For `moved`, `diff` JSON contains `{ newStart: ISO, newEnd: ISO }`.

### Scraper — two-pass reconciliation

**Pass 1** — per-week, inside a transaction:
`applyWeekEvents(db, weekMonday, scraped[])` — loads existing events for the week window, diffs against scraped list, mutates the `events` table (DELETE old, INSERT new/updated). Returns `WeekDiff { added: EventSlot[], removed: EventSlot[], updated: UpdatedEventChange[] }`. Does **not** write `eventChanges`.

`EventSlot` carries `title`, `startDate`, `endDate`, and a pre-computed `relKey` (`sortedRooms|sortedTeachers|sortedGroups`), used for move matching.

A slot (`title|start|end`) can hold **several** events — the same meeting runs in
Montpellier and in Sète at the same hour — so both sides are bucketed per slot and
`matchSlot` pairs them within the bucket: identical `relKey`s pair off first
(untouched), leftovers pair greedily by shared groups, then teachers, then rooms
(`updated`), and whatever is still unpaired is a real `removed` / `added`. Keying
the scraped list on the slot alone silently dropped every event but the last one
in it.

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
`scrape.strictGroups` enabled, only names already in `student_groups` are accepted;
an unknown name is read as a room instead, since that is what it usually is. Run
once without it to discover the real groups, purge the bogus rows, then turn it
on. It is ignored while the table is empty, so a fresh database still bootstraps.

---

## apps/api

Hono server on Bun, port 3000.

**Config** env vars: `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `JWT_SECRET` (≥32 chars). The `iut` block (`IUT_DISPLAY_NAME`, `IUT_ISSUER_URL`, `IUT_CLIENT_ID`, `IUT_CLIENT_SECRET`, `IUT_REDIRECT_URI`) is optional — leave it out and the api boots with the IUT routes answering 503. The `push` block (`PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT`) is optional the same way, and so is the `bot` block (`BOT_API_KEYS`, comma-separated) — see [Discord bot access](#discord-bot-access).

### Route table

| Method | Path                                        | Auth  | Description                                                          |
| ------ | ------------------------------------------- | ----- | -------------------------------------------------------------------- |
| GET    | `/api/health`                               | —     | Health check                                                         |
| GET    | `/api/config`                               | —     | Login providers, their labels, and the push public key               |
| GET    | `/api/auth/discord`                         | —     | Redirect to Discord OAuth2 (`identify guilds guilds.members.read`)   |
| GET    | `/api/auth/discord/callback`                | —     | Exchange code, upsert user, issue JWT                                |
| GET    | `/api/auth/discord/my-guilds`               | user  | User's guilds + roles from stored Discord token                      |
| GET    | `/api/auth/iut`                             | —     | Redirect to the IUT bridge (PKCE); `?token=` links instead           |
| GET    | `/api/auth/iut/callback`                    | —     | Verify the ID token, upsert or link the identity, issue JWT          |
| GET    | `/api/auth/me`                              | user  | Refresh JWT and return user DTO                                      |
| GET    | `/api/events/week`                          | —     | Events for a week (`?date=`)                                         |
| GET    | `/api/events/day`                           | —     | Events for a day (`?date=`)                                          |
| GET    | `/api/events/upcoming`                      | —     | Next N events (`?limit=`)                                            |
| GET    | `/api/events`                               | —     | Filtered events (`?from=&to=&teacherId=&roomId=&groupId=`)           |
| GET    | `/api/events/:id`                           | —     | Single event                                                         |
| GET    | `/api/calendar.ics`                         | —     | iCal feed (`?groupId=&teacherId=&roomId=&from=&to=`)                 |
| PUT    | `/api/push/subscriptions`                   | opt.  | Register this browser for course reminders                           |
| GET    | `/api/push/subscriptions`                   | opt.  | Read back what a browser is registered for (`?endpoint=`)            |
| DELETE | `/api/push/subscriptions`                   | opt.  | Unregister a browser (`?endpoint=`)                                  |
| POST   | `/api/push/test`                            | opt.  | Push a notification to a browser now (`?endpoint=`)                  |
| GET    | `/api/bot/guilds/:discordGuildId/mappings`  | bot   | A server's Discord role → student group mappings                     |
| GET    | `/api/bot/assignments`                      | bot   | Homework of some groups and their ancestors (`?groupIds=&from=&to=`) |
| GET    | `/api/teachers`                             | —     | All teachers                                                         |
| GET    | `/api/rooms`                                | —     | All rooms                                                            |
| GET    | `/api/groups`                               | —     | All groups with parent/child hierarchy                               |
| GET    | `/api/groups/:id`                           | —     | Single group with hierarchy                                          |
| GET    | `/api/groups/:id/events`                    | —     | Events for a group                                                   |
| POST   | `/api/groups/:id/parents`                   | —     | Add parent relation                                                  |
| DELETE | `/api/groups/:id/parents/:parentId`         | —     | Remove parent relation                                               |
| GET    | `/api/admin/users`                          | admin | List all users                                                       |
| PATCH  | `/api/admin/users/:id`                      | admin | Update user (status, role, group, isAdmin)                           |
| GET    | `/api/admin/guilds`                         | admin | List guilds with nested role mappings                                |
| POST   | `/api/admin/guilds`                         | admin | Create guild                                                         |
| DELETE | `/api/admin/guilds/:id`                     | admin | Delete guild                                                         |
| POST   | `/api/admin/guilds/:id/mappings`            | admin | Add role→group mapping                                               |
| DELETE | `/api/admin/guilds/:id/mappings/:mappingId` | admin | Remove mapping                                                       |
| GET    | `/api/admin/iut-mappings`                   | admin | List IUT directory group mappings                                    |
| POST   | `/api/admin/iut-mappings`                   | admin | Map an IUT group to a role and a class                               |
| DELETE | `/api/admin/iut-mappings/:id`               | admin | Remove an IUT group mapping                                          |

### iCal feed

`GET /api/calendar.ics` returns an RFC 5545 document for calendar clients to subscribe to. Same filters as `GET /api/events` (`groupId`, `teacherId`, `roomId`, `from`, `to`); without `from` it reaches 60 days back, so the payload does not grow forever. No auth — like the rest of the event routes.

Event timestamps are Paris wall-clock stored as UTC (the scraper builds them with `Date.UTC` from what the page displays), so `lib/ical.ts` emits `DTSTART;TZID=Europe/Paris` with the UTC components and ships a `VTIMEZONE`. Emitting them as `Z` instants would shift every course by one or two hours.

### Course reminders — Web Push

A student who opts in gets a notification a configurable number of minutes
before each of their courses, whether or not the app is open.

**Why it needs a server at all.** The browser has no way to schedule a
notification for later on its own: Notification Triggers (`showTrigger`) was an
origin trial that Chrome removed, and Periodic Background Sync fires when the
browser feels like it — roughly twice a day — never at a time you ask for. Push
is the only mechanism that hits T-15 minutes with the tab closed, and push
requires something to send it.

`web-push` does the two parts worth not hand-rolling: the RFC 8292 VAPID header
(an ES256 JWT per push service origin) and the RFC 8291 payload encryption
(aes128gcm, keyed by the subscription's own P-256 key). The payload is opaque to
Google, Apple and Mozilla — they route a blob they cannot read. It runs fine
under Bun.

**Where the sender lives.** `lib/reminder-tick.ts`, on a 60-second
`setInterval` started from `index.ts`. In the api rather than a service of its
own because it needs exactly what the api already has: the database, and a route
off the host — the `frontend` network is deliberately not `internal`, which is
what lets the Discord and IUT token exchanges work.

Three things about it are not obvious:

- **The tick claims before it sends.** `push_reminder_sends` has a unique
  `(subscription_id, event_id)`, and the tick inserts with
  `ON CONFLICT DO NOTHING … RETURNING`, pushing only the rows it actually
  created. That is what makes it idempotent: an api restart mid-minute, or a
  second replica, claims nothing and sends nothing. Without it, "notify once"
  would depend on the process never being interrupted.
- **The window is one-sided.** A course is due when `start - lead <= now < start`
  — never early, and still true if a tick was missed, so a restart or a slow
  query delays a reminder instead of losing it. The claim table is what makes
  that safe to repeat.
- **`now` is `wallClockNow()`.** Event timestamps are Paris wall-clock labels
  (see [Time](#time-paris-wall-clock-labelled-utc)), so the comparison, the
  minute count and the hour in the notification body all stay in label space,
  where the offset cancels. `formatHour` reads the label with `timeZone: 'UTC'`;
  formatting it in `Europe/Paris` would apply the offset twice and announce a
  10h00 course at 12h00. `lib/reminder-match.ts` holds that logic free of the
  database and the config so it can be tested — `reminder-match.test.ts` pins
  both DST seasons.

**Configuration.** Optional, like `iut`: with no keypair the routes answer 503,
the ticker never starts, and `GET /api/config` reports `push.enabled: false` so
the web app hides the toggle entirely. Generate one with
`pnpm -F @studysuite/api exec web-push generate-vapid-keys`. The pair is an
identity, not a rotating secret — every subscription is bound to the public key
it was created with, so replacing it silently stops delivery to everyone already
subscribed. The block is `.nullish()` rather than `.optional()` because a
`config.yaml` copied from the example has `push:` present with every key
commented out, and YAML parses that as null.

**No account required.** `push_subscriptions.user_id` is nullable. The event
routes are public and `/profile` already serves visitors who picked their groups
locally, so reminders would otherwise be the one feature that demands an
account. A subscription belongs to a _browser_, not a user: a phone and a laptop
are two rows, and `POST`ing with a token merely links one to the account so it
dies with it.

**JWT**: HS256, 7-day expiry. Claims: `sub` (user UUID), `isAdmin`, `status`, `role`. `requireAuth` re-reads `status` and `isAdmin` from the database on every request, so a rejection takes effect before the token expires.

**Discord OAuth flow**:

1. `/api/auth/discord` → encodes optional `clientRedirectUri` in base64url `state` param
2. `/api/auth/discord/callback` → exchanges code, fetches `@me` + member roles across all configured guilds in parallel
3. If any guild role matches a `discord_role_mappings` entry → auto-approve user, assign `studentGroupId`
4. Issues JWT; redirects to `clientRedirectUri?token=...` if provided

### Discord bot access

A Discord bot (EliteBatKBot) reads and writes on its members' behalf with no
JWT. It sends `Authorization: Bot <key>`, where the key is one of
`bot.apiKeys`, in two ways:

- **As a member**, on the ordinary user routes, adding
  `X-Acting-Discord-User: <snowflake>`. `requireAuth` resolves the snowflake
  through `user_identities` (`provider = 'discord'`) and runs the request as
  that account: its group, its status, its `completedByMe`, and `createdBy`
  on what it creates. A snowflake that no account is linked to gets
  **`403 NOT_LINKED`**, so the bot can tell the member to sign in once on the
  site. Nothing else changes for the routes themselves.
- **As itself**, on `/api/bot/*` (`requireBot`), for what serves a whole
  channel rather than one member: a server's role mappings, and a class's
  homework for reminders.

Things that are not obvious:

- **An acting request is never admin**, even when the account is: the payload
  is built with `isAdmin: false`. The bot has no admin surface, and a leaked
  key must not reach `/api/admin` through whichever admin it names.
- **Every key is a skeleton key** for all accounts with a linked Discord
  identity. There are several so each bot, or each rotation, has its own and
  can be revoked alone by removing it. `matchesBotKey` hashes before
  `timingSafeEqual` and checks every key rather than stopping at the first
  match, so the timing leaks neither a key's length nor which one matched.
- **`optionalAuth` ignores `Bot`**: the push routes stay browser-only.
- **The change feed cursor.** `GET /api/events/changes?since=` returns the
  changes detected strictly after an instant, oldest first, for a poller to
  advance to the last `detectedAt` it handled. The comparison truncates
  `detected_at` to milliseconds: Postgres stores microseconds and the DTO
  carries milliseconds, so a raw `>` returns the cursor's own row forever.
  One scraper run shares a single `detected_at`, so a run larger than `limit`
  is cut short — pollers should keep `groupIds` narrow.

---

## Identity: two providers, one account

`users` used to **be** the Discord identity — `discord_id NOT NULL UNIQUE` — which
left no room for a second provider. `user_identities` holds one row per external
account instead, unique on `(provider, subject)`; `users` keeps only status, role
and admin flag. The `users.discord_*` columns are still written on every Discord
login so a rollback works, and migration `0013` backfilled an identity row for
every existing user. **Drop those columns in a separate change once that has
baked** — nothing reads them any more except the transitional lookup in the
Discord callback.

The display name is no longer a column: `pickDisplay()` (`lib/identity-display.ts`)
picks the Discord name first, then the IUT one, and the DTO hands out
`displayName` / `avatarUrl` / `identities` where it used to hand out
`discordUsername` / `discordAvatar` / `discordId`.

### IUT — the department's LDAP↔OIDC bridge

Authorization Code + PKCE against a bridge a classmate runs on `webinfo`, which
fronts the department's LDAP directory. `/api/auth/iut` → `/api/auth/iut/callback`,
mirroring the Discord pair, with `groups` claims matched against
`iut_group_mappings` for auto-approval.

Three things about it are not obvious:

- **`sub` is the raw LDAP DN** (`uid=lubenb,ou=Ann3,…`), so it carries the year
  and changes at every rollover. Keying accounts on it would orphan most of them
  each September. `iutSubject()` keys on `preferred_username` instead and parks
  the DN in `provider_sub_raw` for diagnostics. Swap it back only if the bridge
  ever emits a genuinely stable `sub`.
- **PKCE is not stateless.** Discord's `state` is a plain base64 blob, but the
  code verifier must never reach the browser's URL, so it rides in a signed
  HttpOnly `SameSite=Lax` cookie (`iut_oidc`, 10 min) along with the nonce, the
  state and the client redirect. Lax is enough: the bridge returns the user with
  a top-level GET.
- **Its TLS chain does not validate.** The server sends the wrong intermediate
  for its leaf, so `curl`, Node and Bun all fail with
  `unable to get local issuer certificate`. `apps/api/certs/` carries the
  intermediate the leaf's AIA extension points at, and the Dockerfile sets
  `NODE_EXTRA_CA_CERTS`. Never reach for `NODE_TLS_REJECT_UNAUTHORIZED=0` — that
  disables verification process-wide, Discord and Postgres included.

The directory carries the population and the year (`etudiants`, `ann3`) but not
the TD group, so a mapping's class is an anchor: the student narrows it down
through `PATCH /api/auth/me/student-group`, the same path a Discord role already
takes. The access token is discarded — 900 s, no refresh, and userinfo returns
nothing the ID token does not.

**Naming it.** `iut` is an internal identifier — the provider enum, the table,
the routes — and stays that way. What a _user_ sees comes from
`iut.displayName` (default `IUT`) via `GET /api/config`, which lists the
providers this deployment actually has. The login page renders one button per
entry, so an instance with no `iut` block shows no button rather than one that
answers 503, and another department sets its own name without rebuilding the
image. `stores/providers.ts` seeds the defaults the static build bakes into
`login/index.html` — it cannot fetch — and replaces them on hydration.

**Linking.** A Discord account and an IUT account are two accounts unless the
user links them, and there is no email to match on (the Discord flow only asks
for `identify`). `/api/auth/iut?token=<app jwt>` attaches the identity to the
session that started the flow instead of creating a user; the profile page
exposes it. The token travels in the query because a redirect cannot carry an
Authorization header — the same reason it comes back that way.

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
| `/admin/*` | admin | AdminLayout → groups / users / discord-mappings / iut-mappings / changes |

**Route guard logic**:

- Authenticated + approved → skip `/login`
- Pending (non-admin) → redirect to `/pending` on any non-exempt route
- `requiresAdmin` → redirect to `/` if not admin

**Stores**: `auth` (JWT decode + login/logout), `events`, `groups`, `notifications`
(the Vuetify snackbars — _not_ push), `providers`, `reminders`.

**API client** (`src/lib/api.ts`): typed Hono client via `hono/client` using `AppType` exported from `apps/api`.

### The push service worker

`public/sw.js` handles `push` and `notificationclick`, and nothing else. It is
**not** a caching worker and must not become one: nginx substitutes the real
origin into a fresh copy of `dist` at every container start (see below), and a
Workbox-style precache would keep serving the previous one. It registers no
`fetch` handler at all, which is the cheapest way to guarantee that.

It lives in `public/` and is therefore copied verbatim, never bundled — so it is
plain JS and cannot import from `src/`. eslint needs the `self` global declared
for it explicitly (`eslint.config.js`), since typescript-eslint's blanket
`no-undef` suppression only covers TS files.

`lib/push.ts` owns the browser side: registration, `pushManager.subscribe`, and
keeping the api's row in step. Two things it has to get right — the permission
prompt must be driven by a real click, or every browser drops it; and
`applicationServerKey` gets the decoded 65 bytes rather than the base64url
string, which browsers accept less uniformly than the spec suggests.

`stores/reminders.ts` drives the settings card on `/profile`. The subscription
belongs to the browser, so the toggle is per-install, and `App.vue` re-syncs the
group ids whenever they change — a student moved to another class would
otherwise keep being reminded of their old timetable.

**The card has three states, and `/profile` gates its whole `v-col` on
`reminders.shown`:**

- `visible` — the working toggle. Everywhere push works in an ordinary tab.
- `installPrompt` — the feature, pitched, with no toggle and the three steps to
  add the app to the home screen. **iOS only**, and it is why the iOS case is
  not simply hidden: Safari grants push to a standalone PWA alone, so a plain
  tab has no `PushManager` at all, and hiding the card there would tell an
  iPhone student the app has no reminders when they are one "Sur l'écran
  d'accueil" away. Nowhere else needs installing, so nowhere else sees this.
- neither — nothing rendered, because nothing on that screen would help: a
  browser without push, or a deployment with no keypair.

What _is_ actionable stays inside the card: a permission blocked in site
settings, and no group picked.

`needsInstall` is set in `init()` **before** the `!supported` early return —
on iOS `supported` is false, so setting it after would leave the prompt dead.
Both flags start false and settle after mount, so the static render and the
first client frame agree; the card is client-only by construction, which is
fine on a `noindex` page.

### Head tags and static rendering

Every page's title, description and Open Graph tags come from one table,
`src/lib/pages.ts`. `usePageSeo()` — called once, in `App.vue` — feeds it to
unhead, so the head follows the route; the views themselves carry no head code.

`pnpm build` runs **vite-ssg**, which renders each route to its own HTML file
(`dist/planning/index.html`, …) with those tags already in it, because a crawler
does not run JavaScript and would otherwise see the same tags on every URL.
nginx's `try_files $uri $uri/ /index.html` serves them before the SPA fallback.

Consequences to keep in mind:

- `main.ts` exports `createApp = ViteSSG(...)` instead of mounting: vite-ssg owns
  the app, router and head instances. `router.ts` therefore exports `routes` and
  `registerGuards` rather than a router.
- The route guard is skipped under `import.meta.env.SSR` — it answers for a
  visitor with no account, which would give every protected route the login
  page's head.
- The static render runs under jsdom (`ssgOptions.mock`), so Vuetify takes its
  browser path and needs `ResizeObserver` & co.; `main.ts` stubs them for SSR.
  Vuetify is also `ssr.noExternal`, as Node cannot import its `.css` files.
- `@unhead/vue` is pinned to the major vite-ssg depends on. Two copies mean two
  injection keys, and the tags silently never reach the rendered HTML.
- A new route needs an entry in `pages.ts`; without one it is titled
  `Study Suite` and marked `noindex`.

`robots.txt` and `sitemap.xml` are generated from the same table by
`ssgOptions.onFinished` (see `vite.config.ts`): the sitemap lists the entries
that are not `noindex`, robots disallows the ones that are. Both need the
absolute origin, which is why they are built rather than kept in `public/`.

`VITE_SITE_URL` is the absolute origin the `og:` tags, the canonical link and
the sitemap are built from — crawlers do not resolve relative URLs. A local
build takes it from the environment and falls back to the dev server.

**The image does not bake it in.** The docker build sets it to the sentinel
`__SITE_URL__`, and `docker-entrypoint.sh` (installed into nginx's
`/docker-entrypoint.d/`) substitutes the real origin from `$SITE_URL` at
container start, so one image serves any origin and a restart is enough to
change it. `dist` is kept pristine at `/usr/share/nginx/template` and copied to
`/usr/share/nginx/html` on every start — substituting in place would consume the
sentinel on the first boot and leave nothing for the second to replace. Only
text formats are rewritten; the icons and the og image are binary. This makes
the served root mutable at boot, so it cannot be a read-only mount.

nginx serves `$uri/index.html` rather than `$uri/`: matching the directory makes
it 301 to `/planning/`, away from the URL the router and the canonical tag use,
and it builds that redirect from its own scheme and host — behind a
TLS-terminating proxy it would point back at `http://`.

`public/og-image.png` (1200×630) is generated from `public/og-image.svg` with
`rsvg-convert -w 1200 -h 630 public/og-image.svg -o public/og-image.png`.

---

## Commit convention

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.
Common types: `feat`, `fix`, `chore`, `refactor`, `docs`, `build`, `ci`, `test`.

---

## Key constraints

- **The app is in production and the database holds real data.** Migrations must be
  additive and backward compatible: a new column is nullable or carries a `DEFAULT`,
  and a `DROP`/`RENAME` needs a backfill plan. A change to what identifies an event
  (its title, the timestamp format) makes the next reconcile emit a wave of bogus
  `removed`+`added` rows into `event_changes`, which users now see on
  `/planning/changes` — say so before making one.
- The web app never imports `@studysuite/db` — DB access is server-side only.
- `drizzle.config.ts` is excluded from `packages/db/tsconfig.json` (drizzle-kit bundles it itself; including it breaks `rootDir`).
- `schema/index.ts` must always have at least `export {}` to be a valid TS module.
- pnpm 11 ignores the `pnpm` field of `package.json`: `allowBuilds` (esbuild's postinstall, without which vite cannot start) and `overrides` live in `pnpm-workspace.yaml`. The version is pinned by `packageManager` and by `npm install -g pnpm@11.21.0` in
  each Dockerfile — **the two must be the same exact version**. A range (`pnpm@11`)
  drifts to whatever is latest at build time, and pnpm then honours `packageManager`
  by fetching the pinned build over the network on _every_ invocation. The migrate
  container sits on the `internal: true` `backend` network, so that fetch cannot
  resolve and blocks ~86 s before falling back to the store copy — a 1.7 s job took
  87 s. Bump both together.
- `ALTER TYPE ... ADD VALUE` (Postgres enum extension) cannot run inside a transaction — drizzle-kit handles this via migration breakpoints.
- **A migration is the `.sql` file, its snapshot _and_ its entry in
  `migrations/meta/_journal.json`.** `drizzle-kit migrate` reads the journal, not
  the directory: a migration missing from it is silently skipped, the run exits 0,
  and the only symptom is a column that never appears. Check the journal's last
  entry after generating, and never `git checkout --` that file to undo unrelated
  churn — it takes the new entry with it. `pnpm -F @studysuite/db exec drizzle-kit
check` verifies the chain.
- `pnpm format` reformats **the whole repo**, which is not prettier-clean: it
  rewrites files no one touched, `pnpm-lock.yaml` and the drizzle snapshots
  included. Run `pnpm exec prettier --write <the files you changed>` instead;
  reverting the collateral afterwards is what loses generated content.
- Cross-week move detection works because `insertAllChanges` sees all weeks' diffs at once. Adding per-week change insertion would regress this.
- The push service worker must stay cache-free — see [The push service worker](#the-push-service-worker). Adding Workbox precaching would serve the pre-substitution `__SITE_URL__` build.
- Never compare `new Date()` with an event timestamp — see [Time](#time-paris-wall-clock-labelled-utc). Use `wallClockNow()` from `@studysuite/shared/time`.

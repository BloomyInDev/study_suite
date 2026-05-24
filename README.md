# Study Suite

Monorepo pnpm — API Hono/Bun, scraper Node, frontend Vue 3 + Vuetify.

## Prérequis

- Node 22+
- pnpm 10+
- Docker
- Bun

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
```

## Commandes

| Commande                         | Description                        |
| -------------------------------- | ---------------------------------- |
| `pnpm dev`                       | Lance toutes les apps en parallèle |
| `pnpm -F @projet/api dev`        | API seule (port 3000)              |
| `pnpm -F @projet/web dev`        | Frontend seul (port 5173)          |
| `pnpm -F @projet/scraper dev`    | Scraper seul                       |
| `pnpm typecheck`                 | Vérifie tous les types             |
| `pnpm lint`                      | Lint tout le code                  |
| `pnpm format`                    | Formate tout le code               |
| `pnpm -F @projet/db db:generate` | Génère les migrations Drizzle      |
| `pnpm -F @projet/db db:migrate`  | Applique les migrations            |
| `pnpm -F @projet/db db:studio`   | Ouvre Drizzle Studio               |

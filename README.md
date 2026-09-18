# Study Suite

Monorepo pnpm. API Hono/Bun, scraper Node, frontend Vue 3 + Vuetify.

## Prérequis

- Node 22
- pnpm 11.21.0, la version exacte que fixe `packageManager`
- Docker
- Bun

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
```

## Commandes

| Commande                             | Description                        |
| ------------------------------------ | ---------------------------------- |
| `pnpm dev`                           | Lance toutes les apps en parallèle |
| `pnpm -F @studysuite/api dev`        | API seule (port 3000)              |
| `pnpm -F @studysuite/web dev`        | Frontend seul (port 5173)          |
| `pnpm -F @studysuite/scraper dev`    | Scraper seul                       |
| `pnpm typecheck`                     | Vérifie tous les types             |
| `pnpm lint`                          | Lint tout le code                  |
| `pnpm format`                        | Formate tout le code               |
| `pnpm -F @studysuite/db db:generate` | Génère les migrations Drizzle      |
| `pnpm -F @studysuite/db db:migrate`  | Applique les migrations            |
| `pnpm -F @studysuite/db db:studio`   | Ouvre Drizzle Studio               |

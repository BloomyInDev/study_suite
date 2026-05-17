# Plan : Setup initial du monorepo

## Objectif

Créer la structure d'un monorepo pnpm vide mais fonctionnel. Aucune logique métier, aucun scraper, aucun endpoint réel. Juste le squelette, les configs partagées, et un "hello world" minimal dans chaque app pour valider que tout démarre.

## Stack

- **Package manager** : pnpm (workspaces)
- **Langage** : TypeScript partout
- **Runtimes** : Bun pour l'API, Node pour le scraper, Vite/Node pour le web
- **DB** : Postgres via Docker Compose (local), Drizzle ORM
- **API** : Hono
- **Frontend** : Vue 3 + Vuetify + Vite

## Structure cible

```
.
├── apps/
│   ├── api/                  # Hono sous Bun
│   ├── scraper/              # Node + Playwright (vide pour l'instant)
│   └── web/                  # Vue 3 + Vuetify
├── packages/
│   ├── db/                   # Drizzle schema + client
│   ├── shared/               # Types et schémas Zod partagés
│   └── tsconfig/             # tsconfigs de base
├── .env.example
├── .gitignore
├── .nvmrc
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Étapes

### 1. Racine du monorepo

- `package.json` racine en `"private": true`, avec scripts `dev`, `build`, `lint`, `typecheck` qui délèguent aux workspaces via `pnpm -r`
- `pnpm-workspace.yaml` déclarant `apps/*` et `packages/*`
- `.nvmrc` avec une version Node LTS récente (22.x)
- `.gitignore` standard (node_modules, dist, .env, .turbo si jamais, coverage, .DS_Store)
- `.env.example` avec `DATABASE_URL` et `PROSECONSULT_URL` en placeholders
- `tsconfig.base.json` : strict, `moduleResolution: "bundler"`, `target: "ES2022"`, paths vers les packages internes

### 2. `packages/tsconfig`

- Un package qui exporte des `tsconfig.json` de base réutilisables
- Trois variantes : `base.json`, `node.json` (pour scraper), `bun.json` (pour API)
- `package.json` avec `"name": "@projet/tsconfig"` et les fichiers exportés

### 3. `packages/shared`

- Package TypeScript pur, zero dépendance runtime lourde
- Dépendance sur `zod`
- `src/index.ts` qui exporte un placeholder (genre `export const VERSION = '0.0.1'`)
- `package.json` avec `"name": "@projet/shared"`, `"exports"` pointant sur `./src/index.ts`
- `tsconfig.json` étendant `@projet/tsconfig/base.json`

### 4. `packages/db`

- Dépendances : `drizzle-orm`, `postgres` (driver postgres-js), `drizzle-kit` en dev
- `src/schema/index.ts` vide (juste un commentaire `// schemas go here`)
- `src/client.ts` qui exporte une fonction `createDb(connectionString: string)` retournant le client Drizzle typé
- `src/index.ts` qui re-exporte tout (`client`, `schema`)
- `drizzle.config.ts` à la racine du package pointant sur `src/schema` et `./migrations`
- Dossier `migrations/` créé mais vide (`.gitkeep`)
- Scripts npm : `db:generate`, `db:migrate`, `db:studio`
- `package.json` avec `"name": "@projet/db"`

### 5. `apps/api`

- Hono + Bun
- `src/index.ts` avec une app Hono minimale : `GET /` retourne `{ status: 'ok' }`, `GET /health` aussi
- Importe `@projet/db` et `@projet/shared` (même sans les utiliser, juste pour valider la résolution des workspaces)
- `package.json` avec script `dev: "bun run --hot src/index.ts"`
- `tsconfig.json` étendant `@projet/tsconfig/bun.json`
- Dépendance : `hono`, et `@projet/db`, `@projet/shared` en `workspace:*`

### 6. `apps/scraper`

- Node + TypeScript (pas Playwright pour l'instant, juste le squelette)
- `src/index.ts` qui log `"scraper booted"` et exit (placeholder)
- Dépendance dev : `tsx` pour le dev mode
- `package.json` avec script `dev: "tsx watch src/index.ts"`
- `tsconfig.json` étendant `@projet/tsconfig/node.json`
- Dépendances : `@projet/db`, `@projet/shared` en `workspace:*`

### 7. `apps/web`

- Vue 3 + Vuetify + Vite + TypeScript
- Setup via `pnpm create vite` (template `vue-ts`) puis ajout de Vuetify manuel, OU manuellement si plus propre
- Page d'accueil minimale "Hello" avec un composant Vuetify (genre un `<v-btn>`) pour valider l'intégration
- Dépendance : `@projet/shared` en `workspace:*` (pas `@projet/db`, le frontend n'y touche jamais)
- Garde le `package.json` standard de Vite

### 8. Docker Compose

- Un service `postgres` (image `postgres:16-alpine`)
- Variables d'env : `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (valeurs simples pour le dev local)
- Port `5432` exposé
- Volume nommé pour persister les données
- Pas de service api/scraper/web dans le compose pour l'instant — on les fera tourner en local via pnpm

### 9. Qualité de code

- Installer `prettier` et `eslint` à la racine, en devDependencies
- Configs partagées simples à la racine (`.prettierrc`, `eslint.config.js` flat config)
- Script `lint` et `format` à la racine
- Pas de pre-commit hook pour l'instant, on verra plus tard si besoin

### 10. README.md

Court, avec :
- Description du projet en 2 lignes
- Prérequis (Node 22+, pnpm, Docker, Bun)
- Setup : `pnpm install`, `cp .env.example .env`, `docker compose up -d`
- Commandes principales : `pnpm dev` (lance tout), `pnpm -F api dev`, `pnpm -F web dev`, etc.

## Critères de validation

À la fin, je dois pouvoir :

1. Faire `pnpm install` sans erreur
2. Faire `docker compose up -d` et avoir Postgres qui tourne
3. Faire `pnpm -F api dev` et hit `http://localhost:3000/health` qui retourne du JSON
4. Faire `pnpm -F web dev` et voir la page Vuetify minimale
5. Faire `pnpm -F scraper dev` et voir `"scraper booted"` dans la console
6. Faire `pnpm -r typecheck` (ou `pnpm -r exec tsc --noEmit`) sans erreur
7. Les imports `@projet/db` et `@projet/shared` depuis les apps résolvent correctement les sources TS

## Ce qu'il ne faut PAS faire

- Pas de schéma DB réel, juste les fichiers vides prêts à recevoir
- Pas de logique de scraping, pas de Playwright installé
- Pas d'endpoints API métier, juste `/` et `/health`
- Pas de routes Vue, juste la page d'accueil par défaut
- Pas de CI/CD, pas de Dockerfile pour les apps (on les fera plus tard)
- Pas de tests configurés (vitest viendra plus tard)
- Pas de Turborepo pour l'instant — pnpm scripts suffisent au début

## Conventions

- Nom du scope npm : `@projet` (à remplacer par le vrai nom si décidé)
- Ports par défaut : api `3000`, web `5173`, postgres `5432`
- Tout en TypeScript strict
- Modules ESM partout (`"type": "module"` dans les `package.json`)
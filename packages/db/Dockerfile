# Runs `drizzle-kit migrate` once against DATABASE_URL, then exits.
FROM node:22-alpine
RUN npm install -g pnpm@11
WORKDIR /app

# Copy manifests for all workspace packages (needed by pnpm for graph resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json     apps/api/
COPY apps/scraper/package.json apps/scraper/
COPY apps/web/package.json     apps/web/
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @studysuite/db...

COPY packages/ packages/

CMD ["pnpm", "--filter", "@studysuite/db", "run", "db:migrate"]

# ── installer ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS installer
RUN npm install -g pnpm@11.21.0
WORKDIR /app

# Copy manifests for all workspace packages (needed by pnpm for graph resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json     apps/api/
COPY apps/scraper/package.json apps/scraper/
COPY apps/scraper-ade/package.json apps/scraper-ade/
COPY apps/web/package.json     apps/web/
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @studysuite/api...

COPY packages/ packages/
COPY apps/api/ apps/api/

# ── runtime ───────────────────────────────────────────────────────────────────
FROM oven/bun:1
WORKDIR /app
COPY --from=installer /app /app

# The IUT bridge serves the wrong intermediate for its leaf, so its TLS chain
# does not validate on its own. See apps/api/certs/README.md — drop both lines
# once the department fixes it.
ENV NODE_EXTRA_CA_CERTS=/app/apps/api/certs/harica-geant-tls-r1.pem

EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]

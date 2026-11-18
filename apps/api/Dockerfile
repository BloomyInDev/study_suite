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

# ── web-ssr ──────────────────────────────────────────────────────────────────
# The page renderer (apps/web/src/entry-server.ts) as one self-contained file,
# so the runtime image needs none of the web dependencies. Only the server
# bundle comes from here: the template and the assets it names are fetched from
# the web container at request time (see apps/api/src/lib/ssr.ts).
FROM node:22-alpine AS web-ssr
RUN npm install -g pnpm@11.21.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json     apps/api/
COPY apps/scraper/package.json apps/scraper/
COPY apps/scraper-ade/package.json apps/scraper-ade/
COPY apps/web/package.json     apps/web/
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @studysuite/web...

COPY packages/ packages/
# web imports the api's types as a devDep
COPY apps/api/ apps/api/
COPY apps/web/ apps/web/

# The same values the web image is built with, so both renders agree: the api
# answers on the same origin, and the public one is substituted per request.
ENV VITE_API_URL=/
ENV VITE_SITE_URL=__SITE_URL__
ARG VITE_GIT_COMMIT_HASH=unknown
ENV VITE_GIT_COMMIT_HASH=${VITE_GIT_COMMIT_HASH}

RUN pnpm --filter @studysuite/web build:ssr

# ── runtime ───────────────────────────────────────────────────────────────────
FROM oven/bun:1
WORKDIR /app
COPY --from=installer /app /app
# Where config.ssr.bundlePath looks by default.
COPY --from=web-ssr /app/apps/web/dist-server /app/apps/web/dist-server

# The IUT bridge serves the wrong intermediate for its leaf, so its TLS chain
# does not validate on its own. See apps/api/certs/README.md — drop both lines
# once the department fixes it.
ENV NODE_EXTRA_CA_CERTS=/app/apps/api/certs/harica-geant-tls-r1.pem

EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]

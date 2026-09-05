# ── builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN npm install -g pnpm@11.21.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json     apps/api/
COPY apps/scraper/package.json apps/scraper/
COPY apps/web/package.json     apps/web/
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @studysuite/web...

COPY packages/ packages/
# apps/api source is needed because web imports its types as a devDep
COPY apps/api/ apps/api/
COPY apps/web/ apps/web/

# VITE_API_URL defaults to '/' so nginx proxies to the api container
ARG VITE_API_URL=/
ENV VITE_API_URL=${VITE_API_URL}

# The public origin is not known at build time — the entrypoint substitutes it
# into the rendered output on every start, from $SITE_URL.
ENV VITE_SITE_URL=__SITE_URL__

# Shown in the footer, linking back to the commit the image was built from
ARG VITE_GIT_COMMIT_HASH=unknown
ENV VITE_GIT_COMMIT_HASH=${VITE_GIT_COMMIT_HASH}

RUN pnpm --filter @studysuite/web build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM nginx:alpine
# Kept pristine: the entrypoint copies this to the served root and substitutes
# the origin there, so a restart can change it.
COPY --from=builder /app/apps/web/dist /usr/share/nginx/template
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# nginx's own entrypoint runs everything in here before starting the server.
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.d/40-site-url.sh
EXPOSE 80

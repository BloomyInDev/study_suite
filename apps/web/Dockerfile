# ── builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN npm install -g pnpm@11
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

# Public origin, baked into the og: tags of index.html
ARG VITE_SITE_URL=http://localhost
ENV VITE_SITE_URL=${VITE_SITE_URL}

# Shown in the footer, linking back to the commit the image was built from
ARG VITE_GIT_COMMIT_HASH=unknown
ENV VITE_GIT_COMMIT_HASH=${VITE_GIT_COMMIT_HASH}

RUN pnpm --filter @studysuite/web build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

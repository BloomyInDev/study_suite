# Use the official Playwright image — browsers + all system deps pre-installed
FROM mcr.microsoft.com/playwright:v1.60.0-noble
WORKDIR /app

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json     apps/api/
COPY apps/scraper/package.json apps/scraper/
COPY apps/web/package.json     apps/web/
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/

# Skip re-downloading browsers — they're already in the base image
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile --filter @studysuite/scraper...

COPY packages/ packages/
COPY apps/scraper/ apps/scraper/

CMD ["pnpm", "--filter", "@studysuite/scraper", "run", "scrape"]

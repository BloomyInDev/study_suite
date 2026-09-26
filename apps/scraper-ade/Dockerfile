# Plain Node: the scraper replays ADE's GWT-RPC calls over HTTP and needs
# no browser, unlike apps/scraper which runs on the Playwright image.
FROM node:22-slim
WORKDIR /app

RUN npm install -g pnpm@11.21.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json     apps/api/
COPY apps/scraper/package.json apps/scraper/
COPY apps/scraper-ade/package.json apps/scraper-ade/
COPY apps/web/package.json     apps/web/
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @studysuite/scraper-ade...

COPY packages/ packages/
COPY apps/scraper-ade/ apps/scraper-ade/

# Watch loop: rescrapes every scrape.intervalMs and stays up.
CMD ["pnpm", "--filter", "@studysuite/scraper-ade", "run", "start"]

FROM node:24-bookworm-slim

# better-sqlite3 compiles from source when no prebuilt binary matches
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/sources/package.json packages/sources/
RUN pnpm install --frozen-lockfile

# Chromium for the browser and account sources
RUN pnpm --filter @housing/sources exec playwright install --with-deps chromium

COPY . .
RUN pnpm --filter @housing/web build

ENV DATA_DIR=/data PORT=4747
VOLUME /data
EXPOSE 4747
CMD ["pnpm", "start"]

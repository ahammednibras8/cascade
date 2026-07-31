# syntax=docker/dockerfile:1.7

FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .configs .configs

COPY packages/worker/package.json packages/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/storage/package.json packages/storage/package.json

RUN --mount=type=cache,id=cascade-pnpm-store,target=/pnpm/store,sharing=locked \
pnpm install --frozen-lockfile --ignore-scripts --filter @cascade/worker... --network-concurrency=4 --child-concurrency=2

FROM deps AS build

COPY packages/worker packages/worker
COPY packages/core packages/core
COPY packages/database packages/database
COPY packages/storage packages/storage

RUN DATABASE_URL="postgresql://cascade:cascade@localhost:5432/cascade" pnpm --filter @cascade/database run build
RUN pnpm --filter @cascade/core run build
RUN pnpm --filter @cascade/storage run build
RUN pnpm --filter @cascade/worker run build


FROM node:24-slim AS runner

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/packages/worker ./packages/worker
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/database ./packages/database
COPY --from=build /app/packages/storage ./packages/storage

RUN mkdir -p ./node_modules/@cascade \
  && ln -s ../../packages/core ./node_modules/@cascade/core

CMD ["node", "packages/worker/dist/index.js"]
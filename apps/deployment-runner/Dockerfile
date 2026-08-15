# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

# Needed only by this service, because it controls local Docker.
RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .configs .configs

COPY apps/deployment-runner/package.json apps/deployment-runner/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json

RUN --mount=type=cache,id=cascade-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts --filter @cascade/deployment-runner... \
  --network-concurrency=4 --child-concurrency=2

FROM deps AS build

COPY apps/deployment-runner apps/deployment-runner
COPY packages/database packages/database
COPY packages/core packages/core
COPY packages/telemetry packages/telemetry

RUN DATABASE_URL="postgresql://cascade:cascade@localhost:5432/cascade" \
  pnpm --filter @cascade/database run build

RUN pnpm --filter @cascade/core run build
RUN pnpm --filter @cascade/telemetry run build
RUN pnpm --filter @cascade/deployment-runner run build

FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/apps/deployment-runner ./apps/deployment-runner
COPY --from=build /app/packages/database ./packages/database
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/telemetry ./packages/telemetry

CMD [ "node", "--experimental-loader=@opentelemetry/instrumentation/hook.mjs", "--import=@cascade/telemetry/register", "apps/deployment-runner/dist/index.js" ]

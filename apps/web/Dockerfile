# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS pnpm-base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@11.13.1 --activate \
  && pnpm config set store-dir /pnpm/store

FROM pnpm-base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,id=cascade-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts --filter @cascade/web...

FROM pnpm-base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .configs .configs
COPY apps/web apps/web

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

RUN pnpm --filter @cascade/web run build

RUN --mount=type=cache,id=cascade-pnpm-store,target=/pnpm/store \
  pnpm --config.ignore-scripts=true --filter @cascade/web deploy --legacy --prod /prod/web

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /prod/web/node_modules ./node_modules
COPY --from=build --chown=node:node /prod/web/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/web/build ./build

USER node

EXPOSE 3000

CMD ["node", "./node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"]

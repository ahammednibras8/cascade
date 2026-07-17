FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @cascade/web...

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .configs .configs
COPY apps/web apps/web
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/web/node_modules ./apps/web/node_modules
RUN pnpm --filter @cascade/web run build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter @cascade/web...

FROM base AS runner
ENV NODE_ENV=production

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=production-dependencies /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/build ./apps/web/build

WORKDIR /app/apps/web

EXPOSE 3000
CMD ["pnpm", "run", "start"]

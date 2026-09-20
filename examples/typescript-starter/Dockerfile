# syntax=docker/dockerfile:1.7

FROM node:24-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

WORKDIR /workspace

RUN corepack enable \
  && corepack prepare pnpm@11.13.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=cascade-starter-pnpm,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.json tsup.config.ts ./
COPY src ./src

RUN pnpm run check-types
RUN pnpm run build

FROM ghcr.io/ahammednibras8/cascade-worker:0.1.0

COPY --from=build /workspace/dist /app/tasks

ENV CASCADE_TASK_MODULE="file:///app/tasks/tasks.js"

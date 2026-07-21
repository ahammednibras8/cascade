import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("runs", "routes/runs.tsx"),
  route("runs/:runId", "routes/run-detail.tsx"),
  route("runs/:runId/events", "routes/run-events.ts"),
] satisfies RouteConfig;

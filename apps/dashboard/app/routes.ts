import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("tasks", "routes/tasks.tsx"),
  route("deployments", "routes/deployments.tsx"),
  route("deployments/:deploymentId", "routes/deployment-detail.tsx"),
  route("schedules", "routes/schedules.tsx"),
  route("schedules/new", "routes/new-schedule.tsx"),
  route("schedules/:scheduleId/edit", "routes/edit-schedule.tsx"),
  route("api-keys", "routes/api-keys.tsx"),
  route("runs", "routes/runs.tsx"),
  route("runs/stream", "routes/runs-stream.ts"),
  route("runs/:runId/events/stream", "routes/run-event-stream.ts"),
  route("runs/:runId", "routes/run-detail.tsx"),
] satisfies RouteConfig;

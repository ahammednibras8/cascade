export function formatRunDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function environmentRunsStreamLabel(input: {
  revalidatorState: "idle" | "loading";
  streamState: "connecting" | "connected" | "reconnecting";
}) {
  if (input.revalidatorState === "loading") {
    return "Refreshing runs...";
  }

  return input.streamState === "connected"
    ? "Live updates connected"
    : input.streamState === "reconnecting"
      ? "Reconnecting live updates..."
      : "Connecting live updates...";
}

export function runDetailStreamLabel(input: {
  revalidatorState: "idle" | "loading";
  streamState: "connecting" | "connected" | "reconnecting";
}) {
  if (input.revalidatorState === "loading") {
    return "Refreshing...";
  }

  return input.streamState === "connected"
    ? "Live updates connected"
    : input.streamState === "reconnecting"
      ? "Reconnecting live updates..."
      : "Connecting live updates...";
}

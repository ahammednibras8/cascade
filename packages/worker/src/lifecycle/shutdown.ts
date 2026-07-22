export type ShutdownSignal = {
  isShuttingDown: () => boolean;
};

export function createShutdownSignal(): ShutdownSignal {
  let isShuttingDown = false;

  const requestShutdown = () => {
    isShuttingDown = true;
  };

  process.on("SIGINT", requestShutdown);
  process.on("SIGTERM", requestShutdown);

  return {
    isShuttingDown() {
      return isShuttingDown;
    },
  };
}

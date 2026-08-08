export type ShutdownSignal = {
  isShuttingDown: () => boolean;
};

export function createShutdownSignal(onShutdown?: () => void): ShutdownSignal {
  let isShuttingDown = false;

  const requestShutdown = () => {
    isShuttingDown = true;
    onShutdown?.();
  };

  process.on("SIGINT", requestShutdown);
  process.on("SIGTERM", requestShutdown);

  return {
    isShuttingDown() {
      return isShuttingDown;
    },
  };
}

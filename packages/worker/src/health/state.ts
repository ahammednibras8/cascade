export type WorkerHealthState = {
  markReady: () => void;
  markShuttingDown: () => void;
  isReady: () => boolean;
  isShuttingDown: () => boolean;
};

export function createWorkerHealthState(): WorkerHealthState {
  let ready = false;
  let shuttingDown = false;

  return {
    markReady() {
      if (!shuttingDown) {
        ready = true;
      }
    },

    markShuttingDown() {
      shuttingDown = true;
      ready = false;
    },

    isReady() {
      return ready;
    },

    isShuttingDown() {
      return shuttingDown;
    },
  };
}

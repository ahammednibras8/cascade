export * from "./task.js";
export * from "./trace.js";
export * from "./execution-config.js";
export * from "./schedule.js";
export * from "./realtime.js";

export type PackageInfo = {
  name: string;
  version: string;
};

export const packageName = "@cascade/core";

export function createPackageInfo(version: string): PackageInfo {
  return {
    name: packageName,
    version,
  };
}

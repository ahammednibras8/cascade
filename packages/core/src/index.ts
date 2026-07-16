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

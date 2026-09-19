const DEFAULT_RETURN_TO = "/dashboard";
const MAX_RETURN_TO_LENGTH = 2048;
const RETURN_TO_BASE_URL = new URL("https://cascade.invalid");

export function getSafeDashboardReturnTo(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_RETURN_TO_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return DEFAULT_RETURN_TO;
  }

  let destination: URL;

  try {
    destination = new URL(value, RETURN_TO_BASE_URL);
  } catch {
    return DEFAULT_RETURN_TO;
  }

  if (destination.origin !== RETURN_TO_BASE_URL.origin) {
    return DEFAULT_RETURN_TO;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

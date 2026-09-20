import { createCascadeClient } from "@ahammednibras8/cascade";

export function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export const cascade = createCascadeClient({
  baseUrl: requireEnvironmentVariable("CASCADE_API_URL"),
  apiKey: requireEnvironmentVariable("CASCADE_API_KEY"),
});

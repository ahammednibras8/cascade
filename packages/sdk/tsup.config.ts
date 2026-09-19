import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: "dist/esm",
  external: ["@opentelemetry/api"],
  noExternal: ["@cascade/api-contracts", "@cascade/core"],
  esbuildOptions(options) {
    options.conditions = ["development"];
  },
  dts: {
    resolve: true,
  },
});

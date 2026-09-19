import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    tasks: "src/tasks.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  noExternal: [/.*/],
});

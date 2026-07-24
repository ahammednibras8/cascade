import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const source = join(packageRoot, "src", "redis", "lua");
const destination = join(packageRoot, "dist", "redis", "lua");

await mkdir(dirname(destination), { recursive: true });

await cp(source, destination, { recursive: true });

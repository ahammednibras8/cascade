import { cascade } from "./cascade.js";
import { hello } from "./tasks.js";

const run = await cascade.triggerTask(hello, {
  payload: {
    name: "Cascade",
  },
});

process.stdout.write(`Triggered run ${run.id} with status ${run.status}\n`);

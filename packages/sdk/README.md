# `@ahammednibras8/cascade`

TypeScript SDK for defining, deploying, and triggering durable Cascade tasks.

## Requirements

- Node.js 20 or newer
- A Cascade API URL
- A Cascade environment API key

## Install

```sh
pnpm add @ahammednibras8/cascade
```

## Define a task

```ts
import { defineTask } from "@ahammednibras8/cascade";

export const hello = defineTask<{ name: string }>({
  id: "hello",
  retry: {
    maxAttempts: 3,
    delayMs: 1_000,
    exponentialBackoff: true,
  },
  async run({ payload, logger, signal }) {
    signal.throwIfAborted();
    await logger.info("Creating greeting", { name: payload?.name ?? "world" });

    return {
      message: `Hello, ${payload?.name ?? "world"}!`,
    };
  },
});
```

## Trigger a task

```ts
import { createCascadeClient } from "@ahammednibras8/cascade";
import { hello } from "./tasks.js";

const cascade = createCascadeClient({
  baseUrl: process.env.CASCADE_API_URL!,
  apiKey: process.env.CASCADE_API_KEY!,
});

const run = await cascade.triggerTask(hello, {
  payload: { name: "Ahammed" },
  idempotencyKey: "greeting-001",
});

console.log(run.id, run.status);
```

## Register a deployment

```ts
await cascade.registerDeployment({
  version: process.env.CASCADE_DEPLOYMENT_VERSION!,
  image: process.env.CASCADE_DEPLOYMENT_IMAGE!,
  tasks: [
    {
      task: hello,
      name: "Hello",
      description: "Creates a durable greeting",
    },
  ],
});
```

The API key used to register deployments needs `DEPLOYMENTS_WRITE`. Triggering tasks needs
`TASKS_TRIGGER`.

## License

Apache-2.0

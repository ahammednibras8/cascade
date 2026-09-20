import { cascade, requireEnvironmentVariable } from "./cascade.js";
import { hello } from "./tasks.js";

const deployment = await cascade.registerDeployment({
  version: requireEnvironmentVariable("CASCADE_DEPLOYMENT_VERSION"),
  image: requireEnvironmentVariable("CASCADE_DEPLOYMENT_IMAGE"),
  tasks: [
    {
      task: hello,
      name: "Hello",
      description: "Creates a durable greeting from the TypeScript starter",
    },
  ],
});

process.stdout.write(`Registered deployment ${deployment.version} (${deployment.id})\n`);

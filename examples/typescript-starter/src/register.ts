import { createCascadeClient } from "@ahammednibras8/cascade";
import { hello } from "./tasks.js";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const cascade = createCascadeClient({
  baseUrl: requireEnvironmentVariable("CASCADE_API_URL"),
  apiKey: requireEnvironmentVariable("CASCADE_API_KEY"),
});

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

console.log(`Registered deployment ${deployment.version} (${deployment.id})`);

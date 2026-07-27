import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AwsCommand = {
  input: unknown;
};

const aws = vi.hoisted(() => {
  const send = vi.fn<(command: AwsCommand) => Promise<unknown>>();
  const configs: unknown[] = [];

  class S3Client {
    constructor(config: unknown) {
      configs.push(config);
    }

    send(command: AwsCommand) {
      return send(command);
    }
  }

  class HeadBucketCommand {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class CreateBucketCommand {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class PutObjectCommand {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return {
    configs,
    send,
    S3Client,
    HeadBucketCommand,
    CreateBucketCommand,
    PutObjectCommand,
    GetObjectCommand,
  };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: aws.S3Client,
  HeadBucketCommand: aws.HeadBucketCommand,
  CreateBucketCommand: aws.CreateBucketCommand,
  PutObjectCommand: aws.PutObjectCommand,
  GetObjectCommand: aws.GetObjectCommand,
}));

const ENV_KEYS = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_FORCE_PATH_STYLE",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "LARGE_PAYLOAD_THRESHOLD_BYTES",
];

function resetStorageEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  process.env.S3_ENDPOINT = "http://localhost:19090";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_FORCE_PATH_STYLE = "true";
  process.env.S3_ACCESS_KEY_ID = "cascade";
  process.env.S3_SECRET_ACCESS_KEY = "cascade-password";
  process.env.S3_BUCKET = "cascade-task-payloads";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadStorage() {
  vi.resetModules();
  return import("./index.js");
}

describe("@cascade/storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aws.configs.length = 0;
    resetStorageEnv();
  });

  it("keeps small JSON inline", async () => {
    process.env.LARGE_PAYLOAD_THRESHOLD_BYTES = "1000000";

    const { maybeStoreJsonValue } = await loadStorage();

    const value = {
      message: "small",
    };

    await expect(
      maybeStoreJsonValue({
        kind: "PAYLOAD",
        environmentId: "environment-1",
        taskId: "task-1",
        runId: "run-1",
        value,
      }),
    ).resolves.toEqual(value);

    expect(aws.configs).toEqual([]);
    expect(aws.send).not.toHaveBeenCalled();
  });

  it("stores large JSON and returns an object ref", async () => {
    process.env.LARGE_PAYLOAD_THRESHOLD_BYTES = "10";

    aws.send
      .mockRejectedValueOnce(new Error("bucket missing"))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { maybeStoreJsonValue } = await loadStorage();

    const value = {
      message: "x".repeat(100),
    };

    const serialized = JSON.stringify(value);
    const digest = sha256(serialized);

    const result = await maybeStoreJsonValue({
      kind: "PAYLOAD",
      environmentId: "environment-1",
      taskId: "task-1",
      runId: "run-1",
      value,
    });

    expect(result).toEqual({
      cascadeObjectRef: true,
      kind: "PAYLOAD",
      bucket: "cascade-task-payloads",
      key: "environments/environment-1/tasks/task-1/runs/run-1/payload.json",
      contentType: "application/json",
      byteSize: Buffer.byteLength(serialized, "utf-8"),
      sha256: digest,
    });

    expect(aws.send.mock.calls[0]?.[0]).toBeInstanceOf(aws.HeadBucketCommand);
    expect(aws.send.mock.calls[1]?.[0]).toBeInstanceOf(aws.CreateBucketCommand);
    expect(aws.send.mock.calls[2]?.[0]).toBeInstanceOf(aws.PutObjectCommand);

    expect(aws.send.mock.calls[2]?.[0].input).toEqual({
      Bucket: "cascade-task-payloads",
      Key: "environments/environment-1/tasks/task-1/runs/run-1/payload.json",
      Body: serialized,
      ContentType: "application/json",
      Metadata: {
        kind: "PAYLOAD",
        environmentId: "environment-1",
        taskId: "task-1",
        runId: "run-1",
        sha256: digest,
      },
    });
  });

  it("resolves object refs back to JSON", async () => {
    const value = {
      ok: true,
    };

    const serialized = JSON.stringify(value);

    aws.send.mockResolvedValueOnce({
      Body: {
        transformToString: () => Promise.resolve(serialized),
      },
    });

    const { resolveJsonValue } = await loadStorage();

    await expect(
      resolveJsonValue({
        cascadeObjectRef: true,
        kind: "OUTPUT",
        bucket: "cascade-task-payloads",
        key: "environments/environment-1/tasks/task-1/runs/run-1/output.json",
        contentType: "application/json",
        byteSize: Buffer.byteLength(serialized, "utf-8"),
        sha256: sha256(serialized),
      }),
    ).resolves.toEqual(value);

    expect(aws.send.mock.calls[0]?.[0]).toBeInstanceOf(aws.GetObjectCommand);
    expect(aws.send.mock.calls[0]?.[0].input).toEqual({
      Bucket: "cascade-task-payloads",
      Key: "environments/environment-1/tasks/task-1/runs/run-1/output.json",
    });
  });

  it("rejects object refs when sha256 does not match", async () => {
    aws.send.mockResolvedValueOnce({
      Body: {
        transformToString: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
            }),
          ),
      },
    });

    const { resolveJsonValue } = await loadStorage();

    await expect(
      resolveJsonValue({
        cascadeObjectRef: true,
        kind: "OUTPUT",
        bucket: "cascade-task-payloads",
        key: "environments/environment-1/tasks/task-1/runs/run-1/output.json",
        contentType: "application/json",
        byteSize: 11,
        sha256: "wrong-sha",
      }),
    ).rejects.toThrow(
      "Object sha256 mismatch: cascade-task-payloads/environments/environment-1/tasks/task-1/runs/run-1/output.json",
    );
  });
});

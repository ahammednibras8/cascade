import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonStorageRef = {
  [key: string]: JsonValue;
  cascadeObjectRef: true;
  kind: "PAYLOAD" | "OUTPUT";
  bucket: string;
  key: string;
  contentType: "application/json";
  byteSize: number;
  sha256: string;
};

type MaybeStoreJsonValueInput = {
  kind: "PAYLOAD" | "OUTPUT";
  environmentId: string;
  taskId: string;
  runId: string;
  value: unknown;
};

const DEFAULT_LARGE_PAYLOAD_THRESHOLD_BYTES = 256 * 1024;

let s3Client: S3Client | undefined;
let bucketReady = false;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getOptionalEnv(name: string) {
  return process.env[name];
}

function getBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  return value === "true";
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer greater than or equal to 1`);
  }

  return value;
}

function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  const endpoint = getOptionalEnv("S3_ENDPOINT");

  const config: S3ClientConfig = {
    region: getOptionalEnv("S3_REGION") ?? "us-east-1",
    forcePathStyle: getBooleanEnv("S3_FORCE_PATH_STYLE", true),
    credentials: {
      accessKeyId: getRequiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("S3_SECRET_ACCESS_KEY"),
    },
  };

  if (endpoint) {
    config.endpoint = endpoint;
  }

  s3Client = new S3Client(config);

  return s3Client;
}

function getBucket() {
  return getRequiredEnv("S3_BUCKET");
}

export function getLargePayloadThresholdBytes() {
  return getPositiveIntegerEnv(
    "LARGE_PAYLOAD_THRESHOLD_BYTES",
    DEFAULT_LARGE_PAYLOAD_THRESHOLD_BYTES,
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getObjectKey(input: MaybeStoreJsonValueInput) {
  const fileName = input.kind === "PAYLOAD" ? "payload.json" : "output.json";

  return [
    "environments",
    input.environmentId,
    "tasks",
    input.taskId,
    "runs",
    input.runId,
    fileName,
  ].join("/");
}

async function ensureBucketReady() {
  if (bucketReady) {
    return;
  }

  const client = getS3Client();
  const bucket = getBucket();

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      }),
    );

    bucketReady = true;
    return;
  } catch {
    await client.send(
      new CreateBucketCommand({
        Bucket: bucket,
      }),
    );

    bucketReady = true;
  }
}

export function isJsonStorageRef(value: unknown): value is JsonStorageRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<JsonStorageRef>;

  return (
    candidate.cascadeObjectRef === true &&
    (candidate.kind === "PAYLOAD" || candidate.kind === "OUTPUT") &&
    typeof candidate.bucket === "string" &&
    typeof candidate.key === "string" &&
    candidate.contentType === "application/json" &&
    typeof candidate.byteSize === "number" &&
    typeof candidate.sha256 === "string"
  );
}

export async function maybeStoreJsonValue(input: MaybeStoreJsonValueInput) {
  const serialized = JSON.stringify(input.value);
  const byteSize = Buffer.byteLength(serialized, "utf-8");
  const thresholdBytes = getLargePayloadThresholdBytes();

  if (byteSize <= thresholdBytes) {
    return input.value;
  }

  await ensureBucketReady();

  const bucket = getBucket();
  const key = getObjectKey(input);
  const digest = sha256(serialized);

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: serialized,
      ContentType: "application/json",
      Metadata: {
        kind: input.kind,
        environmentId: input.environmentId,
        taskId: input.taskId,
        runId: input.runId,
        sha256: digest,
      },
    }),
  );

  return {
    cascadeObjectRef: true,
    kind: input.kind,
    bucket,
    key,
    contentType: "application/json",
    byteSize,
    sha256: digest,
  } satisfies JsonStorageRef;
}

export async function loadJsonValue(ref: JsonStorageRef): Promise<JsonValue> {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: ref.bucket,
      Key: ref.key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Object body was empty: ${ref.bucket}/${ref.key}`);
  }

  const serialized = await response.Body.transformToString();
  const actualSha256 = sha256(serialized);

  if (actualSha256 !== ref.sha256) {
    throw new Error(`Object sha256 mismatch: ${ref.bucket}/${ref.key}`);
  }

  return JSON.parse(serialized) as JsonValue;
}

export async function resolveJsonValue(value: unknown): Promise<JsonValue | null> {
  if (value === undefined || value === null) {
    return null;
  }

  if (isJsonStorageRef(value)) {
    return loadJsonValue(value);
  }

  return value as JsonValue;
}

type ObjectStorageRef = {
  kind: string;
  bucket: string;
  key: string;
  byteSize: number;
  sha256: string;
};

function isObjectStorageRef(value: unknown): value is ObjectStorageRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as {
    cascadeObjectRef?: unknown;
    kind?: unknown;
    bucket?: unknown;
    key?: unknown;
    byteSize?: unknown;
    sha256?: unknown;
  };

  return (
    candidate.cascadeObjectRef === true &&
    typeof candidate.kind === "string" &&
    typeof candidate.bucket === "string" &&
    typeof candidate.key === "string" &&
    typeof candidate.byteSize === "number" &&
    typeof candidate.sha256 === "string"
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  if (isObjectStorageRef(value)) {
    return (
      <div className="rounded-md bg-gray-950 p-4 text-xs text-gray-100">
        <p className="font-semibold">Large {value.kind.toLowerCase()} stored in RustFS</p>
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-gray-400">Bucket</dt>
            <dd className="font-mono">{value.bucket}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Key</dt>
            <dd className="break-all font-mono">{value.key}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Size</dt>
            <dd>{value.byteSize.toLocaleString()} bytes</dd>
          </div>
          <div>
            <dt className="text-gray-400">SHA256</dt>
            <dd className="break-all font-mono">{value.sha256}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded-md bg-gray-950 p-4 text-xs text-gray-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

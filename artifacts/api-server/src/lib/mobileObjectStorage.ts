import { randomUUID } from "node:crypto";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function parseObjectPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path.");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectUrl(
  bucketName: string,
  objectName: string,
  method: "GET" | "PUT",
) {
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Object storage signing failed (${response.status}).`);
  const payload = await response.json() as { signed_url?: string };
  if (!payload.signed_url) throw new Error("Object storage did not return a signed URL.");
  return payload.signed_url;
}

export async function createMobileUploadUrl(userId: string) {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
  const fullPath = `${privateDir}/expert-reviews/${userId}/${randomUUID()}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return {
    uploadURL: await signObjectUrl(bucketName, objectName, "PUT"),
    objectPath: `/objects/${objectName}`,
  };
}

export async function createMobileDownloadUrl(objectPath: string) {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
  const { bucketName, objectName } = parseObjectPath(`${privateDir}/${objectPath.replace(/^\/objects\//, "")}`);
  return signObjectUrl(bucketName, objectName, "GET");
}
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function endpointHost(): string {
  return requireEnv("B2_ENDPOINT").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function getS3(): S3Client {
  const endpoint = endpointHost();
  return new S3Client({
    endpoint: `https://${endpoint}`,
    region: "us-east-1",
    credentials: {
      accessKeyId: requireEnv("B2_KEY_ID"),
      secretAccessKey: requireEnv("B2_APP_KEY"),
    },
    forcePathStyle: true,
  });
}

/**
 * Public URL for an object key. Set B2_PUBLIC_URL_BASE to the bucket root
 * (e.g. https://s3.us-west-004.backblazeb2.com/your-bucket-name).
 */
export function publicUrlForB2Key(key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  const explicitBase = process.env.B2_PUBLIC_URL_BASE?.trim();
  if (explicitBase) {
    return `${explicitBase.replace(/\/$/, "")}/${path}`;
  }
  const bucket = requireEnv("B2_BUCKET_NAME");
  const endpoint = endpointHost();
  return `https://${endpoint}/${encodeURIComponent(bucket)}/${path}`;
}

/**
 * Reverse of {@link publicUrlForB2Key} for the same env configuration.
 * Returns null if the URL does not match the configured bucket/base.
 */
export function b2KeyFromPublicUrl(publicUrl: string): string | null {
  const explicitBase = process.env.B2_PUBLIC_URL_BASE?.trim();
  if (explicitBase) {
    const base = explicitBase.replace(/\/$/, "");
    if (publicUrl.startsWith(`${base}/`)) {
      const remainder = publicUrl.slice(base.length + 1);
      return remainder.split("/").map((s) => decodeURIComponent(s)).join("/");
    }
  }
  const bucket = process.env.B2_BUCKET_NAME;
  const endpointRaw = process.env.B2_ENDPOINT;
  if (!bucket || !endpointRaw) return null;
  try {
    const endpoint = endpointRaw.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const u = new URL(publicUrl);
    if (u.hostname !== endpoint) return null;
    const parts = u.pathname.replace(/^\//, "").split("/");
    if (parts.length < 2) return null;
    const encodedBucket = encodeURIComponent(bucket);
    const head = parts[0];
    if (head !== encodedBucket && head !== bucket) return null;
    return parts
      .slice(1)
      .map((s) => decodeURIComponent(s))
      .join("/");
  } catch {
    return null;
  }
}

/**
 * Derives the B2 object key for a receipt file from a stored public URL when
 * {@link b2KeyFromPublicUrl} fails (e.g. friendly `fxxx.backblazeb2.com/file/...` URLs,
 * CDN hostnames, or base URL drift vs upload time).
 *
 * Upload keys are always `tradestack/{tenantUuid}/receipts/{sha}_receipt.{ext}`.
 */
export function receiptB2KeyFromPublicUrl(publicUrl: string): string | null {
  const fromEnv = b2KeyFromPublicUrl(publicUrl);
  if (fromEnv) return fromEnv;

  try {
    const u = new URL(publicUrl);
    let path = u.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      /* keep path */
    }
    const m = path.match(
      /(tradestack\/[0-9a-f-]{36}\/receipts\/[^/?#]+)/i,
    );
    if (m) return m[1];
  } catch {
    /* ignore */
  }

  try {
    const decoded = decodeURIComponent(publicUrl);
    const m = decoded.match(
      /(tradestack\/[0-9a-f-]{36}\/receipts\/[^/?&#\s]+)/i,
    );
    if (m) return m[1];
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Upload a buffer to Backblaze B2 via the S3-compatible API.
 * Key shape: tradestack/{tenant_id}/{folder}/{filename}
 */
export async function uploadToB2(
  file: Buffer,
  key: string,
  mimeType: string,
): Promise<string> {
  const client = getS3();
  const bucket = requireEnv("B2_BUCKET_NAME");
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: mimeType,
    }),
  );
  return publicUrlForB2Key(key);
}

export async function deleteFromB2ByKey(key: string): Promise<void> {
  const client = getS3();
  const bucket = requireEnv("B2_BUCKET_NAME");
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function presignB2PutObject(args: {
  key: string;
  mimeType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = getS3();
  const bucket = requireEnv("B2_BUCKET_NAME");
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      ContentType: args.mimeType,
    }),
    { expiresIn: args.expiresInSeconds ?? 900 },
  );
}

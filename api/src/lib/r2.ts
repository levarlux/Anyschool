// R2 object storage helper — correct AWS SigV4 signing for Cloudflare R2 (S3-compatible).
//
// The previous inline signing in file-upload.ts omitted the mandatory x-amz-content-sha256
// header, so every R2 PUT failed with a 403 signature error and silently fell back to
// base64 — which is how 4MB data URLs ended up inside field_values and made the learners
// list endpoint take 25s. This module fixes the signature and centralizes upload logic.
//
// Env vars (already present in api/.env):
//   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_BUCKET_NAME, R2_ENDPOINT (optional — derived from account id), CLOUDFLARE_PUBLIC_DOMAIN

import { createHash, createHmac } from 'crypto';

// Read env lazily (function-level) — module-level constants would capture empty strings
// whenever this module is imported before dotenv.config() runs (import order varies).
function env(key: string): string {
  return (process.env[key] || '').trim();
}

function conf() {
  const ACCOUNT_ID = env('CLOUDFLARE_ACCOUNT_ID');
  const ACCESS_KEY_ID = env('R2_ACCESS_KEY_ID');
  const SECRET_ACCESS_KEY = env('R2_SECRET_ACCESS_KEY');
  const BUCKET = env('R2_BUCKET_NAME');
  const PUBLIC_DOMAIN = env('CLOUDFLARE_PUBLIC_DOMAIN').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const ENDPOINT = (env('R2_ENDPOINT') || (ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : '')).replace(/\/$/, '');
  return { ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET, PUBLIC_DOMAIN, ENDPOINT };
}

export function r2Configured(): boolean {
  const c = conf();
  return !!(c.ACCOUNT_ID && c.ACCESS_KEY_ID && c.SECRET_ACCESS_KEY && c.BUCKET && c.ENDPOINT);
}

const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

/** Public URL where an object is readable (bucket has the r2.dev managed domain enabled). */
export function r2PublicUrl(key: string): string {
  const { PUBLIC_DOMAIN, BUCKET, ACCOUNT_ID } = conf();
  return PUBLIC_DOMAIN
    ? `https://${PUBLIC_DOMAIN}/${key}`
    : `https://${BUCKET}.${ACCOUNT_ID}.r2.dev/${key}`;
}

interface PutOptions {
  contentType: string;
}

/** PUT an object to R2 with a valid SigV4 signature. Throws on non-2xx. */
export async function r2Put(key: string, body: Buffer, opts: PutOptions): Promise<string> {
  if (!r2Configured()) throw new Error('R2 not configured');
  const { ENDPOINT, BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY } = conf();

  const url = new URL(`${ENDPOINT}/${BUCKET}/${key}`);
  const host = url.host;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateShort = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  // Canonical headers must be lowercase, sorted, and ALL included in SignedHeaders
  const canonicalHeaders =
    `content-type:${opts.contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    url.pathname,
    '', // canonical query string — empty
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateShort}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateShort);
  const kRegion = hmac(kDate, 'auto'); // R2 uses region "auto"
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const res = await fetch(url.href, {
    method: 'PUT',
    headers: {
      'Content-Type': opts.contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`R2 PUT failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  return r2PublicUrl(key);
}

/** DELETE an object from R2 (best-effort — 404 is treated as success). */
export async function r2Delete(key: string): Promise<void> {
  if (!r2Configured()) throw new Error('R2 not configured');
  const { ENDPOINT, BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY } = conf();
  const url = new URL(`${ENDPOINT}/${BUCKET}/${key}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateShort = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');

  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['DELETE', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateShort}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateShort);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const res = await fetch(url.href, {
    method: 'DELETE',
    headers: {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE failed (${res.status})`);
  }
}

/** Generate a storage key for a school-scoped upload. */
export function r2Key(schoolId: string, kind: string, fileName: string): string {
  const ext = (fileName.includes('.') ? fileName.split('.').pop() : '') || 'bin';
  const safeExt = /^[a-z0-9]{1,8}$/i.test(ext) ? ext.toLowerCase() : 'bin';
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `schools/${schoolId}/${kind}/${timestamp}_${random}.${safeExt}`;
}

/**
 * Convert a data URL (base64) into an R2 object. Returns the fileValue JSON to store.
 * Throws on failure — callers decide whether to fall back to storing base64 as-is.
 */
export async function dataUrlToR2(dataUrl: string, schoolId: string, kind: string, fileName?: string): Promise<{ url: string; name: string | null; type: string; size: number }> {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Not a valid data URL');
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const raw = match[3];
  const body = isBase64 ? Buffer.from(raw, 'base64') : Buffer.from(decodeURIComponent(raw), 'utf-8');

  const extFromMime: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf',
  };
  const inferredName = fileName || `upload.${extFromMime[mime] || 'bin'}`;
  const key = r2Key(schoolId, kind, inferredName);
  const url = await r2Put(key, body, { contentType: mime });
  return { url, name: inferredName, type: mime, size: body.length };
}

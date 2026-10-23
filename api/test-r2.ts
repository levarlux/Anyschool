// Verifies R2 access: LIST probe first (diagnoses permission scope), then PUT + public GET.
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHmac, createHash } from 'crypto';
import { r2Configured, r2Put, r2Delete, r2Key } from './src/lib/r2';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });

async function main() {
  console.log('R2 configured:', r2Configured());
  if (!r2Configured()) process.exit(1);

  // ─── Probe 1: LIST bucket (reads) ─────────────────────────
  const envGet = (k: string) => (process.env[k] || '').trim();
  const acct = envGet('CLOUDFLARE_ACCOUNT_ID'), ak = envGet('R2_ACCESS_KEY_ID'), sk = envGet('R2_SECRET_ACCESS_KEY'), bk = envGet('R2_BUCKET_NAME');
  const ep = envGet('R2_ENDPOINT') || `https://${acct}.r2.cloudflarestorage.com`;
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const ds = amz.slice(0, 8);
  const ph = createHash('sha256').update('').digest('hex');
  const ch = `host:${new URL(ep).host}\nx-amz-content-sha256:${ph}\nx-amz-date:${amz}\n`;
  const cr = ['GET', `/${bk}/`, '', ch, 'host;x-amz-content-sha256;x-amz-date', ph].join('\n');
  const scope = `${ds}/auto/s3/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amz, scope, createHash('sha256').update(cr).digest('hex')].join('\n');
  const km = (k: any, d: string) => createHmac('sha256', k).update(d).digest();
  const ks = createHmac('sha256', createHmac('sha256', createHmac('sha256', createHmac('sha256', `AWS4${sk}`, ds).digest(), 'auto').digest(), 's3').digest(), 'aws4_request').digest();
  const sig = createHmac('sha256', ks).update(sts).digest('hex');
  const listRes = await fetch(`${ep}/${bk}/`, { headers: {
    'x-amz-date': amz, 'x-amz-content-sha256': ph,
    Authorization: `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
  } });
  const listText = await listRes.text();
  console.log(`LIST probe: ${listRes.status} ${listText.slice(0, 250)}`);
  if (listRes.ok) console.log('=> token CAN read; a write 403 means token is read-only or write-restricted\n');
  else if (listRes.status === 403) console.log('=> token CANNOT access this bucket — check token bucket scope in Cloudflare dashboard\n');
  else console.log('');

  // ─── Probe 2: PUT (write) ─────────────────────────────────
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const key = r2Key('test-school', 'migration-test', 'test.png');
  console.log('PUT key:', key);
  try {
    const t0 = Date.now();
    const url = await r2Put(key, png, { contentType: 'image/png' });
    console.log(`PUT ok in ${Date.now() - t0}ms -> ${url}`);
    const res = await fetch(url);
    const body = await res.arrayBuffer();
    console.log(`GET public URL: ${res.status} ${res.headers.get('content-type')} ${body.byteLength}B`);
    console.log(res.status === 200 && body.byteLength === png.length ? 'PASS: write + public serving work' : 'CHECK: public access may be off for this bucket');
    await r2Delete(key);
    console.log('Test object cleaned up.');
  } catch (e: any) {
    console.log('PUT failed:', e.message.slice(0, 200));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('FAIL:', e.message); process.exit(1); });

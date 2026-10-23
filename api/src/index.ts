import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { config } from 'dotenv';
import { resolve } from 'path';
import schemaBuilder from './routes/schema-builder';
import uploadImport from './routes/upload-import';
import bulkOperations from './routes/bulk-operations';
import permissions from './routes/permissions';
import analytics from './routes/analytics';
import automation from './routes/automation';
import modules from './routes/modules';
import aiAgent from './routes/ai-agent';
import onboarding from './routes/onboarding';
import billing from './routes/billing';
import payments from './routes/payments';
import documents from './routes/documents';
import fileProcessing from './routes/file-processing';
import fileUpload from './routes/file-upload';
import seed from './routes/seed';
import learners from './routes/learners';
import classes from './routes/classes';
import teachers from './routes/teachers';
import subjects from './routes/subjects';
import terms from './routes/terms';
import assessments from './routes/assessments';
import auth from './routes/auth';
import { runMigrations } from './migrate';
import { clerkAuth } from './auth';
import { closeDb } from './db';
import { paystackMode } from './lib/paystack';

config({ path: resolve(import.meta.dirname, '..', '.env') });

// Loudly state which Paystack wallet is armed (test vs live) at boot
console.log(`[payments] Paystack mode: ${paystackMode().toUpperCase()} (key: ${paystackMode() === 'live' ? 'sk_live_…' : 'sk_test_…'})`);

const app = new Hono();

// ---- CORS ------------------------------------------------------------------
// The desktop client is a Tauri WebView: its Origin is tauri://localhost
// (WebKit/macOS/Linux) or https://tauri.localhost (WebView2/Windows). Local
// dev adds http://localhost:<port>. Everything else must be opted in via
// WEB_ORIGIN / CORS_ORIGINS. Note: CORS is a browser policy, not access
// control — Clerk auth and the Paystack signature are the real guards.
const TAURI_ORIGINS = new Set(['tauri://localhost', 'https://tauri.localhost']);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function configuredOrigins(): string[] {
  return [process.env.WEB_ORIGIN, ...(process.env.CORS_ORIGINS?.split(',') ?? [])]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));
}

function allowOrigin(origin: string): string | null {
  if (!origin) return null; // server-to-server calls (Paystack webhooks) send no Origin
  if (TAURI_ORIGINS.has(origin)) return origin;
  if (LOCAL_ORIGIN.test(origin)) return origin;
  return configuredOrigins().includes(origin) ? origin : null;
}

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: allowOrigin,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

// Health check — public, no auth (Coolify container healthcheck, uptime
// monitors and the OCI keep-alive ping all hit this every few seconds).
app.get('/health', (c) => {
  return c.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
});

app.get('/', (c) => {
  return c.json({ message: 'AnySchool API is running' });
});

// API routes
app.use('/api/*', clerkAuth);
app.route('/api/auth', auth);
app.route('/api/schema', schemaBuilder);
app.route('/api/upload', uploadImport);
app.route('/api/bulk', bulkOperations);
app.route('/api/permissions', permissions);
app.route('/api/analytics', analytics);
app.route('/api/automation', automation);
app.route('/api/modules', modules);
app.route('/api/agent', aiAgent);
app.route('/api/onboarding', onboarding);
app.route('/api/billing', billing);
app.route('/api/payments', payments);
app.route('/api/documents', documents);
app.route('/api/files', fileProcessing);
app.route('/api/file-upload', fileUpload);
app.route('/api/seed', seed);
app.route('/api/learners', learners);
app.route('/api/classes', classes);
app.route('/api/teachers', teachers);
app.route('/api/subjects', subjects);
app.route('/api/terms', terms);
app.route('/api/assessments', assessments);

const port = Number(process.env.PORT) || 3000;

// Neon can be slow to answer right after an idle scale-down — retry the boot
// migrations with backoff instead of crashing (Coolify would restart-loop).
async function migrateWithRetry(databaseUrl: string | undefined, attempts = 5): Promise<void> {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runMigrations(databaseUrl);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10_000);
      console.warn(`[boot] migration attempt ${attempt}/${attempts} failed — retrying in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

async function start(): Promise<void> {
  try {
    await migrateWithRetry(process.env.DATABASE_URL);
  } catch (error) {
    console.error('[boot] migrations failed:', error);
    process.exit(1);
  }

  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname: '0.0.0.0', // reachable inside the container / OCI network
    },
    (info) => {
      console.log(`Server running on port ${info.port}`);
    }
  );

  // Graceful shutdown: Coolify sends SIGTERM on redeploy/restart. Stop
  // accepting connections, let in-flight requests finish, close the Neon
  // pool, then exit — all inside Coolify's 10s grace period.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing server and DB pool`);

    const forceExit = setTimeout(() => {
      console.error('[shutdown] timed out after 10s — forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    // Node http.Server API not present on hono's ServerType — available since Node 18.2.
    (server as unknown as { closeIdleConnections?: () => void }).closeIdleConnections?.();
    server.close(async (closeError) => {
      try {
        await closeDb();
      } catch (dbError) {
        console.error('[shutdown] error closing DB pool:', dbError);
      }
      console.log('[shutdown] clean exit');
      process.exit(closeError ? 1 : 0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[uncaughtException]', error);
    shutdown('uncaughtException');
  });
}

start();

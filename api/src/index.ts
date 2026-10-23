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
import { paystackMode } from './lib/paystack';

config({ path: resolve(import.meta.dirname, '..', '.env') });

// Loudly state which Paystack wallet is armed (test vs live) at boot
console.log(`[payments] Paystack mode: ${paystackMode().toUpperCase()} (key: ${paystackMode() === 'live' ? 'sk_live_…' : 'sk_test_…'})`);

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
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

const port = 3000;

// Run migrations before starting server
runMigrations(process.env.DATABASE_URL!).then(() => {
  console.log(`Server running on port ${port}`);
  serve({
    fetch: app.fetch,
    port,
  });
});

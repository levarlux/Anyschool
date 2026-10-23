// File Upload API — Cloudflare R2 with correct SigV4 signing (see src/lib/r2.ts)
// Handles image/document uploads for file-type fields.
// Architecture doc 01 §5: file values hold a reference to object storage (R2), not inline base64.

import { Hono } from 'hono';
import { db } from '../db';
import { fieldValues, fieldDefinitions } from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { r2Configured, r2Put, r2Key } from '../lib/r2';

const fileUpload = new Hono();

// Allowed file types
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── Upload endpoint ───────────────────────────────────────
// Accepts multipart form data with a "file" field.
// Returns { url, key, name, type, size }. url is an R2 public URL when R2 is
// configured and writable; otherwise a base64 data URL (legacy fallback).

fileUpload.post('/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');

  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type
    if (!ALLOWED_TYPES.has(file.type)) {
      return c.json({ error: `File type "${file.type}" is not allowed. Supported: images, PDF, Word, Excel, text.` }, 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum: 10MB.` }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (r2Configured()) {
      const key = r2Key(schoolId, 'uploads', file.name);
      try {
        const url = await r2Put(key, buffer, { contentType: file.type });
        return c.json({ url, key, name: file.name, type: file.type, size: file.size });
      } catch (err: any) {
        // Storage failure must be LOUD in the server log — silent base64 fallback is how
        // 4MB data URLs accumulated in field_values and slowed the learners list to 25s.
        console.error('[file-upload] R2 upload failed, falling back to base64:', err.message);
      }
    } else {
      console.warn('[file-upload] R2 not configured — storing base64 fallback (set R2_* env vars)');
    }

    // Fallback: base64 data URL
    const base64 = buffer.toString('base64');
    return c.json({
      url: `data:${file.type};base64,${base64}`,
      key: null,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch (err: any) {
    console.error('File upload error:', err);
    return c.json({ error: 'Upload failed: ' + (err.message || 'Unknown error') }, 500);
  }
});

// ─── Save file reference to field_values ──────────────────
// Called after upload to persist the file URL in the field value

fileUpload.post('/save/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();

  const { entityRecordId, fieldDefinitionId, fileData } = body;
  // fileData = { url, key, name, type, size }

  if (!entityRecordId || !fieldDefinitionId || !fileData?.url) {
    return c.json({ error: 'entityRecordId, fieldDefinitionId, and fileData.url are required' }, 400);
  }

  // Verify the field definition exists and is a file type
  const fieldDef = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.id, fieldDefinitionId),
      eq(fieldDefinitions.schoolId, schoolId),
    ),
  });

  if (!fieldDef) {
    return c.json({ error: 'Field definition not found' }, 404);
  }

  if (fieldDef.dataType !== 'file') {
    return c.json({ error: 'Field is not a file type' }, 400);
  }

  // Upsert the field value
  await db.insert(fieldValues).values({
    schoolId,
    entityRecordId,
    fieldDefinitionId,
    fileValue: fileData,
  }).onConflictDoUpdate({
    target: [fieldValues.entityRecordId, fieldValues.fieldDefinitionId],
    set: { fileValue: fileData },
  });

  return c.json({ success: true, url: fileData.url });
});

// ─── Delete file from field_values ────────────────────────

fileUpload.delete('/remove/:schoolId/:entityRecordId/:fieldDefinitionId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityRecordId = c.req.param('entityRecordId');
  const fieldDefinitionId = c.req.param('fieldDefinitionId');

  await db.delete(fieldValues).where(
    and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.entityRecordId, entityRecordId),
      eq(fieldValues.fieldDefinitionId, fieldDefinitionId),
    )
  );

  // Note: the R2 object itself is intentionally left in place (other records may
  // reference it); storage cleanup can be a periodic job if needed.

  return c.json({ success: true });
});

export default fileUpload;

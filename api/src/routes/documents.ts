import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { documentTemplates, documentJobs, entityRecords, entityTypes, fieldDefinitions, fieldValues, schools } from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

const documents = new Hono();

// ===== Document Templates =====

// List templates for a school
documents.get('/templates/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const templates = await db.query.documentTemplates.findMany({
    where: eq(documentTemplates.schoolId, schoolId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return c.json(templates);
});

// Get single template
documents.get('/templates/:schoolId/:id', async (c) => {
  const { schoolId, id } = c.req.param();
  const template = await db.query.documentTemplates.findFirst({
    where: and(
      eq(documentTemplates.schoolId, schoolId),
      eq(documentTemplates.id, id)
    ),
  });
  if (!template) return c.json({ error: 'Template not found' }, 404);
  return c.json(template);
});

// Create template
documents.post('/templates/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const body = await c.req.json();

  const [template] = await db.insert(documentTemplates).values({
    schoolId,
    name: body.name,
    description: body.description,
    entityTypeId: body.entityTypeId,
    layout: body.layout || {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      header: null,
      footer: null,
      blocks: [],
    },
    theme: body.theme,
    mergeFields: body.mergeFields || [],
    currency: body.currency,
  }).returning();

  return c.json(template, 201);
});

// Update template
documents.put('/templates/:schoolId/:id', async (c) => {
  const { schoolId, id } = c.req.param();
  const body = await c.req.json();

  const [updated] = await db.update(documentTemplates)
    .set({
      name: body.name,
      description: body.description,
      layout: body.layout,
      theme: body.theme,
      mergeFields: body.mergeFields,
      currency: body.currency,
      isActive: body.isActive,
      updatedAt: new Date(),
    })
    .where(and(
      eq(documentTemplates.schoolId, schoolId),
      eq(documentTemplates.id, id)
    ))
    .returning();

  if (!updated) return c.json({ error: 'Template not found' }, 404);
  return c.json(updated);
});

// Delete template
documents.delete('/templates/:schoolId/:id', async (c) => {
  const { schoolId, id } = c.req.param();
  await db.delete(documentTemplates).where(and(
    eq(documentTemplates.schoolId, schoolId),
    eq(documentTemplates.id, id)
  ));
  return c.json({ success: true });
});

// ===== Document Generation =====

// Get merge field values for a record (resolves field IDs to live values)
async function resolveMergeFields(schoolId: string, entityTypeId: string, recordId: string) {
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
  });

  const values = await db.query.fieldValues.findMany({
    where: eq(fieldValues.entityRecordId, recordId),
  });

  const valueMap = new Map(values.map(v => [v.fieldDefinitionId, v]));
  const resolved: Record<string, any> = {};

  for (const field of fields) {
    const val = valueMap.get(field.id);
    if (val) {
      resolved[field.internalName] = val.textValue ?? val.numericValue ?? val.dateValue ?? val.booleanValue;
      resolved[`${field.internalName}_label`] = field.name;
    }
  }

  // Add record metadata
  resolved._recordId = recordId;
  resolved._schoolId = schoolId;

  return resolved;
}

// Generate a single document (returns job status, PDF rendered async)
documents.post('/generate/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const body = await c.req.json();
  const { templateId, recordId } = body;

  if (!templateId || !recordId) {
    return c.json({ error: 'templateId and recordId required' }, 400);
  }

  // Validate template exists
  const template = await db.query.documentTemplates.findFirst({
    where: and(
      eq(documentTemplates.schoolId, schoolId),
      eq(documentTemplates.id, templateId)
    ),
  });
  if (!template) return c.json({ error: 'Template not found' }, 404);

  // Resolve merge fields
  const mergeData = await resolveMergeFields(schoolId, template.entityTypeId, recordId);

  // Create job
  const [job] = await db.insert(documentJobs).values({
    schoolId,
    templateId,
    targetRecordId: recordId,
    status: 'pending',
    totalRecords: 1,
    requestedBy: body.userId || 'system',
  }).returning();

  // In production, this would queue a background job.
  // For now, return the job with resolved merge data for the frontend to render PDF client-side.
  return c.json({
    jobId: job.id,
    status: 'pending',
    template: {
      layout: template.layout,
      theme: template.theme,
      mergeFields: template.mergeFields,
    },
    mergeData,
  }, 201);
});

// Bulk generate documents
documents.post('/generate-bulk/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const body = await c.req.json();
  const { templateId, recordIds } = body;

  if (!templateId || !recordIds?.length) {
    return c.json({ error: 'templateId and recordIds[] required' }, 400);
  }

  const template = await db.query.documentTemplates.findFirst({
    where: and(
      eq(documentTemplates.schoolId, schoolId),
      eq(documentTemplates.id, templateId)
    ),
  });
  if (!template) return c.json({ error: 'Template not found' }, 404);

  const [job] = await db.insert(documentJobs).values({
    schoolId,
    templateId,
    entityRecordIds: recordIds,
    status: 'pending',
    totalRecords: recordIds.length,
    requestedBy: body.userId || 'system',
  }).returning();

  return c.json({
    jobId: job.id,
    status: 'pending',
    totalRecords: recordIds.length,
    message: 'Bulk generation queued. Poll /api/documents/jobs/:schoolId/:jobId for status.',
  }, 201);
});

// Poll job status
documents.get('/jobs/:schoolId/:jobId', async (c) => {
  const { schoolId, jobId } = c.req.param();
  const job = await db.query.documentJobs.findFirst({
    where: and(
      eq(documentJobs.schoolId, schoolId),
      eq(documentJobs.id, jobId)
    ),
  });
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

// List jobs for a school
documents.get('/jobs/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const jobs = await db.query.documentJobs.findMany({
    where: eq(documentJobs.schoolId, schoolId),
    orderBy: (j, { desc }) => [desc(j.createdAt)],
  });
  return c.json(jobs);
});

// ===== Currency =====

// Get currency settings
documents.get('/currency/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const { currencySettings } = await import('../../../drizzle/schema');
  const settings = await db.query.currencySettings.findFirst({
    where: eq(currencySettings.schoolId, schoolId),
  });
  return c.json(settings || {
    code: 'KES',
    symbol: 'KSh',
    name: 'Kenyan Shilling',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  });
});

// Update currency settings
documents.put('/currency/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const body = await c.req.json();
  const { currencySettings } = await import('../../../drizzle/schema');

  const existing = await db.query.currencySettings.findFirst({
    where: eq(currencySettings.schoolId, schoolId),
  });

  if (existing) {
    const [updated] = await db.update(currencySettings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(currencySettings.schoolId, schoolId))
      .returning();
    return c.json(updated);
  } else {
    const [created] = await db.insert(currencySettings).values({
      schoolId,
      ...body,
    }).returning();
    return c.json(created, 201);
  }
});

// Format amount with school's currency
documents.post('/format-currency/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const { amount } = await c.req.json();
  const { currencySettings } = await import('../../../drizzle/schema');

  const settings = await db.query.currencySettings.findFirst({
    where: eq(currencySettings.schoolId, schoolId),
  });

  const code = settings?.code || 'KES';
  const symbol = settings?.symbol || 'KSh';
  const decimals = settings?.decimalPlaces ?? 2;
  const thousands = settings?.thousandsSeparator || ',';
  const decimal = settings?.decimalSeparator || '.';

  const formatted = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).replace(/,/g, thousands).replace(/\./, decimal);

  return c.json({
    raw: amount,
    formatted: `${symbol} ${formatted}`,
    code,
    symbol,
  });
});

export default documents;

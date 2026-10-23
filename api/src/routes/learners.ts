// Learners Pillar API — Doc 15
// CRUD, relationships, stats — all from entity_records + field_values (EAV)

import { Hono } from 'hono';
import { z } from 'zod';
import { db, rawQuery } from '../db';
import { r2Configured, dataUrlToR2 } from '../lib/r2';
import { linkRecord, unlinkRecord, linkRecordsBulk } from '../../../shared/src/blocks/relationship-operations';
import {
  entityTypes,
  fieldDefinitions,
  entityRecords,
  fieldValues,
  relationshipDefinitions,
  relationshipRecords,
  sections,
  schools,
} from '../../../drizzle/schema';
import { eq, and, or, sql, count, inArray } from 'drizzle-orm';

const learners = new Hono();

// Server-side file validation for data URLs (bypasses frontend validation)
const ALLOWED_FILE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_DATA_URL_SIZE = 10 * 1024 * 1024; // 10MB

function validateDataUrl(dataUrl: string): string | null {
  // Returns error message if invalid, null if ok
  const match = dataUrl.match(/^data:([^;]+);/);
  if (!match) return 'Invalid data URL format';
  const mime = match[1];
  if (!ALLOWED_FILE_MIMES.has(mime)) return `File type "${mime}" is not allowed`;
  // Estimate size from base64 (base64 is ~33% larger than raw)
  const base64Part = dataUrl.split(',')[1] || '';
  const estimatedBytes = Math.round(base64Part.length * 0.75);
  if (estimatedBytes > MAX_DATA_URL_SIZE) return `File too large (${Math.round(estimatedBytes / 1024 / 1024)}MB). Maximum: 10MB`;
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────

const SCHOOL_ID = '88374870-9175-4565-a876-f17c2e295519';

async function getEntityTypeId(schoolId: string, internalName: string) {
  const type = await db.query.entityTypes.findFirst({
    where: and(eq(entityTypes.schoolId, schoolId), eq(entityTypes.internalName, internalName)),
  });
  return type?.id ?? null;
}

// In-memory cache for field definitions (rarely change)
const fieldDefCache = new Map<string, { fields: any[]; at: number }>();
const FIELD_CACHE_TTL = 60_000;

async function getFieldDefs(entityTypeId: string) {
  const cached = fieldDefCache.get(entityTypeId);
  if (cached && Date.now() - cached.at < FIELD_CACHE_TTL) return cached.fields;

  const fields = await db.query.fieldDefinitions.findMany({
    where: eq(fieldDefinitions.entityTypeId, entityTypeId),
    orderBy: (f, { asc }) => [asc(f.displayOrder)],
  });

  // Flatten validationRules for convenience
  const flat = fields.map(f => ({
    ...f,
    maxLength: (f.validationRules as any)?.maxLength ?? null,
    min: (f.validationRules as any)?.min ?? null,
    max: (f.validationRules as any)?.max ?? null,
    fileSubtype: (f.validationRules as any)?.fileSubtype ?? null,
  }));

  fieldDefCache.set(entityTypeId, { fields: flat, at: Date.now() });
  return flat;
}

export function invalidateFieldCache(entityTypeId?: string) {
  if (entityTypeId) fieldDefCache.delete(entityTypeId);
  else fieldDefCache.clear();
}

async function getFieldValues(recordId: string, fields: any[]) {
  if (fields.length === 0) return {};
  const fieldIds = fields.map(f => f.id);
  const values = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) =>
      a(a(eq(fv.entityRecordId, recordId)), i(fv.fieldDefinitionId, fieldIds)),
  });
  const result: Record<string, any> = {};
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  for (const v of values) {
    const field = fieldMap.get(v.fieldDefinitionId);
    if (field) {
      // Resolve typed values: text, number, date, boolean, file (JSONB)
      const val = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
      // For file type, return the URL string from the JSONB object
      if (field.dataType === 'file' && v.fileValue) {
        result[field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        result[field.internalName] = val;
      }
    }
  }
  return result;
}

async function upsertFieldValues(recordId: string, schoolId: string, fields: any[], values: Record<string, any>, partial = false) {
  // If not partial, delete existing values first; if partial, only update specified fields
  if (!partial) {
    await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));
  }

  const fieldMap = new Map(fields.map(f => [f.internalName, f]));

  // Auto-create 'photo' field if it doesn't exist and a photo value is being set
  // This makes photo work universally for any entity type without manual field creation
  if (values.photo && !fieldMap.has('photo')) {
    const entityTypeId = fields[0]?.entityTypeId;
    if (entityTypeId) {
      const [photoField] = await db.insert(fieldDefinitions).values({
        schoolId,
        entityTypeId,
        name: 'Photo',
        internalName: 'photo',
        dataType: 'file',
        isRequired: false,
        displayOrder: 999,
        validationRules: { fileSubtype: 'image' },
      }).returning();
      fieldMap.set('photo', photoField);
      fields.push(photoField);
    }
  }

  const inserts: any[] = [];

  // If partial update, also delete existing values for the fields being updated
  if (partial) {
    const updatingFieldIds = Object.keys(values)
      .map(k => fieldMap.get(k)?.id)
      .filter(Boolean);
    if (updatingFieldIds.length > 0) {
      await db.delete(fieldValues).where(
        and(
          eq(fieldValues.entityRecordId, recordId),
          sql`${fieldValues.fieldDefinitionId} IN ${updatingFieldIds}`,
        ),
      );
    }
  }

  for (const [key, val] of Object.entries(values)) {
    const field = fieldMap.get(key);
    if (!field || val === undefined || val === null || val === '') continue;

    const row: any = {
      schoolId,
      entityRecordId: recordId,
      fieldDefinitionId: field.id,
    };

    if (field.dataType === 'file') {
      // INTERCEPTOR: convert base64 data URLs to R2 object storage on every write path
      // (create / update / import / photo handlers). Photos as base64 in the DB made the
      // learners list endpoint take 25s — see r2.ts. Falls back to base64 only if R2 fails,
      // loudly, so storage problems are visible in the server log.
      if (typeof val === 'string' && val.startsWith('data:') && r2Configured()) {
        // Server-side validation before accepting data URL
        const validationError = validateDataUrl(val);
        if (validationError) {
          console.warn(`[learners] Rejected file for field "${field.internalName}": ${validationError}`);
          continue; // Skip this field value
        }
        try {
          const uploaded = await dataUrlToR2(val, schoolId, 'uploads', field.internalName === 'photo' ? 'photo.jpg' : undefined);
          row.fileValue = uploaded;
        } catch (err: any) {
          console.error(`[learners] R2 upload failed for field "${field.internalName}", storing base64 fallback:`, err.message);
          row.fileValue = typeof val === 'string' ? { url: val } : val;
        }
      } else {
        row.fileValue = typeof val === 'string' ? { url: val } : val;
      }
    } else {
      switch (field.dataType) {
        case 'number':
          row.numericValue = Number(val);
          break;
        case 'date':
          row.dateValue = String(val);
          break;
        case 'time':
          row.textValue = String(val);
          break;
        case 'boolean':
          row.booleanValue = Boolean(val);
          break;
        default:
          if (Array.isArray(val)) row.textValue = JSON.stringify(val);
          else row.textValue = String(val);
      }
    }
    inserts.push(row);
  }

  // Batch insert in chunks of 50
  for (let i = 0; i < inserts.length; i += 50) {
    await db.insert(fieldValues).values(inserts.slice(i, i + 50));
  }
}

// ─── Stats endpoint (Doc 15 §2.1 — single source of truth) ────

learners.get('/stats/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');

  // Count entity_records per entity type — the ONLY source of truth
  const counts = await db.execute(sql`
    SELECT et.internal_name, COUNT(er.id) as cnt
    FROM entity_records er
    JOIN entity_types et ON er.entity_type_id = et.id
    WHERE er.school_id = ${schoolId} AND er.is_deleted = false
    GROUP BY et.internal_name
  `);

  const result: Record<string, number> = {};
  for (const row of counts.rows) {
    result[row.internal_name as string] = Number(row.cnt);
  }

  // Entity types use singular names in DB (learner, class, etc.)
  // Return with both singular and plural keys for flexibility
  return c.json({
    learners: result['learner'] ?? 0,
    classes: result['class'] ?? 0,
    subjects: result['subject'] ?? 0,
    teachers: result['teacher'] ?? 0,
    terms: result['term'] ?? 0,
    assessments: result['assessment'] ?? 0,
    enrollments: result['enrollment'] ?? 0,
    newThisTerm: result['enrollment'] ?? 0,
  });
});

// ─── List all learner records with field values ────────────────

learners.get('/list/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const t0 = Date.now();
  const entityTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!entityTypeId) return c.json({ error: 'Learner entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);
  console.log(`[learners/list] getFieldDefs: ${Date.now() - t0}ms`);

  // ─── Single aggregated query: each record with its values pre-built as JSON ───
  // PERFORMANCE (this endpoint used to take ~25s for 413 learners):
  //  1. Never SELECTs file_value — photos are stored as base64 data URLs (up to 5MB each).
  //     Transferring them for every learner bloated the response to ~4.5MB, which also blew
  //     the frontend localStorage cache quota (QuotaExceededError was silently swallowed, so
  //     the page re-fetched from scratch on every visit). File fields instead return a
  //     presence marker '1'; Avatar falls back to initials, and the detail view
  //     (GET /learners/record/:schoolId/:recordId) still returns the full photo.
  //  2. jsonb_object_agg builds each record's values object INSIDE Postgres, so the Neon HTTP
  //     driver transfers ~413 rows instead of ~3,400 (its cost is dominated by per-row overhead).
  //  3. Runs in parallel with the sections query.
  const t1 = Date.now();
  const [rows, sectionList] = await Promise.all([
    rawQuery(
      `WITH rec AS (
         SELECT er.id, er.created_at, er.updated_at
         FROM entity_records er
         WHERE er.school_id = $1 AND er.entity_type_id = $2 AND er.is_deleted = false
         ORDER BY er.created_at DESC
         LIMIT 500
       )
       SELECT rec.id, rec.created_at, rec.updated_at,
              COALESCE(jsonb_object_agg(fd.internal_name, x.v)
                FILTER (WHERE fd.internal_name IS NOT NULL AND x.v IS NOT NULL), '{}'::jsonb) AS values
       FROM rec
       LEFT JOIN field_values fv ON fv.entity_record_id = rec.id
       LEFT JOIN field_definitions fd ON fd.id = fv.field_definition_id
       CROSS JOIN LATERAL (
         SELECT CASE fd.data_type
             WHEN 'file' THEN CASE WHEN fv.file_value IS NOT NULL THEN '"1"'::jsonb END
             WHEN 'number' THEN to_jsonb(fv.numeric_value)
             WHEN 'boolean' THEN to_jsonb(fv.boolean_value)
             WHEN 'date' THEN to_jsonb(fv.date_value)
             ELSE to_jsonb(fv.text_value)
           END AS v
       ) x
       GROUP BY rec.id, rec.created_at, rec.updated_at
       ORDER BY rec.created_at DESC`,
      [schoolId, entityTypeId]
    ),
    rawQuery(
      'SELECT * FROM sections WHERE school_id = $1 AND entity_type_id = $2 ORDER BY display_order ASC',
      [schoolId, entityTypeId]
    ),
  ]);
  console.log(`[learners/list] records+values: ${rows.length} rows in ${Date.now() - t1}ms`);

  const result = rows.map((r: any) => ({
    id: r.id,
    values: r.values || {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return c.json({ records: result, fields, sections: sectionList });
});

// ─── Get single learner record with all values ─────────────────

learners.get('/record/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId),
    ),
  });

  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);
  const values = await getFieldValues(recordId, fields);

  // Get related records via relationship_records
  const relatedTypes = await db.query.relationshipDefinitions.findMany({
    where: (rd, { or: o, and: a }) =>
      o(
        a(eq(rd.fromEntityTypeId, record.entityTypeId), eq(rd.isActive, true)),
        a(eq(rd.toEntityTypeId, record.entityTypeId), eq(rd.isActive, true)),
      ),
  });

  // Fetch related records
  const relatedData: Record<string, any[]> = {};
  for (const rel of relatedTypes) {
    const isFrom = rel.fromEntityTypeId === record.entityTypeId;
    const targetEntityTypeId = isFrom ? rel.toEntityTypeId : rel.fromEntityTypeId;
    const targetType = await db.query.entityTypes.findFirst({
      where: eq(entityTypes.id, targetEntityTypeId),
    });
    if (!targetType) continue;

    const relRecords = await db.query.relationshipRecords.findMany({
      where: (rr, { or: o, and: a }) =>
        o(
          a(eq(rr.fromEntityRecordId, recordId), eq(rr.relationshipDefinitionId, rel.id)),
          a(eq(rr.toEntityRecordId, recordId), eq(rr.relationshipDefinitionId, rel.id)),
        ),
    });

    // Get the "other" record ID from each relationship
    const otherRecordIds = relRecords.map(rr =>
      rr.fromEntityRecordId === recordId ? rr.toEntityRecordId : rr.fromEntityRecordId
    );

    if (otherRecordIds.length > 0) {
      const otherFields = await getFieldDefs(targetEntityTypeId);
      const otherRecords: any[] = [];
      for (const otherId of otherRecordIds) {
        const otherVals = await getFieldValues(otherId, otherFields);
        otherRecords.push({ id: otherId, values: otherVals });
      }
      relatedData[targetType.internalName] = otherRecords;
    }
  }

  // Get sections for grouping
  const sectionList = await db.query.sections.findMany({
    where: and(
      eq(sections.schoolId, schoolId),
      eq(sections.entityTypeId, record.entityTypeId),
    ),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  // Group field values by section
  const sectionsWithValues = sectionList.map(section => ({
    ...section,
    fields: fields.filter(f => f.sectionId === section.id).map(f => ({
      ...f,
      value: values[f.internalName] ?? null,
    })),
  }));

  const unsectionedFields = fields.filter(f => !f.sectionId).map(f => ({
    ...f,
    value: values[f.internalName] ?? null,
  }));

  // Photo is now in fieldValues via EAV — no metadata injection needed.

  return c.json({
    id: record.id,
    values,
    sections: sectionsWithValues,
    unsectionedFields,
    related: relatedData,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
});

// ─── Create learner record ─────────────────────────────────────

learners.post('/create/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { values } = body;

  const entityTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!entityTypeId) return c.json({ error: 'Learner entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);

  // Validate required fields
  const requiredFields = fields.filter(f => f.isRequired);
  for (const rf of requiredFields) {
    if (!values || !values[rf.internalName]) {
      return c.json({ error: `Field "${rf.name}" is required` }, 400);
    }
  }

  // Validate identifier uniqueness
  const identifierField = fields.find(f => f.isIdentifier);
  if (identifierField && values?.[identifierField.internalName]) {
    const identifierVal = String(values[identifierField.internalName]);
    const existing = await db.query.fieldValues.findMany({
      where: (fv, { and: a, eq: e }) =>
        a(a(e(fv.fieldDefinitionId, identifierField.id)), e(fv.textValue, identifierVal)),
    });
    if (existing.length > 0) {
      return c.json({ error: `A record with this ${identifierField.name} already exists` }, 400);
    }
  }

  // Create entity record
  const [record] = await db.insert(entityRecords).values({
    schoolId,
    entityTypeId,
    isDeleted: false,
  }).returning();

  // Insert field values
  await upsertFieldValues(record.id, schoolId, fields, values || {});

  return c.json({ id: record.id, success: true }, 201);
});

// ─── Update learner record ─────────────────────────────────────

learners.put('/update/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const body = await c.req.json();
  const { values } = body;

  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId),
      eq(entityRecords.isDeleted, false),
    ),
  });

  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);

  // Photo now goes through EAV like any other file-type field.
  // No special metadata handling — the upsertFieldValues function handles file type.
  // This means any entity type (Teacher, Class, etc.) can have a photo field
  // without bespoke code.

  // Validate identifier uniqueness (excluding this record)
  const identifierField = fields.find(f => f.isIdentifier);
  if (identifierField && values?.[identifierField.internalName]) {
    const identifierVal = String(values[identifierField.internalName]);
    const existing = await db.query.fieldValues.findMany({
      where: (fv, { and: a, eq: e, neq: n }) =>
        a(
          a(e(fv.fieldDefinitionId, identifierField.id), e(fv.textValue, identifierVal)),
          n(fv.entityRecordId, recordId),
        ),
    });
    if (existing.length > 0) {
      return c.json({ error: `A record with this ${identifierField.name} already exists` }, 400);
    }
  }

  // Upsert field values — use partial update if only some fields are sent
  const isPartial = body.partial === true;
  await upsertFieldValues(recordId, schoolId, fields, values || {}, isPartial);

  // Update the record's updated_at
  await db.update(entityRecords)
    .set({ updatedAt: new Date() })
    .where(eq(entityRecords.id, recordId));

  return c.json({ success: true });
});

// ─── Soft-delete learner record ────────────────────────────────

learners.delete('/delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId),
    ),
  });

  if (!record) return c.json({ error: 'Record not found' }, 404);

  // Soft-delete
  await db.update(entityRecords)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(entityRecords.id, recordId));

  // Count what will be affected
  const affectedRel = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o }) =>
      o(
        eq(rr.fromEntityRecordId, recordId),
        eq(rr.toEntityRecordId, recordId),
      ),
  });

  return c.json({
    success: true,
    affected: {
      relationships: affectedRel.length,
    },
    message: `Learner record archived. ${affectedRel.length} relationship(s) will also be hidden.`,
  });
});

// ─── Permanent delete (hard delete) ───────────────────────────

learners.delete('/permanent-delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId),
    ),
  });

  if (!record) return c.json({ error: 'Record not found' }, 404);

  // Delete related relationship records
  await db.delete(relationshipRecords).where(
    or(
      eq(relationshipRecords.fromEntityRecordId, recordId),
      eq(relationshipRecords.toEntityRecordId, recordId),
    ),
  );

  // Delete all field values
  await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));

  // Delete the entity record itself
  await db.delete(entityRecords).where(eq(entityRecords.id, recordId));

  return c.json({ success: true, message: 'Learner record permanently deleted.' });
});

// ─── Bulk permanent delete ─────────────────────────────────────

learners.post('/bulk-delete/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { recordIds } = body;

  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return c.json({ error: 'recordIds array is required' }, 400);
  }

  let deletedCount = 0;
  for (const recordId of recordIds) {
    const record = await db.query.entityRecords.findFirst({
      where: and(
        eq(entityRecords.schoolId, schoolId),
        eq(entityRecords.id, recordId),
      ),
    });
    if (!record) continue;

    // Delete relationships
    await db.delete(relationshipRecords).where(
      or(
        eq(relationshipRecords.fromEntityRecordId, recordId),
        eq(relationshipRecords.toEntityRecordId, recordId),
      ),
    );

    // Delete field values
    await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));

    // Delete the record
    await db.delete(entityRecords).where(eq(entityRecords.id, recordId));
    deletedCount++;
  }

  return c.json({ success: true, deleted: deletedCount });
});

// ─── Get related records for a learner ─────────────────────────

learners.get('/related/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!targetTypeId) return c.json({ error: 'Target entity type not found' }, 404);

  // Find relationship definition between this record's entity type and target
  const record = await db.query.entityRecords.findFirst({
    where: eq(entityRecords.id, recordId),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) =>
      a(
        eq(rd.isActive, true),
        o(
          a(eq(rd.fromEntityTypeId, record.entityTypeId), eq(rd.toEntityTypeId, targetTypeId)),
          a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, record.entityTypeId)),
        ),
      ),
  });

  if (!relDef) return c.json({ records: [] });

  // Get relationship records
  const relRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) =>
      o(
        a(eq(rr.fromEntityRecordId, recordId), eq(rr.relationshipDefinitionId, relDef.id)),
        a(eq(rr.toEntityRecordId, recordId), eq(rr.relationshipDefinitionId, relDef.id)),
      ),
  });

  const otherRecordIds = relRecords.map(rr =>
    rr.fromEntityRecordId === recordId ? rr.toEntityRecordId : rr.fromEntityRecordId
  );

  if (otherRecordIds.length === 0) return c.json({ records: [] });

  const targetFields = await getFieldDefs(targetTypeId);
  const result: any[] = [];
  for (const id of otherRecordIds) {
    const vals = await getFieldValues(id, targetFields);
    result.push({ id, values: vals });
  }

  return c.json({ records: result });
});

// ─── Create a relationship link ────────────────────────────────

learners.post('/link/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordId, relationshipDefinitionId } = await c.req.json();

  if (!fromRecordId || !toRecordId || !relationshipDefinitionId) {
    return c.json({ error: 'fromRecordId, toRecordId, and relationshipDefinitionId are required' }, 400);
  }

  const result = await linkRecord({ schoolId, fromRecordId, toRecordId, relationshipDefinitionId });
  if ('error' in result) return c.json(result, 400);
  return c.json(result, 201);
});

// ─── Bulk Link ───

learners.post('/link-bulk/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordIds, relationshipDefinitionId } = await c.req.json();

  if (!Array.isArray(toRecordIds) || toRecordIds.length === 0) {
    return c.json({ error: 'toRecordIds must be a non-empty array' }, 400);
  }

  const result = await linkRecordsBulk({ schoolId, fromRecordId, toRecordIds, relationshipDefinitionId });
  return c.json(result, 201);
});

// ─── Remove a relationship link ────────────────────────────────

learners.delete('/unlink/:schoolId/:linkId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const linkId = c.req.param('linkId');
  await unlinkRecord({ schoolId, linkId });
  return c.json({ success: true });
});

// ─── Import learners from CSV data ────────────────────────────
// Doc 15 §2.6 — Full import pipeline with column mapping and preview

learners.post('/import/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { rows, columnMapping, dryRun } = body;
  // rows: Array<Record<string, string>> — parsed CSV rows
  // columnMapping: Record<string, string> — { csvColumnHeader: fieldInternalName }
  // dryRun: boolean — if true, return preview without writing

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: 'No rows provided' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!entityTypeId) return c.json({ error: 'Learner entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);
  const fieldMap = new Map(fields.map(f => [f.internalName, f]));

  // Build reverse mapping: fieldInternalName → csvHeader
  const reverseMap: Record<string, string> = {};
  for (const [csvHeader, fieldName] of Object.entries(columnMapping)) {
    if (fieldName && fieldMap.has(fieldName as string)) {
      reverseMap[fieldName as string] = csvHeader;
    }
  }

  // Get identifier field for duplicate detection
  const identifierField = fields.find(f => f.isIdentifier);
  let existingIdentifiers: Set<string> = new Set();
  if (identifierField) {
    const existingVals = await db.query.fieldValues.findMany({
      where: (fv, { and: a, eq: e }) =>
        a(e(fv.fieldDefinitionId, identifierField.id), e(fv.schoolId, schoolId)),
    });
    existingIdentifiers = new Set(existingVals.map(v => v.textValue || '').filter(Boolean));
  }

  // Process rows
  const preview: any[] = [];
  let newCount = 0;
  let updateCount = 0;
  let skipCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values: Record<string, any> = {};
    const rowErrors: string[] = [];

    // Map CSV columns to field values
    for (const [fieldName, csvHeader] of Object.entries(reverseMap)) {
      const field = fieldMap.get(fieldName);
      if (!field) continue;
      const rawVal = row[csvHeader];
      if (rawVal === undefined || rawVal === null || rawVal === '') continue;

      switch (field.dataType) {
        case 'number':
          const num = Number(rawVal);
          if (isNaN(num)) { rowErrors.push(`${field.name}: "${rawVal}" is not a number`); break; }
          values[fieldName] = num;
          break;
        case 'date':
          values[fieldName] = rawVal; // Keep as string, validate format
          break;
        case 'boolean':
          values[fieldName] = ['true', 'yes', '1', 'on'].includes(String(rawVal).toLowerCase());
          break;
        default:
          values[fieldName] = String(rawVal);
      }
    }

    // Validate required fields
    for (const rf of fields.filter(f => f.isRequired)) {
      if (!values[rf.internalName]) {
        rowErrors.push(`${rf.name} is required`);
      }
    }

    // Check identifier for new vs update
    let status = 'new';
    if (identifierField && values[identifierField.internalName]) {
      const idVal = String(values[identifierField.internalName]);
      if (existingIdentifiers.has(idVal)) {
        status = 'update';
        updateCount++;
      } else {
        newCount++;
        existingIdentifiers.add(idVal); // Track to avoid duplicates within import
      }
    } else {
      newCount++;
    }

    if (rowErrors.length > 0) {
      status = 'error';
      skipCount++;
      errors.push(`Row ${i + 1}: ${rowErrors.join('; ')}`);
    }

    preview.push({
      row: i + 1,
      status,
      values,
      errors: rowErrors,
    });
  }

  // If dry run, return preview
  if (dryRun) {
    return c.json({
      preview,
      summary: {
        total: rows.length,
        new: newCount,
        update: updateCount,
        errors: skipCount,
      },
      errorMessages: errors.slice(0, 10), // First 10 errors
    });
  }

  // Actually import
  let imported = 0;
  let failed = 0;
  const importErrors: string[] = [];

  for (const item of preview) {
    if (item.status === 'error') { failed++; continue; }

    try {
      if (item.status === 'update' && identifierField) {
        // Find existing record by identifier
        const idVal = String(item.values[identifierField.internalName]);
        const existingFV = await db.query.fieldValues.findFirst({
          where: (fv, { and: a, eq: e }) =>
            a(a(e(fv.fieldDefinitionId, identifierField.id), e(fv.textValue, idVal)), e(fv.schoolId, schoolId)),
        });
        if (existingFV) {
          await upsertFieldValues(existingFV.entityRecordId, schoolId, fields, item.values);
          imported++;
          continue;
        }
      }

      // Create new record
      const [record] = await db.insert(entityRecords).values({
        schoolId,
        entityTypeId,
        isDeleted: false,
      }).returning();

      await upsertFieldValues(record.id, schoolId, fields, item.values);
      imported++;
    } catch (err: any) {
      failed++;
      importErrors.push(`Row ${item.row}: ${err.message}`);
    }
  }

  return c.json({
    success: true,
    summary: {
      total: rows.length,
      imported,
      failed,
    },
    errors: importErrors.slice(0, 10),
  });
});

// ─── Custom Field Management (Doc 15 — dynamic fields) ────────

learners.post('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { name, dataType, options, isRequired, unit, maxLength, min, max, color, fileSubtype } = body;

  if (!name || !dataType) return c.json({ error: 'name and dataType required' }, 400);

  const entityTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!entityTypeId) return c.json({ error: 'Learner entity type not found' }, 404);

  // Generate internal name
  const internalName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // Check duplicate
  const existing = await db.query.fieldDefinitions.findFirst({
    where: (fd, { and: a, eq: e }) =>
      a(a(e(fd.schoolId, schoolId), e(fd.entityTypeId, entityTypeId)), e(fd.internalName, internalName)),
  });
  if (existing) return c.json({ error: 'A field with this name already exists' }, 400);

  // Get max display order
  const allFields = await db.query.fieldDefinitions.findMany({
    where: (fd, { and: a, eq: e }) => a(e(fd.schoolId, schoolId), e(fd.entityTypeId, entityTypeId)),
    orderBy: (fd, { desc }) => [desc(fd.displayOrder)],
    limit: 1,
  });
  const nextOrder = (allFields[0]?.displayOrder ?? 0) + 1;

  const [field] = await db.insert(fieldDefinitions).values({
    schoolId,
    entityTypeId,
    name,
    internalName,
    dataType,
    options: options || null,
    isRequired: isRequired || false,
    unit: unit || null,
    displayOrder: nextOrder,
    validationRules: {
      ...(maxLength ? { maxLength: Number(maxLength) } : {}),
      ...(min !== undefined && min !== null ? { min: Number(min) } : {}),
      ...(max !== undefined && max !== null ? { max: Number(max) } : {}),
      ...(color && color !== 'default' ? { color } : {}),
      ...(fileSubtype ? { fileSubtype } : {}),
    },
  }).returning();

  invalidateFieldCache(entityTypeId);
  return c.json(field, 201);
});

learners.put('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');
  const body = await c.req.json();

  const field = await db.query.fieldDefinitions.findFirst({
    where: (fd, { and: a, eq: e }) => a(a(e(fd.schoolId, schoolId), e(fd.id, fieldId))),
  });
  if (!field) return c.json({ error: 'Field not found' }, 404);

  const updated = await db.update(fieldDefinitions)
    .set({
      name: body.name ?? field.name,
      options: body.options ?? field.options,
      isRequired: body.isRequired ?? field.isRequired,
      unit: body.unit ?? field.unit,
      displayOrder: body.displayOrder ?? field.displayOrder,
      validationRules: body.color !== undefined
        ? { ...(field.validationRules as any || {}), ...(body.color && body.color !== 'default' ? { color: body.color } : (() => { const r = { ...(field.validationRules as any || {}) }; delete r.color; return r; })()) }
        : field.validationRules,
    })
    .where(eq(fieldDefinitions.id, fieldId))
    .returning();

  invalidateFieldCache(field.entityTypeId);
  return c.json(updated[0]);
});

learners.delete('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');

  const field = await db.query.fieldDefinitions.findFirst({
    where: (fd, { and: a, eq: e }) => a(a(e(fd.schoolId, schoolId), e(fd.id, fieldId))),
  });
  if (!field) return c.json({ error: 'Field not found' }, 404);

  // Delete field values for this field
  await db.delete(fieldValues).where(eq(fieldValues.fieldDefinitionId, fieldId));
  // Delete the field definition
  await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));

invalidateFieldCache(field.entityTypeId);
  return c.json({ success: true });
});

// ─── Get relationships for learner entity type ──────────────────────

learners.get('/relationships/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!learnerTypeId) return c.json({ relationships: [] });

  // Find all relationship definitions involving learner entity type
  const relDefs = await db.query.relationshipDefinitions.findMany({
    where: (rd, { or: o }) =>
      o(
        eq(rd.fromEntityTypeId, learnerTypeId),
        eq(rd.toEntityTypeId, learnerTypeId),
      ),
    });

  // For each relationship definition, find the linked records
  const relationships = await Promise.all(relDefs.map(async (relDef) => {
    const relRecords = await db.query.relationshipRecords.findMany({
      where: (rr, { and: a, or: o }) =>
        a(
          eq(rr.relationshipDefinitionId, relDef.id),
          o(
            eq(rr.fromEntityRecordId, null),  // Will be populated below
            eq(rr.toEntityRecordId, null),
          ),
        ),
      });

      // Get the linked records - if learner is fromEntity, linked is toEntity, and vice versa
      const linkedRecordIds = relRecords.map(rr => 
        rr.fromEntityRecordId 
          ? (rr.toEntityRecordId || null) 
          : (rr.fromEntityRecordId || null)
      ).filter(Boolean);

      // Get related entity type
      const relatedType = await db.query.entityTypes.findFirst({
        where: and(
          eq(entityTypes.schoolId, schoolId),
          o(
            eq(entityTypes.internalName, 'class'),
            eq(entityTypes.id, rr.toEntityRecordId?.split('-')[0])
          )
        ),
      });

      return {
        relationshipDefinitionId: relDef.id,
        relatedEntityType: 'class', // Will be determined dynamically
        cardinality: relDef.cardinality,
        linkedRecordIds,
      };
    }));

  return c.json({ relationships });
});

// ─── Get all field definitions for learner entity type ───────────────────────
learners.get('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!entityTypeId) return c.json({ fields: [] });

  const flat = await getFieldDefs(entityTypeId);

  // Include relationship definitions as virtual fields
  const { getRelationshipFields } = await import('../../../shared/src/blocks/relationship-fields');
  const relFields = await getRelationshipFields(schoolId, entityTypeId);

  return c.json({ fields: [...flat, ...relFields] });
});

// ─── Version marker for cache staleness detection ────────────────
// Returns lastUpdatedAt + count per entity type — cheap to compute, no full data payload.
// Frontend uses this to detect cross-device staleness via stale-while-revalidate.

learners.get('/version/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');

  const versions = await db.execute(sql`
    SELECT et.internal_name,
           COUNT(er.id) as cnt,
           MAX(er.updated_at) as last_updated
    FROM entity_records er
    JOIN entity_types et ON er.entity_type_id = et.id
    WHERE er.school_id = ${schoolId}
    GROUP BY et.internal_name
  `);

  const result: Record<string, { count: number; lastUpdatedAt: string }> = {};
  for (const row of versions.rows) {
    result[row.internal_name as string] = {
      count: Number(row.cnt),
      lastUpdatedAt: row.last_updated ? new Date(row.last_updated as string).toISOString() : new Date(0).toISOString(),
    };
  }

  return c.json({ versions: result });
});

// ─── Widget config (server-side, per school) ────────────────────
// Widgets are school-level, not per-user. Stored as JSONB in school settings.

learners.get('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  return c.json({ widgets: (school?.settings as any)?.widgets || {} });
});

learners.put('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { widgets } = body;

  // Merge widgets into school settings
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  const settings = (school?.settings as any) || {};
  settings.widgets = widgets;

  await db.update(schools).set({ settings, updatedAt: new Date() }).where(eq(schools.id, schoolId));

  return c.json({ success: true });
});

export default learners;

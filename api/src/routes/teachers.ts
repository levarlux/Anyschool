// Teachers Pillar — Doc 17
// Full CRUD, relationships, stats, widget config, import

import { Hono } from 'hono';
import { db } from '../db';
import { r2Configured, dataUrlToR2 } from '../lib/r2';
import {
  entityTypes, fieldDefinitions, entityRecords, fieldValues,
  relationshipDefinitions, relationshipRecords, schools, sections,
} from '../../../drizzle/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';
import { linkRecord, unlinkRecord, linkRecordsBulk } from '../../../shared/src/blocks/relationship-operations';

const teachers = new Hono();

// Server-side file validation for data URLs
const ALLOWED_FILE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_DATA_URL_SIZE = 10 * 1024 * 1024;

function validateDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;]+);/);
  if (!match) return 'Invalid data URL format';
  const mime = match[1];
  if (!ALLOWED_FILE_MIMES.has(mime)) return `File type "${mime}" is not allowed`;
  const base64Part = dataUrl.split(',')[1] || '';
  const estimatedBytes = Math.round(base64Part.length * 0.75);
  if (estimatedBytes > MAX_DATA_URL_SIZE) return `File too large (${Math.round(estimatedBytes / 1024 / 1024)}MB). Maximum: 10MB`;
  return null;
}

// ─── Helpers ────────────────────────────────────────────────

const fieldDefCache = new Map<string, { fields: any[]; at: number }>();
const FIELD_CACHE_TTL = 60_000;

async function getEntityTypeId(schoolId: string, internalName: string) {
  const type = await db.query.entityTypes.findFirst({
    where: and(eq(entityTypes.schoolId, schoolId), eq(entityTypes.internalName, internalName)),
  });
  return type?.id ?? null;
}
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
function invalidateFieldCache(entityTypeId?: string) {
  if (entityTypeId) fieldDefCache.delete(entityTypeId);
  else fieldDefCache.clear();
}

async function getFieldValues(recordId: string, fields: any[]) {
  const vals = await db.query.fieldValues.findMany({
    where: eq(fieldValues.entityRecordId, recordId),
  });
  const result: Record<string, any> = {};
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  for (const v of vals) {
    const field = fieldMap.get(v.fieldDefinitionId);
    if (field) {
      if (field.dataType === 'file' && v.fileValue) {
        result[field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        result[field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
      }
    }
  }
  return result;
}

async function batchGetFieldValues(recordIds: string[], fields: any[]): Promise<Map<string, Record<string, any>>> {
  const result = new Map<string, Record<string, any>>();
  if (recordIds.length === 0 || fields.length === 0) return result;
  const allVals = await db.query.fieldValues.findMany({
    where: (fv, { inArray: i }) => i(fv.entityRecordId, recordIds),
  });
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  for (const rid of recordIds) result.set(rid, {});
  for (const v of allVals) {
    const field = fieldMap.get(v.fieldDefinitionId);
    const vals = result.get(v.entityRecordId);
    if (field && vals) {
      if (field.dataType === 'file' && v.fileValue) {
        vals[field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        vals[field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
      }
    }
  }
  return result;
}

async function upsertFieldValues(
  recordId: string, schoolId: string, fields: any[],
  values: Record<string, any>, partial = false,
) {
  if (!partial) {
    await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));
  }
  const fieldMap = new Map(fields.map(f => [f.internalName, f]));
  const toUpsert: any[] = [];
  for (const [key, val] of Object.entries(values)) {
    if (val === undefined) continue;
    const field = fieldMap.get(key);
    if (!field) continue;
    toUpsert.push({ schoolId, entityRecordId: recordId, fieldDefinitionId: field.id, textValue: null, numericValue: null, dateValue: null, booleanValue: null, fileValue: null });
    const last = toUpsert[toUpsert.length - 1];
    if (val === null) { /* all nulls — just clear */ }
    else if (field.dataType === 'number' || field.dataType === 'currency' || field.dataType === 'measurement') last.numericValue = Number(val);
    else if (field.dataType === 'date') last.dateValue = String(val);
    else if (field.dataType === 'time') last.textValue = String(val);
    else if (field.dataType === 'boolean') last.booleanValue = Boolean(val);
    else if (field.dataType === 'file') {
      // Server-side validation for data URLs
      if (typeof val === 'string' && val.startsWith('data:')) {
        const err = validateDataUrl(val);
        if (err) { console.warn(`[teachers] Rejected file for "${field.internalName}": ${err}`); continue; }
        // Upload to R2 like learners does
        if (r2Configured()) {
          try {
            const uploaded = await dataUrlToR2(val, schoolId, 'uploads', field.internalName === 'photo' ? 'photo.jpg' : undefined);
            last.fileValue = uploaded;
          } catch (err: any) {
            console.error(`[teachers] R2 upload failed for "${field.internalName}", storing base64 fallback:`, err.message);
            last.fileValue = { url: val };
          }
        } else {
          last.fileValue = { url: val };
        }
      } else {
        last.fileValue = typeof val === 'string' ? { url: val } : val;
      }
    }
    else if (Array.isArray(val)) last.textValue = JSON.stringify(val);
    else last.textValue = String(val);
  }
  for (let i = 0; i < toUpsert.length; i += 50) {
    await db.insert(fieldValues).values(toUpsert.slice(i, i + 50));
  }
}

async function getRelationshipCount(recordId: string, schoolId: string, targetEntityName: string): Promise<number> {
  const teacherTypeId = await getEntityTypeId(schoolId, 'teacher');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!teacherTypeId || !targetTypeId) return 0;

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, teacherTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, teacherTypeId)),
      ), eq(rd.isActive, true)
    ),
  });
  if (!relDef) return 0;

  const relRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) => a(
      eq(rr.relationshipDefinitionId, relDef.id),
      o(eq(rr.fromEntityRecordId, recordId), eq(rr.toEntityRecordId, recordId)),
    ),
  });
  return relRecords.length;
}

// ─── List ───

teachers.get('/list/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'teacher');
  if (!entityTypeId) return c.json({ error: 'Teacher entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const records = await db.query.entityRecords.findMany({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.entityTypeId, entityTypeId), eq(entityRecords.isDeleted, false)),
    orderBy: (er, { desc }) => [desc(er.createdAt)],
    limit: 500,
  });

  if (records.length === 0) return c.json({ records: [], fields, sections: [] });

  const recordIds = records.map(r => r.id);
  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, recordIds)),
  });

  const valueMap = new Map<string, Record<string, any>>();
  for (const v of allValues) {
    if (!valueMap.has(v.entityRecordId)) valueMap.set(v.entityRecordId, {});
    const field = fieldMap.get(v.fieldDefinitionId);
    if (field) {
      const vals = valueMap.get(v.entityRecordId)!;
      if (field.dataType === 'file' && v.fileValue) {
        vals[field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        vals[field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
      }
    }
  }

  // Unified batch resolution: 5 shared queries for fields + counts + display names
  const { resolveAllRelationshipData } = await import('../../../shared/src/blocks/relationship-fields');
  const { relFields, relCounts, relValues } = await resolveAllRelationshipData(
    schoolId, recordIds, entityTypeId, ['subject', 'class'],
  );

  const result = records.map(r => {
    const vals = valueMap.get(r.id) || {};
    const counts = relCounts.get(r.id) || {};
    const relVals = relValues.get(r.id) || {};
    // Map target entity name → _names array for convenience keys
    const subjectsNamesKey = relFields.find(f => f._targetEntityName === 'subject');
    const classesNamesKey = relFields.find(f => f._targetEntityName === 'class');
    return {
      id: r.id,
      values: {
        ...vals,
        __subjects_count: counts.subject || 0,
        __classes_count: counts.class || 0,
        ...(subjectsNamesKey ? { __subjects_names: relVals[`${subjectsNamesKey.internalName}_names`] || [] } : {}),
        ...(classesNamesKey ? { __classes_names: relVals[`${classesNamesKey.internalName}_names`] || [] } : {}),
        ...relVals,
      },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  const sectionList = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  // Include relationship fields in the fields list for the frontend
  const allFields = [...fields, ...relFields];

  return c.json({ records: result, fields: allFields, sections: sectionList });
});

// ─── Record Detail ───

teachers.get('/record/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.id, recordId), eq(entityRecords.schoolId, schoolId)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);
  const values = await getFieldValues(recordId, fields);

  // Find all active relationship definitions involving teacher
  const relatedTypes = await db.query.relationshipDefinitions.findMany({
    where: (rd, { or: o, and: a }) => o(
      a(eq(rd.fromEntityTypeId, record.entityTypeId), eq(rd.isActive, true)),
      a(eq(rd.toEntityTypeId, record.entityTypeId), eq(rd.isActive, true)),
    ),
  });

  const relatedData: Record<string, any[]> = {};
  const relDefMap: Record<string, string> = {};

  // Collect all target info and record IDs across relationship types for batch query
  const relTargets: Array<{ rel: typeof relatedTypes[number]; targetType: any; otherRecordIds: string[]; relRecords: any[] }> = [];
  for (const rel of relatedTypes) {
    const isFrom = rel.fromEntityTypeId === record.entityTypeId;
    const targetEntityTypeId = isFrom ? rel.toEntityTypeId : rel.fromEntityTypeId;
    const targetType = await db.query.entityTypes.findFirst({
      where: eq(entityTypes.id, targetEntityTypeId),
    });
    if (!targetType) continue;

    const relRecords = await db.query.relationshipRecords.findMany({
      where: (rr, { or: o, and: a }) => a(
        eq(rr.relationshipDefinitionId, rel.id),
        o(eq(rr.fromEntityRecordId, recordId), eq(rr.toEntityRecordId, recordId)),
      ),
    });

    const otherRecordIds = relRecords.map(rr =>
      rr.fromEntityRecordId === recordId ? rr.toEntityRecordId : rr.fromEntityRecordId
    );

    relTargets.push({ rel, targetType, otherRecordIds, relRecords });
    relDefMap[targetType.internalName] = rel.id;
  }

  // Batch fetch all field values for all related records across all types
  const allOtherIds = relTargets.flatMap(t => t.otherRecordIds);
  if (allOtherIds.length > 0) {
    // Collect all unique target field defs
    const uniqueTargetTypeIds = [...new Set(relTargets.map(t => t.rel.fromEntityTypeId === record.entityTypeId ? t.rel.toEntityTypeId : t.rel.fromEntityTypeId))];
    const targetFieldsMap = new Map<string, any[]>();
    for (const tid of uniqueTargetTypeIds) {
      targetFieldsMap.set(tid, await getFieldDefs(tid));
    }
    const allTargetFields = [...new Set(relTargets.flatMap(t => targetFieldsMap.get(t.rel.fromEntityTypeId === record.entityTypeId ? t.rel.toEntityTypeId : t.rel.fromEntityTypeId) || []))];
    const allValuesMap = await batchGetFieldValues(allOtherIds, allTargetFields);

    for (const { targetType, otherRecordIds, relRecords } of relTargets) {
      if (otherRecordIds.length > 0) {
        relatedData[targetType.internalName] = otherRecordIds.map(id => ({
          id,
          values: allValuesMap.get(id) || {},
          linkId: relRecords.find(rr => rr.fromEntityRecordId === id || rr.toEntityRecordId === id)?.id,
        }));
      }
    }
  }

  const sectionRows = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, record.entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  const sectionsData = sectionRows.map((section: any) => ({
    ...section,
    fields: fields.filter((f: any) => f.sectionId === section.id).map((f: any) => ({
      ...f,
      value: values[f.internalName] ?? null,
    })),
  }));

  const unsectionedFields = fields.filter(f => !f.sectionId).map(f => ({
    ...f,
    value: values[f.internalName] ?? null,
  }));

  return c.json({
    id: record.id,
    values,
    sections: sectionsData,
    unsectionedFields,
    related: relatedData,
    relationshipDefIds: relDefMap,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
});

// ─── Create ───

teachers.post('/create/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'teacher');
  if (!entityTypeId) return c.json({ error: 'Teacher entity type not found' }, 404);

  const body = await c.req.json();
  const id = crypto.randomUUID();
  await db.insert(entityRecords).values({ id, schoolId, entityTypeId });

  const fields = await getFieldDefs(entityTypeId);
  if (body.values && Object.keys(body.values).length > 0) {
    await upsertFieldValues(id, schoolId, fields, body.values);
  }

  return c.json({ id, success: true }, 201);
});

// ─── Update ───

teachers.put('/update/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const body = await c.req.json();

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.id, recordId), eq(entityRecords.schoolId, schoolId)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);
  await upsertFieldValues(recordId, schoolId, fields, body.values || {}, body.partial);

  return c.json({ success: true });
});

// ─── Soft Delete ───

teachers.delete('/delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  await db.update(entityRecords).set({ isDeleted: true }).where(
    and(eq(entityRecords.id, recordId), eq(entityRecords.schoolId, schoolId)),
  );
  return c.json({ success: true });
});

// ─── Permanent Delete ───

teachers.delete('/permanent-delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  // Delete relationship records first
  await db.delete(relationshipRecords).where(
    and(
      eq(relationshipRecords.schoolId, schoolId),
      or(
        eq(relationshipRecords.fromEntityRecordId, recordId),
        eq(relationshipRecords.toEntityRecordId, recordId),
      ),
    ),
  );

  await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));
  await db.delete(entityRecords).where(eq(entityRecords.id, recordId));

  return c.json({ success: true });
});

// ─── Bulk Delete ───

teachers.post('/bulk-delete/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { recordIds } = await c.req.json();
  if (!Array.isArray(recordIds) || recordIds.length === 0) return c.json({ error: 'No records' }, 400);

  for (const rid of recordIds) {
    await db.delete(relationshipRecords).where(
      and(
        eq(relationshipRecords.schoolId, schoolId),
        or(
          eq(relationshipRecords.fromEntityRecordId, rid),
          eq(relationshipRecords.toEntityRecordId, rid),
        ),
      ),
    );
    await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, rid));
    await db.delete(entityRecords).where(and(eq(entityRecords.id, rid), eq(entityRecords.schoolId, schoolId)));
  }
  return c.json({ success: true, deleted: recordIds.length });
});

// ─── Link ───

teachers.post('/link/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordId, relationshipDefinitionId } = await c.req.json();

  const result = await linkRecord({ schoolId, fromRecordId, toRecordId, relationshipDefinitionId });
  if ('error' in result) return c.json(result, 400);
  return c.json(result, 201);
});

// ─── Bulk Link ───

teachers.post('/link-bulk/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordIds, relationshipDefinitionId } = await c.req.json();

  if (!Array.isArray(toRecordIds) || toRecordIds.length === 0) {
    return c.json({ error: 'toRecordIds must be a non-empty array' }, 400);
  }

  const result = await linkRecordsBulk({ schoolId, fromRecordId, toRecordIds, relationshipDefinitionId });
  return c.json(result, 201);
});

// ─── Unlink ───

teachers.delete('/unlink/:schoolId/:linkId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const linkId = c.req.param('linkId');
  await unlinkRecord({ schoolId, linkId });
  return c.json({ success: true });
});

// ─── Related Records ───

teachers.get('/related/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const teacherTypeId = await getEntityTypeId(schoolId, 'teacher');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!teacherTypeId || !targetTypeId) return c.json({ records: [] });

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, teacherTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, teacherTypeId)),
      ), eq(rd.isActive, true)
    ),
  });
  if (!relDef) return c.json({ records: [], relationshipDefinitionId: null });

  const relRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) => a(
      eq(rr.relationshipDefinitionId, relDef.id),
      o(eq(rr.fromEntityRecordId, recordId), eq(rr.toEntityRecordId, recordId)),
    ),
  });

  const otherRecordIds = relRecords.map(rr =>
    rr.fromEntityRecordId === recordId ? rr.toEntityRecordId : rr.fromEntityRecordId
  );

  if (otherRecordIds.length === 0) return c.json({ records: [], relationshipDefinitionId: relDef.id });

  const targetFields = await getFieldDefs(targetTypeId);
  const allValuesMap = await batchGetFieldValues(otherRecordIds, targetFields);
  const records = otherRecordIds.map(id => ({
    id,
    values: allValuesMap.get(id) || {},
    linkId: relRecords.find(rr => rr.fromEntityRecordId === id || rr.toEntityRecordId === id)?.id,
  }));

  return c.json({ records, relationshipDefinitionId: relDef.id });
});

// ─── Available for linking (not yet linked) ───

teachers.get('/available/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const teacherTypeId = await getEntityTypeId(schoolId, 'teacher');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!teacherTypeId || !targetTypeId) return c.json({ records: [] });

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, teacherTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, teacherTypeId)),
      ), eq(rd.isActive, true)
    ),
  });
  if (!relDef) return c.json({ records: [] });

  // Get currently linked record IDs
  const linked = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) => a(
      eq(rr.relationshipDefinitionId, relDef.id),
      o(eq(rr.fromEntityRecordId, recordId), eq(rr.toEntityRecordId, recordId)),
    ),
  });
  const linkedIds = new Set(linked.map(rr =>
    rr.fromEntityRecordId === recordId ? rr.toEntityRecordId : rr.fromEntityRecordId
  ));

  // Get all target records
  const allRecords = await db.query.entityRecords.findMany({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.entityTypeId, targetTypeId), eq(entityRecords.isDeleted, false)),
  });

  const targetFields = await getFieldDefs(targetTypeId);
  const available = allRecords
    .filter(r => !linkedIds.has(r.id))
    .map(r => ({ id: r.id, values: {} as Record<string, any> }));

  // Batch fetch values
  if (available.length > 0) {
    const allIds = available.map(r => r.id);
    const allVals = await db.query.fieldValues.findMany({
      where: (fv, { and: a, inArray: i }) => a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, allIds)),
    });
    const fMap = new Map(targetFields.map(f => [f.id, f]));
    const vMap = new Map<string, Record<string, any>>();
    for (const v of allVals) {
      if (!vMap.has(v.entityRecordId)) vMap.set(v.entityRecordId, {});
      const field = fMap.get(v.fieldDefinitionId);
      if (field) {
        if (field.dataType === 'file' && v.fileValue) {
          vMap.get(v.entityRecordId)![field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
        } else {
          vMap.get(v.entityRecordId)![field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
        }
      }
    }
    for (const r of available) r.values = vMap.get(r.id) || {};
  }

  return c.json({ records: available });
});

// ─── Fields CRUD ───

teachers.get('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'teacher');
  if (!entityTypeId) return c.json({ fields: [] });
  const fields = await getFieldDefs(entityTypeId);

  // Include relationship definitions as virtual fields
  const { getRelationshipFields } = await import('../../../shared/src/blocks/relationship-fields');
  const relFields = await getRelationshipFields(schoolId, entityTypeId);

  return c.json({ fields: [...fields, ...relFields] });
});

teachers.post('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { name, dataType, options, isRequired, unit, maxLength, min, max, color, fileSubtype } = body;

  if (!name || !dataType) return c.json({ error: 'name and dataType required' }, 400);

  const entityTypeId = await getEntityTypeId(schoolId, 'teacher');
  if (!entityTypeId) return c.json({ error: 'Entity type not found' }, 404);

  const internalName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const existing = await db.query.fieldDefinitions.findFirst({
    where: (fd, { and: a, eq: e }) =>
      a(a(e(fd.schoolId, schoolId), e(fd.entityTypeId, entityTypeId)), e(fd.internalName, internalName)),
  });
  if (existing) return c.json({ error: 'A field with this name already exists' }, 400);

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

teachers.put('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');
  const body = await c.req.json();

  await db.update(fieldDefinitions).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.dataType !== undefined && { dataType: body.dataType }),
    ...(body.options !== undefined && { options: body.options }),
    ...(body.sectionId !== undefined && { sectionId: body.sectionId }),
    ...(body.isRequired !== undefined && { isRequired: body.isRequired }),
    ...(body.validationRules !== undefined && { validationRules: body.validationRules }),
  }).where(and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.schoolId, schoolId)));

  invalidateFieldCache();
  return c.json({ success: true });
});

teachers.delete('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');

  const field = await db.query.fieldDefinitions.findFirst({
    where: (fd, { and: a, eq: e }) => a(a(e(fd.schoolId, schoolId), e(fd.id, fieldId))),
  });
  if (!field) return c.json({ error: 'Field not found' }, 404);

  // Delete field values for this field
  await db.delete(fieldValues).where(eq(fieldValues.fieldDefinitionId, fieldId));
  // Delete the field definition
  await db.delete(fieldDefinitions).where(and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.schoolId, schoolId)));

  invalidateFieldCache(field.entityTypeId);
  return c.json({ success: true });
});

// ─── Stats ───

teachers.get('/stats/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'teacher');
  if (!entityTypeId) return c.json({ total: 0 });

  const records = await db.query.entityRecords.findMany({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.entityTypeId, entityTypeId), eq(entityRecords.isDeleted, false)),
  });

  const fields = await getFieldDefs(entityTypeId);
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, records.map(r => r.id))),
  });

  // Build value map
  const valueMap = new Map<string, Record<string, any>>();
  for (const v of allValues) {
    if (!valueMap.has(v.entityRecordId)) valueMap.set(v.entityRecordId, {});
    const field = fieldMap.get(v.fieldDefinitionId);
    if (field) {
      if (field.dataType === 'file' && v.fileValue) {
        valueMap.get(v.entityRecordId)![field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        valueMap.get(v.entityRecordId)![field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
      }
    }
  }

  // Department breakdown
  const byDepartment: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let withSubjects = 0;
  let withoutSubjects = 0;
  let totalSubjects = 0;

  for (const r of records) {
    const vals = valueMap.get(r.id) || {};
    const dept = vals.department || 'Unknown';
    const status = vals.status || 'Unknown';
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;

    const subCount = await getRelationshipCount(r.id, schoolId, 'subject');
    totalSubjects += subCount;
    if (subCount > 0) withSubjects++;
    else withoutSubjects++;
  }

  return c.json({
    total: records.length,
    byDepartment,
    byStatus,
    withSubjects,
    withoutSubjects,
    avgSubjectsPerTeacher: records.length > 0 ? Math.round((totalSubjects / records.length) * 10) / 10 : 0,
  });
});

// ─── Version (cache staleness) ───

teachers.get('/version/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const versions = await db.execute(sql`
    SELECT et.internal_name, COUNT(er.id) as cnt, MAX(er.updated_at) as last_updated
    FROM entity_records er
    JOIN entity_types et ON er.entity_type_id = et.id
    WHERE er.school_id = ${schoolId} AND er.is_deleted = false
    GROUP BY et.internal_name
  `);
  const map: Record<string, { count: number; lastUpdatedAt: string }> = {};
  for (const row of versions.rows as any[]) {
    map[row.internal_name] = { count: Number(row.cnt), lastUpdatedAt: row.last_updated };
  }
  return c.json({ versions: map });
});

// ─── Widget Config (server-first) ───

teachers.get('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  return c.json({ widgets: (school?.settings as any)?.teacherWidgets || null });
});

teachers.put('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { widgets } = await c.req.json();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const settings = (school?.settings as any) || {};
  await db.update(schools).set({ settings: { ...settings, teacherWidgets: widgets } }).where(eq(schools.id, schoolId));
  return c.json({ success: true });
});

// ─── Import ───

teachers.post('/import/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { rows, columnMapping, dryRun } = body;

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: 'No rows provided' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'teacher');
  if (!entityTypeId) return c.json({ error: 'Teacher entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);
  const fieldMap = new Map(fields.map(f => [f.internalName, f]));

  const reverseMap: Record<string, string> = {};
  for (const [csvHeader, fieldName] of Object.entries(columnMapping || {})) {
    if (fieldName && fieldMap.has(fieldName as string)) {
      reverseMap[fieldName as string] = csvHeader;
    }
  }

  const identifierField = fields.find(f => f.isIdentifier);
  let existingIdentifiers: Set<string> = new Set();
  if (identifierField) {
    const existingVals = await db.query.fieldValues.findMany({
      where: (fv, { and: a, eq: e }) =>
        a(e(fv.fieldDefinitionId, identifierField.id), e(fv.schoolId, schoolId)),
    });
    existingIdentifiers = new Set(existingVals.map(v => v.textValue || '').filter(Boolean));
  }

  const preview: any[] = [];
  let newCount = 0;
  let updateCount = 0;
  let skipCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values: Record<string, any> = {};
    const rowErrors: string[] = [];

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
          values[fieldName] = rawVal;
          break;
        case 'boolean':
          values[fieldName] = ['true', 'yes', '1', 'on'].includes(String(rawVal).toLowerCase());
          break;
        default:
          values[fieldName] = String(rawVal);
      }
    }

    for (const rf of fields.filter(f => f.isRequired)) {
      if (!values[rf.internalName]) {
        rowErrors.push(`${rf.name} is required`);
      }
    }

    let status = 'new';
    if (identifierField && values[identifierField.internalName]) {
      const idVal = String(values[identifierField.internalName]);
      if (existingIdentifiers.has(idVal)) {
        status = 'update';
        updateCount++;
      } else {
        newCount++;
        existingIdentifiers.add(idVal);
      }
    } else {
      newCount++;
    }

    if (rowErrors.length > 0) {
      status = 'error';
      skipCount++;
      errors.push(`Row ${i + 1}: ${rowErrors.join('; ')}`);
    }

    preview.push({ row: i + 1, status, values, errors: rowErrors });
  }

  if (dryRun) {
    return c.json({
      preview,
      summary: { total: rows.length, new: newCount, update: updateCount, errors: skipCount },
      errorMessages: errors.slice(0, 10),
    });
  }

  let imported = 0;
  let failed = 0;
  const importErrors: string[] = [];

  for (const item of preview) {
    if (item.status === 'error') { failed++; continue; }

    try {
      if (item.status === 'update' && identifierField) {
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
    summary: { total: rows.length, imported, failed },
    errors: importErrors.slice(0, 10),
  });
});

export default teachers;

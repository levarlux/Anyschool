// Subjects Pillar — Doc 18
// Full CRUD, relationships, stats, widget config, import

import { Hono } from 'hono';
import { db } from '../db';
import { r2Configured, dataUrlToR2 } from '../lib/r2';
import {
  entityTypes, fieldDefinitions, entityRecords, fieldValues,
  relationshipDefinitions, relationshipRecords, schools, sections,
} from '../../../drizzle/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';

const subjects = new Hono();

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

async function upsertFieldValues(recordId: string, schoolId: string, fields: any[], values: Record<string, any>, partial?: boolean) {
  const fieldMap = new Map(fields.map(f => [f.internalName, f]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const field = fieldMap.get(key);
    if (!field) continue;

    const existing = await db.query.fieldValues.findFirst({
      where: and(eq(fieldValues.entityRecordId, recordId), eq(fieldValues.fieldDefinitionId, field.id)),
    });

    if (field.dataType === 'file') {
      let finalValue = value;
      if (r2Configured && typeof value === 'string' && value.startsWith('data:')) {
        const uploadResult = await dataUrlToR2(value, `${schoolId}/${recordId}/${field.id}`);
        if (uploadResult) finalValue = { url: uploadResult.url, fileName: 'upload', mimeType: uploadResult.mimeType, size: uploadResult.size };
      }
      if (existing) {
        await db.update(fieldValues).set({ fileValue: finalValue }).where(eq(fieldValues.id, existing.id));
      } else {
        await db.insert(fieldValues).values({ entityRecordId: recordId, fieldDefinitionId: field.id, schoolId, fileValue: finalValue });
      }
    } else if (field.dataType === 'date' && typeof value === 'string' && value.includes('T') && value.includes(':')) {
      // Time stored separately: date goes to dateValue, time goes to textValue
      const datePart = value.split('T')[0];
      if (existing) {
        await db.update(fieldValues).set({ dateValue: datePart, textValue: value }).where(eq(fieldValues.id, existing.id));
      } else {
        await db.insert(fieldValues).values({ entityRecordId: recordId, fieldDefinitionId: field.id, schoolId, dateValue: datePart, textValue: value });
      }
    } else {
      const updateData: any = {};
      if (field.dataType === 'numeric') updateData.numericValue = Number(value);
      else if (field.dataType === 'boolean') updateData.booleanValue = Boolean(value);
      else if (field.dataType === 'date') updateData.dateValue = value;
      else updateData.textValue = String(value);

      if (existing) {
        await db.update(fieldValues).set(updateData).where(eq(fieldValues.id, existing.id));
      } else {
        await db.insert(fieldValues).values({ entityRecordId: recordId, fieldDefinitionId: field.id, schoolId, ...updateData });
      }
    }
  }
}

async function getRelationshipCount(recordId: string, schoolId: string, targetEntityName: string): Promise<number> {
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!subjectTypeId || !targetTypeId) return 0;

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, subjectTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, subjectTypeId)),
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

subjects.get('/list/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'subject');
  if (!entityTypeId) return c.json({ error: 'Subject entity type not found' }, 404);

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

  const { resolveAllRelationshipData } = await import('../../../shared/src/blocks/relationship-fields');
  const { relFields, relCounts, relValues } = await resolveAllRelationshipData(
    schoolId, recordIds, entityTypeId, ['teacher', 'learner', 'class'],
  );

  const result = records.map(r => {
    const vals = valueMap.get(r.id) || {};
    const counts = relCounts.get(r.id) || {};
    const relVals = relValues.get(r.id) || {};
    const teachersNamesKey = relFields.find(f => f._targetEntityName === 'teacher');
    const learnersNamesKey = relFields.find(f => f._targetEntityName === 'learner');
    const classesNamesKey = relFields.find(f => f._targetEntityName === 'class');
    return {
      id: r.id,
      values: {
        ...vals,
        __teachers_count: counts.teacher || 0,
        __learners_count: counts.learner || 0,
        __classes_count: counts.class || 0,
        ...(teachersNamesKey ? { __teachers_names: relVals[`${teachersNamesKey.internalName}_names`] || [] } : {}),
        ...(learnersNamesKey ? { __learners_names: relVals[`${learnersNamesKey.internalName}_names`] || [] } : {}),
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

  const allFields = [...fields, ...relFields];

  return c.json({ records: result, fields: allFields, sections: sectionList });
});

// ─── Record Detail ───

subjects.get('/record/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.id, recordId), eq(entityRecords.schoolId, schoolId)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);
  const values = await getFieldValues(recordId, fields);

  const relatedTypes = await db.query.relationshipDefinitions.findMany({
    where: (rd, { or: o, and: a }) => o(
      a(eq(rd.fromEntityTypeId, record.entityTypeId), eq(rd.isActive, true)),
      a(eq(rd.toEntityTypeId, record.entityTypeId), eq(rd.isActive, true)),
    ),
  });

  const relatedData: Record<string, any[]> = {};
  const relDefMap: Record<string, string> = {};

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

  const allOtherIds = relTargets.flatMap(t => t.otherRecordIds);
  if (allOtherIds.length > 0) {
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

subjects.post('/create/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'subject');
  if (!entityTypeId) return c.json({ error: 'Subject entity type not found' }, 404);

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

subjects.put('/update/:schoolId/:recordId', async (c) => {
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

subjects.delete('/delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  await db.update(entityRecords).set({ isDeleted: true }).where(
    and(eq(entityRecords.id, recordId), eq(entityRecords.schoolId, schoolId)),
  );
  return c.json({ success: true });
});

// ─── Permanent Delete ───

subjects.delete('/permanent-delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

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

subjects.post('/bulk-delete/:schoolId', async (c) => {
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

// ─── Fields CRUD ───

subjects.get('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'subject');
  if (!entityTypeId) return c.json({ fields: [] });
  const fields = await getFieldDefs(entityTypeId);

  const { getRelationshipFields } = await import('../../../shared/src/blocks/relationship-fields');
  const relFields = await getRelationshipFields(schoolId, entityTypeId);

  return c.json({ fields: [...fields, ...relFields] });
});

subjects.post('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { name, dataType, options, isRequired, unit, maxLength, min, max, color, fileSubtype } = body;

  if (!name || !dataType) return c.json({ error: 'name and dataType required' }, 400);

  const entityTypeId = await getEntityTypeId(schoolId, 'subject');
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
      ...(color ? { color } : {}),
      ...(fileSubtype ? { fileSubtype } : {}),
    },
  }).returning();

  invalidateFieldCache(entityTypeId);
  return c.json(field, 201);
});

subjects.put('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');
  const body = await c.req.json();

  await db.update(fieldDefinitions).set({
    name: body.name,
    displayName: body.displayName,
    displayOrder: body.displayOrder,
    isRequired: body.isRequired,
    validationRules: body.validationRules,
    options: body.options,
    unit: body.unit,
  }).where(and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.schoolId, schoolId)));

  invalidateFieldCache();
  return c.json({ success: true });
});

subjects.delete('/fields/:schoolId/:fieldId', async (c) => {
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

subjects.get('/stats/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'subject');
  if (!entityTypeId) return c.json({ total: 0 });

  const records = await db.query.entityRecords.findMany({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.entityTypeId, entityTypeId), eq(entityRecords.isDeleted, false)),
  });

  const fields = await getFieldDefs(entityTypeId);
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, records.map(r => r.id))),
  });

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

  const byCategory: Record<string, number> = {};
  let withTeachers = 0;
  let withoutTeachers = 0;
  let totalLearners = 0;

  for (const r of records) {
    const vals = valueMap.get(r.id) || {};
    const cat = vals.category || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    const teacherCount = await getRelationshipCount(r.id, schoolId, 'teacher');
    if (teacherCount > 0) withTeachers++;
    else withoutTeachers++;

    const learnerCount = await getRelationshipCount(r.id, schoolId, 'learner');
    totalLearners += learnerCount;
  }

  return c.json({
    total: records.length,
    byCategory,
    withTeachers,
    withoutTeachers,
    avgLearnersPerSubject: records.length > 0 ? Math.round((totalLearners / records.length) * 10) / 10 : 0,
  });
});

// ─── Version (cache staleness) ───

subjects.get('/version/:schoolId', async (c) => {
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

subjects.get('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  return c.json({ widgets: (school?.settings as any)?.subjectWidgets || null });
});

subjects.put('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { widgets } = await c.req.json();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const settings = (school?.settings as any) || {};
  settings.subjectWidgets = widgets;
  await db.update(schools).set({ settings }).where(eq(schools.id, schoolId));
  return c.json({ success: true });
});

// ─── Link ───

subjects.post('/link/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordId, relationshipDefinitionId } = await c.req.json();

  const existing = await db.query.relationshipRecords.findFirst({
    where: (rr, { and: a, or: o }) => a(
      eq(rr.relationshipDefinitionId, relationshipDefinitionId),
      o(
        a(eq(rr.fromEntityRecordId, fromRecordId), eq(rr.toEntityRecordId, toRecordId)),
        a(eq(rr.fromEntityRecordId, toRecordId), eq(rr.toEntityRecordId, fromRecordId)),
      ),
    ),
  });
  if (existing) return c.json({ error: 'Link already exists' }, 400);

  const [link] = await db.insert(relationshipRecords).values({
    schoolId, relationshipDefinitionId, fromEntityRecordId: fromRecordId, toEntityRecordId: toRecordId,
  }).returning();

  return c.json({ id: link.id, success: true }, 201);
});

// ─── Bulk Link ───

subjects.post('/link-bulk/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordIds, relationshipDefinitionId } = await c.req.json() as {
    fromRecordId: string;
    toRecordIds: string[];
    relationshipDefinitionId: string;
  };

  if (!Array.isArray(toRecordIds) || toRecordIds.length === 0) {
    return c.json({ error: 'toRecordIds must be a non-empty array' }, 400);
  }

  // Check existing links in bulk
  const existingLinks = await db.query.relationshipRecords.findMany({
    where: (rr, { and: a, or: o, inArray: i }) => a(
      eq(rr.relationshipDefinitionId, relationshipDefinitionId),
      i(rr.fromEntityRecordId, [fromRecordId, ...toRecordIds]),
    ),
  });

  const existingPairs = new Set(
    existingLinks.map(rr =>
      [rr.fromEntityRecordId, rr.toEntityRecordId].sort().join(':')
    )
  );

  const newIds = toRecordIds.filter(id =>
    !existingPairs.has([fromRecordId, id].sort().join(':'))
  );

  if (newIds.length === 0) {
    return c.json({ linked: 0, skipped: toRecordIds.length });
  }

  // Insert all new links
  const inserted = await db.insert(relationshipRecords).values(
    newIds.map(toRecordId => ({
      schoolId,
      relationshipDefinitionId,
      fromEntityRecordId: fromRecordId,
      toEntityRecordId: toRecordId,
    }))
  ).returning();

  return c.json({
    linked: inserted.length,
    skipped: toRecordIds.length - inserted.length,
    ids: inserted.map(r => r.id),
  }, 201);
});

// ─── Class Learners (for "Add Entire Class") ───

subjects.get('/class-learners/:schoolId/:classId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const classId = c.req.param('classId');

  const classTypeId = await getEntityTypeId(schoolId, 'class');
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!classTypeId || !learnerTypeId) return c.json({ learners: [] });

  // Find the class-learner relationship definition
  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, classTypeId), eq(rd.toEntityTypeId, learnerTypeId)),
        a(eq(rd.fromEntityTypeId, learnerTypeId), eq(rd.toEntityTypeId, classTypeId)),
      ), eq(rd.isActive, true)
    ),
  });
  if (!relDef) return c.json({ learners: [] });

  // Get all learner record IDs linked to this class
  const relRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) => a(
      eq(rr.relationshipDefinitionId, relDef.id),
      o(eq(rr.fromEntityRecordId, classId), eq(rr.toEntityRecordId, classId)),
    ),
  });

  const learnerIds = relRecords.map(rr =>
    rr.fromEntityRecordId === classId ? rr.toEntityRecordId : rr.fromEntityRecordId
  );

  if (learnerIds.length === 0) return c.json({ learners: [] });

  // Get learner names
  const learnerFields = await getFieldDefs(learnerTypeId);
  const allVals = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, learnerIds)),
  });
  const fMap = new Map(learnerFields.map(f => [f.id, f]));
  const vMap = new Map<string, Record<string, any>>();
  for (const v of allVals) {
    if (!vMap.has(v.entityRecordId)) vMap.set(v.entityRecordId, {});
    const field = fMap.get(v.fieldDefinitionId);
    if (field) vMap.get(v.entityRecordId)![field.internalName] = v.textValue ?? v.numberValue ?? v.dateValue ?? v.booleanValue ?? '';
  }

  const learners = learnerIds.map(id => {
    const vals = vMap.get(id) || {};
    const name = vals.first_name ? `${vals.first_name} ${vals.last_name || ''}`.trim() : vals.name || id.slice(0, 8);
    return { id, name, values: vals };
  });

  return c.json({ learners });
});

// ─── Unlink ───

subjects.delete('/unlink/:schoolId/:linkId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const linkId = c.req.param('linkId');

  await db.delete(relationshipRecords).where(
    and(eq(relationshipRecords.schoolId, schoolId), eq(relationshipRecords.id, linkId)),
  );
  return c.json({ success: true });
});

// ─── Related Records ───

subjects.get('/related/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!subjectTypeId || !targetTypeId) return c.json({ records: [] });

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, subjectTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, subjectTypeId)),
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

// ─── Available for linking ───

subjects.get('/available/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!subjectTypeId || !targetTypeId) return c.json({ records: [] });

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, subjectTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, subjectTypeId)),
      ), eq(rd.isActive, true)
    ),
  });
  if (!relDef) return c.json({ records: [] });

  const linked = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) => a(
      eq(rr.relationshipDefinitionId, relDef.id),
      o(eq(rr.fromEntityRecordId, recordId), eq(rr.toEntityRecordId, recordId)),
    ),
  });
  const linkedIds = new Set(linked.map(rr =>
    rr.fromEntityRecordId === recordId ? rr.toEntityRecordId : rr.fromEntityRecordId
  ));

  const allRecords = await db.query.entityRecords.findMany({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.entityTypeId, targetTypeId), eq(entityRecords.isDeleted, false)),
  });

  const targetFields = await getFieldDefs(targetTypeId);
  const available = allRecords
    .filter(r => !linkedIds.has(r.id))
    .map(r => ({ id: r.id, values: {} as Record<string, any> }));

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

// ─── Import ───

subjects.post('/import/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'subject');
  if (!entityTypeId) return c.json({ error: 'Subject entity type not found' }, 404);

  const body = await c.req.json();
  const { records: importRecords } = body;

  if (!importRecords || !Array.isArray(importRecords)) {
    return c.json({ error: 'Invalid import data' }, 400);
  }

  const fields = await getFieldDefs(entityTypeId);
  let created = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const rec of importRecords) {
    try {
      const id = crypto.randomUUID();
      await db.insert(entityRecords).values({ id, schoolId, entityTypeId });
      if (rec && Object.keys(rec).length > 0) {
        await upsertFieldValues(id, schoolId, fields, rec);
      }
      created++;
    } catch (err: any) {
      errors++;
      errorDetails.push(err.message || 'Unknown error');
    }
  }

  return c.json({ created, errors, errorDetails: errorDetails.slice(0, 10) });
});

export default subjects;

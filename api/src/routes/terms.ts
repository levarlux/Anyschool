// Terms Pillar — Doc 19
// CRUD, hierarchy (self-nesting via parentRecordId), relationships, stats, fields

import { Hono } from 'hono';
import { db } from '../db';
import { r2Configured, dataUrlToR2 } from '../lib/r2';
import { linkRecord, unlinkRecord, linkRecordsBulk } from '../../../shared/src/blocks/relationship-operations';
import {
  entityTypes, fieldDefinitions, entityRecords, fieldValues,
  relationshipDefinitions, relationshipRecords, schools, sections,
} from '../../../drizzle/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';

const terms = new Hono();

// ─── Helpers ────────────────────────────────────────────────────

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

async function getEntityTypeId(schoolId: string, internalName: string) {
  const type = await db.query.entityTypes.findFirst({
    where: and(eq(entityTypes.schoolId, schoolId), eq(entityTypes.internalName, internalName)),
  });
  return type?.id ?? null;
}

const fieldDefCache = new Map<string, { fields: any[]; at: number }>();
const FIELD_CACHE_TTL = 60_000;

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

export function invalidateTermFieldCache(entityTypeId?: string) {
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
      const val = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
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
  if (!partial) {
    await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));
  }

  const fieldMap = new Map(fields.map(f => [f.internalName, f]));

  // Auto-create 'photo' field if needed
  if (values.photo && !fieldMap.has('photo')) {
    const entityTypeId = fields[0]?.entityTypeId;
    if (entityTypeId) {
      const [photoField] = await db.insert(fieldDefinitions).values({
        schoolId, entityTypeId, name: 'Photo', internalName: 'photo',
        dataType: 'file', isRequired: false, displayOrder: 999,
        validationRules: { fileSubtype: 'image' },
      }).returning();
      fieldMap.set('photo', photoField);
      fields.push(photoField);
    }
  }

  if (partial) {
    const updatingFieldIds = Object.keys(values)
      .map(k => fieldMap.get(k)?.id)
      .filter(Boolean);
    if (updatingFieldIds.length > 0) {
      await db.delete(fieldValues).where(
        and(eq(fieldValues.entityRecordId, recordId), sql`${fieldValues.fieldDefinitionId} IN ${updatingFieldIds}`),
      );
    }
  }

  const inserts: any[] = [];
  for (const [key, val] of Object.entries(values)) {
    const field = fieldMap.get(key);
    if (!field || val === undefined || val === null || val === '') continue;

    const row: any = { schoolId, entityRecordId: recordId, fieldDefinitionId: field.id };

    switch (field.dataType) {
      case 'number': row.numericValue = Number(val); break;
      case 'date': row.dateValue = String(val); break;
      case 'time': row.textValue = String(val); break;
      case 'boolean': row.booleanValue = Boolean(val); break;
      case 'file':
        if (typeof val === 'string' && val.startsWith('data:')) {
          const err = validateDataUrl(val);
          if (err) { console.warn(`[terms] Rejected file for "${field.internalName}": ${err}`); break; }
          if (r2Configured()) {
            try {
              const uploaded = await dataUrlToR2(val, schoolId, 'uploads', field.internalName === 'photo' ? 'photo.jpg' : undefined);
              row.fileValue = uploaded;
            } catch (err: any) { console.warn(`[terms] R2 upload failed for "${field.internalName}": ${err.message}`); row.textValue = val; }
          } else { row.textValue = val; }
        } else if (typeof val === 'object' && val !== null) {
          row.fileValue = val;
        } else {
          row.textValue = String(val);
        }
        break;
      default: row.textValue = String(val); break;
    }
    inserts.push(row);
  }

  if (inserts.length > 0) {
    // Batch in chunks of 50
    for (let i = 0; i < inserts.length; i += 50) {
      await db.insert(fieldValues).values(inserts.slice(i, i + 50));
    }
  }
}

async function batchGetFieldValues(recordIds: string[], fields: any[]): Promise<Map<string, Record<string, any>>> {
  const map = new Map<string, Record<string, any>>();
  for (const id of recordIds) map.set(id, {});
  if (fields.length === 0 || recordIds.length === 0) return map;

  const fieldMap = new Map(fields.map(f => [f.id, f]));
  const values = await db.query.fieldValues.findMany({
    where: (fv, { inArray: i }) => i(fv.entityRecordId, recordIds),
  });

  for (const v of values) {
    const recMap = map.get(v.entityRecordId);
    if (!recMap) continue;
    const field = fieldMap.get(v.fieldDefinitionId);
    if (field) {
      if (field.dataType === 'file' && v.fileValue) {
        recMap[field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        recMap[field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
      }
    }
  }
  return map;
}

// ─── List all term records with field values, hierarchy, relationships ───

terms.get('/list/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'term');
  if (!entityTypeId) return c.json({ records: [], fields: [], sections: [] });

  const fields = await getFieldDefs(entityTypeId);
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    orderBy: (er, { asc }) => [asc(er.createdAt)],
    limit: 500,
  });

  if (records.length === 0) return c.json({ records: [], fields, sections: [] });

  const recordIds = records.map(r => r.id);

  // Batch fetch field values
  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) =>
      a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, recordIds)),
  });

  const valueMap = new Map<string, Record<string, any>>();
  for (const id of recordIds) valueMap.set(id, {});
  for (const v of allValues) {
    const recMap = valueMap.get(v.entityRecordId);
    if (!recMap) continue;
    const field = fieldMap.get(v.fieldDefinitionId);
    if (field) {
      if (field.dataType === 'file' && v.fileValue) {
        recMap[field.internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        recMap[field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
      }
    }
  }

  // Child counts for hierarchy
  const childCounts = await db.query.entityRecords.findMany({
    where: (er, { and: a, eq: e, inArray: i }) => a(
      e(er.schoolId, schoolId),
      e(er.entityTypeId, entityTypeId),
      e(er.isDeleted, false),
      i(er.parentRecordId, recordIds),
    ),
    columns: { parentRecordId: true },
  });

  const childCountMap = new Map<string, number>();
  for (const child of childCounts) {
    if (child.parentRecordId) {
      childCountMap.set(child.parentRecordId, (childCountMap.get(child.parentRecordId) || 0) + 1);
    }
  }

  // Relationship data
  const { resolveAllRelationshipData } = await import('../../../shared/src/blocks/relationship-fields');
  const { relFields, relValues } = await resolveAllRelationshipData(schoolId, recordIds, entityTypeId);

  // Sections
  const sectionRecords = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  const result = records.map(r => ({
    id: r.id,
    values: {
      ...(valueMap.get(r.id) || {}),
      __child_count: childCountMap.get(r.id) || 0,
      ...(relValues.get(r.id) || {}),
    },
    parentRecordId: r.parentRecordId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return c.json({ records: result, fields, sections: sectionRecords });
});

// ─── Get single term record ───

terms.get('/record/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId), eq(entityRecords.isDeleted, false)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);
  const values = await getFieldValues(recordId, fields);

  // Fetch parent info if has parentRecordId
  let parent = null;
  if (record.parentRecordId) {
    const parentRecord = await db.query.entityRecords.findFirst({
      where: eq(entityRecords.id, record.parentRecordId),
    });
    if (parentRecord) {
      const parentFields = await getFieldDefs(parentRecord.entityTypeId);
      const parentValues = await getFieldValues(parentRecord.id, parentFields);
      parent = { id: parentRecord.id, values: parentValues };
    }
  }

  // Fetch children
  const children = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, record.entityTypeId),
      eq(entityRecords.isDeleted, false),
      eq(entityRecords.parentRecordId, recordId),
    ),
  });
  const childIds = children.map(ch => ch.id);
  const childValues = childIds.length > 0 ? await batchGetFieldValues(childIds, fields) : new Map();
  const childList = children.map(ch => ({
    id: ch.id,
    values: childValues.get(ch.id) || {},
  }));

  // Sections
  const sectionRecords = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, record.entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  return c.json({
    id: record.id,
    values,
    parentRecordId: record.parentRecordId,
    parent,
    children: childList,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fields,
    sections: sectionRecords,
  });
});

// ─── Create term record ───

terms.post('/create/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { values } = body;

  const entityTypeId = await getEntityTypeId(schoolId, 'term');
  if (!entityTypeId) return c.json({ error: 'Term entity type not found' }, 404);

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

  const [record] = await db.insert(entityRecords).values({
    schoolId,
    entityTypeId,
    parentRecordId: body.parentRecordId || null,
    isDeleted: false,
  }).returning();

  await upsertFieldValues(record.id, schoolId, fields, values || {});

  return c.json({ id: record.id, success: true }, 201);
});

// ─── Update term record ───

terms.put('/update/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const body = await c.req.json();
  const { values, parentRecordId } = body;

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId), eq(entityRecords.isDeleted, false)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);

  // Update parent if provided
  if (parentRecordId !== undefined) {
    // Prevent circular reference
    if (parentRecordId === recordId) {
      return c.json({ error: 'A term cannot be its own parent' }, 400);
    }
    // Check for indirect circular reference
    if (parentRecordId) {
      let currentParentId = parentRecordId;
      const visited = new Set([recordId]);
      while (currentParentId) {
        if (visited.has(currentParentId)) {
          return c.json({ error: 'Circular reference detected in hierarchy' }, 400);
        }
        visited.add(currentParentId);
        const parentRec = await db.query.entityRecords.findFirst({
          where: eq(entityRecords.id, currentParentId),
          columns: { parentRecordId: true },
        });
        currentParentId = parentRec?.parentRecordId || null;
      }
    }
    await db.update(entityRecords).set({ parentRecordId: parentRecordId || null }).where(eq(entityRecords.id, recordId));
  }

  if (values) {
    await upsertFieldValues(recordId, schoolId, fields, values, true);
  }

  return c.json({ success: true });
});

// ─── Delete term (soft) ───

terms.delete('/delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId), eq(entityRecords.isDeleted, false)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  // Unparent any children
  await db.update(entityRecords)
    .set({ parentRecordId: null })
    .where(and(eq(entityRecords.parentRecordId, recordId), eq(entityRecords.isDeleted, false)));

  await db.update(entityRecords).set({ isDeleted: true }).where(eq(entityRecords.id, recordId));
  return c.json({ success: true });
});

// ─── Permanent delete ───

terms.delete('/permanent-delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  // Delete field values
  await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));

  // Delete relationship records
  await db.delete(relationshipRecords).where(
    or(eq(relationshipRecords.fromEntityRecordId, recordId), eq(relationshipRecords.toEntityRecordId, recordId)),
  );

  // Unparent children
  await db.update(entityRecords).set({ parentRecordId: null }).where(eq(entityRecords.parentRecordId, recordId));

  // Delete the record
  await db.delete(entityRecords).where(eq(entityRecords.id, recordId));
  return c.json({ success: true });
});

// ─── Bulk delete ───

terms.post('/bulk-delete/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { ids } = await c.req.json() as { ids: string[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids must be a non-empty array' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'term');
  if (!entityTypeId) return c.json({ error: 'Term entity type not found' }, 404);

  // Verify all records exist
  const records = await db.query.entityRecords.findMany({
    where: (er, { and: a, inArray: i }) => a(
      eq(er.schoolId, schoolId), eq(er.entityTypeId, entityTypeId), eq(er.isDeleted, false), i(er.id, ids),
    ),
  });

  if (records.length !== ids.length) {
    return c.json({ error: `Found ${records.length} of ${ids.length} records` }, 400);
  }

  // Delete relationship records first (foreign key constraint)
  await db.delete(relationshipRecords).where(
    or(
      inArray(relationshipRecords.fromEntityRecordId, ids),
      inArray(relationshipRecords.toEntityRecordId, ids),
    ),
  );

  // Delete field values
  await db.delete(fieldValues).where(inArray(fieldValues.entityRecordId, ids));

  // Unparent any children of deleted records
  await db.update(entityRecords).set({ parentRecordId: null }).where(
    inArray(entityRecords.parentRecordId, ids),
  );

  // Soft delete the records
  await db.update(entityRecords).set({ isDeleted: true }).where(inArray(entityRecords.id, ids));

  return c.json({ deleted: ids.length });
});

// ─── Fields ───

terms.get('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'term');
  if (!entityTypeId) return c.json({ fields: [], sections: [] });

  const fields = await getFieldDefs(entityTypeId);
  const sectionRecords = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  return c.json({ fields, sections: sectionRecords });
});

terms.post('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { name, dataType, options, isRequired, unit, maxLength, min, max, color, fileSubtype, sectionId } = body;

  if (!name || !dataType) return c.json({ error: 'name and dataType required' }, 400);

  const entityTypeId = await getEntityTypeId(schoolId, 'term');
  if (!entityTypeId) return c.json({ error: 'Term entity type not found' }, 404);

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
    sectionId: sectionId || null,
  }).returning();

  invalidateTermFieldCache(entityTypeId);
  return c.json(field, 201);
});

terms.put('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');
  const body = await c.req.json();

  const field = await db.query.fieldDefinitions.findFirst({
    where: and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.schoolId, schoolId)),
  });
  if (!field) return c.json({ error: 'Field not found' }, 404);

  const updates: any = {};
  if (body.name !== undefined) {
    updates.name = body.name;
    updates.internalName = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  if (body.dataType !== undefined) updates.dataType = body.dataType;
  if (body.isRequired !== undefined) updates.isRequired = body.isRequired;
  if (body.options !== undefined) updates.options = body.options;
  if (body.unit !== undefined) updates.unit = body.unit;
  if (body.fileSubtype !== undefined) {
    updates.validationRules = { ...(updates.validationRules || field.validationRules || {}), fileSubtype: body.fileSubtype };
  }
  if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;
  if (body.sectionId !== undefined) updates.sectionId = body.sectionId;
  if (body.validationRules !== undefined) updates.validationRules = body.validationRules;

  await db.update(fieldDefinitions).set(updates).where(eq(fieldDefinitions.id, fieldId));
  invalidateTermFieldCache(field.entityTypeId);
  return c.json({ success: true });
});

terms.delete('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');

  const field = await db.query.fieldDefinitions.findFirst({
    where: and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.schoolId, schoolId)),
  });
  if (!field) return c.json({ error: 'Field not found' }, 404);

  // Delete field values for this field
  await db.delete(fieldValues).where(eq(fieldValues.fieldDefinitionId, fieldId));
  // Delete the field definition
  await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));

  invalidateTermFieldCache(field.entityTypeId);
  return c.json({ success: true });
});

// ─── Link / Unlink / Bulk Link ───

terms.post('/link/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordId, relationshipDefinitionId } = await c.req.json();
  const result = await linkRecord({ schoolId, fromRecordId, toRecordId, relationshipDefinitionId });
  if ('error' in result) return c.json(result, 400);
  return c.json(result, 201);
});

terms.post('/link-bulk/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordIds, relationshipDefinitionId } = await c.req.json();
  if (!Array.isArray(toRecordIds) || toRecordIds.length === 0) {
    return c.json({ error: 'toRecordIds must be a non-empty array' }, 400);
  }
  const result = await linkRecordsBulk({ schoolId, fromRecordId, toRecordIds, relationshipDefinitionId });
  return c.json(result, 201);
});

terms.delete('/unlink/:schoolId/:linkId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const linkId = c.req.param('linkId');
  await unlinkRecord({ schoolId, linkId });
  return c.json({ success: true });
});

// ─── Related Records ───

terms.get('/related/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!termTypeId || !targetTypeId) return c.json({ records: [], relationshipDefinitionId: null });

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, termTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, termTypeId)),
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

terms.get('/available/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!termTypeId || !targetTypeId) return c.json({ records: [] });

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, termTypeId), eq(rd.toEntityTypeId, targetTypeId)),
        a(eq(rd.fromEntityTypeId, targetTypeId), eq(rd.toEntityTypeId, termTypeId)),
      ), eq(rd.isActive, true)
    ),
  });
  if (!relDef) return c.json({ records: [] });

  // Get IDs already linked
  const linked = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) => a(
      eq(rr.relationshipDefinitionId, relDef.id),
      o(eq(rr.fromEntityRecordId, recordId), eq(rr.toEntityRecordId, recordId)),
    ),
  });
  const linkedIds = new Set(linked.flatMap(rr => [rr.fromEntityRecordId, rr.toEntityRecordId]));

  // Get all target records not yet linked
  const allTarget = await db.query.entityRecords.findMany({
    where: (er, { and: a, eq: e, notInArray: ni }) => a(
      e(er.schoolId, schoolId), e(er.entityTypeId, targetTypeId), e(er.isDeleted, false),
    ),
    limit: 200,
  });

  const targetFields = await getFieldDefs(targetTypeId);
  const available = allTarget
    .filter(r => !linkedIds.has(r.id) && r.id !== recordId)
    .slice(0, 50);

  if (available.length === 0) return c.json({ records: [] });

  const allValuesMap = await batchGetFieldValues(available.map(r => r.id), targetFields);
  const records = available.map(r => ({
    id: r.id,
    values: allValuesMap.get(r.id) || {},
  }));

  return c.json({ records });
});

// ─── Stats ───

terms.get('/stats/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'term');
  if (!entityTypeId) return c.json({ total: 0, byStatus: {}, withChildren: 0, withoutChildren: 0 });

  const records = await db.query.entityRecords.findMany({
    where: (er, { and: a, eq: e }) => a(e(er.schoolId, schoolId), e(er.entityTypeId, entityTypeId), e(er.isDeleted, false)),
    limit: 500,
  });

  if (records.length === 0) return c.json({ total: 0, byStatus: {}, withChildren: 0, withoutChildren: 0 });

  const recordIds = records.map(r => r.id);
  const fields = await getFieldDefs(entityTypeId);
  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, recordIds)),
  });

  const fieldMap = new Map(fields.map(f => [f.id, f]));
  const valueMap = new Map<string, Record<string, any>>();
  for (const id of recordIds) valueMap.set(id, {});
  for (const v of allValues) {
    const recMap = valueMap.get(v.entityRecordId);
    if (!recMap) continue;
    const field = fieldMap.get(v.fieldDefinitionId);
    if (field) recMap[field.internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue ?? null;
  }

  // Child counts
  const childCounts = await db.query.entityRecords.findMany({
    where: (er, { and: a, eq: e, inArray: i }) => a(
      e(er.schoolId, schoolId), e(er.entityTypeId, entityTypeId), e(er.isDeleted, false), i(er.parentRecordId, recordIds),
    ),
    columns: { parentRecordId: true },
  });
  const childCountMap = new Map<string, number>();
  for (const child of childCounts) {
    if (child.parentRecordId) childCountMap.set(child.parentRecordId, (childCountMap.get(child.parentRecordId) || 0) + 1);
  }

  const byStatus: Record<string, number> = {};
  let withChildren = 0;
  let withoutChildren = 0;

  for (const r of records) {
    const vals = valueMap.get(r.id) || {};
    const status = vals.status || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    if ((childCountMap.get(r.id) || 0) > 0) withChildren++;
    else withoutChildren++;
  }

  return c.json({
    total: records.length,
    byStatus,
    withChildren,
    withoutChildren,
  });
});

// ─── Version ───

terms.get('/version/:schoolId', async (c) => {
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

// ─── Widget Config ───

terms.get('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  return c.json({ widgets: (school?.settings as any)?.termWidgets || null });
});

terms.put('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { widgets } = await c.req.json();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const settings = (school?.settings as any) || {};
  settings.termWidgets = widgets;
  await db.update(schools).set({ settings }).where(eq(schools.id, schoolId));
  return c.json({ success: true });
});

// ─── Import ───

terms.post('/import/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { records: importRecords } = body as { records: any[] };

  const entityTypeId = await getEntityTypeId(schoolId, 'term');
  if (!entityTypeId) return c.json({ error: 'Term entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);
  let imported = 0;
  let skipped = 0;

  for (const rec of importRecords) {
    try {
      const [record] = await db.insert(entityRecords).values({
        schoolId, entityTypeId, isDeleted: false,
      }).returning();
      await upsertFieldValues(record.id, schoolId, fields, rec.values || rec);
      imported++;
    } catch (err) {
      console.warn('[terms] Import row failed:', err);
      skipped++;
    }
  }

  return c.json({ imported, skipped });
});

export default terms;

// Classes Pillar API — Doc 16
// CRUD, relationships, stats — all from entity_records + field_values (EAV)
// Modeled after learners.ts but targeting the 'class' entity type

import { Hono } from 'hono';
import { db } from '../db';
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

const classes = new Hono();

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

// ─── Helpers ────────────────────────────────────────────────────

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

export function invalidateClassFieldCache(entityTypeId?: string) {
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

  // Auto-create 'photo' field if it doesn't exist and a photo value is being set
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
      case 'file':
        // Server-side validation for data URLs
        if (typeof val === 'string' && val.startsWith('data:')) {
          const err = validateDataUrl(val);
          if (err) { console.warn(`[classes] Rejected file for "${field.internalName}": ${err}`); break; }
          // Upload to R2 like learners does
          if (r2Configured()) {
            try {
              const uploaded = await dataUrlToR2(val, schoolId, 'uploads', field.internalName === 'photo' ? 'photo.jpg' : undefined);
              row.fileValue = uploaded;
            } catch (err: any) {
              console.error(`[classes] R2 upload failed for "${field.internalName}", storing base64 fallback:`, err.message);
              row.fileValue = { url: val };
            }
          } else {
            row.fileValue = { url: val };
          }
        } else {
          row.fileValue = typeof val === 'string' ? { url: val } : val;
        }
        break;
      default:
        if (Array.isArray(val)) row.textValue = JSON.stringify(val);
        else row.textValue = String(val);
    }
    inserts.push(row);
  }

  for (let i = 0; i < inserts.length; i += 50) {
    await db.insert(fieldValues).values(inserts.slice(i, i + 50));
  }
}

// Helper: get roster count for a class record
async function getRosterCount(classRecordId: string, schoolId: string): Promise<number> {
  const classTypeId = await getEntityTypeId(schoolId, 'class');
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!classTypeId || !learnerTypeId) return 0;

  // Find class<->learner relationship definition
  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) =>
      a(
        eq(rd.isActive, true),
        o(
          a(eq(rd.fromEntityTypeId, classTypeId), eq(rd.toEntityTypeId, learnerTypeId)),
          a(eq(rd.fromEntityTypeId, learnerTypeId), eq(rd.toEntityTypeId, classTypeId)),
        ),
      ),
  });

  if (!relDef) return 0;

  const relRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { and: a, or: o }) =>
      a(
        eq(rr.relationshipDefinitionId, relDef.id),
        o(
          eq(rr.fromEntityRecordId, classRecordId),
          eq(rr.toEntityRecordId, classRecordId),
        ),
      ),
  });

  return relRecords.length;
}

// ─── Stats endpoint ─────────────────────────────────────────────

classes.get('/stats/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const classTypeId = await getEntityTypeId(schoolId, 'class');
  if (!classTypeId) return c.json({ total: 0, withTeacher: 0, withoutTeacher: 0, avgSize: 0 });

  // Total classes
  const [totalRow] = await db.select({ cnt: count() })
    .from(entityRecords)
    .where(and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, classTypeId),
      eq(entityRecords.isDeleted, false),
    ));
  const total = totalRow?.cnt ?? 0;

  // Get all class records to compute stats
  const allClasses = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, classTypeId),
      eq(entityRecords.isDeleted, false),
    ),
  });

  // Get class fields to check for teacher assignment
  const classFields = await getFieldDefs(classTypeId);
  const teacherField = classFields.find(f => f.internalName === 'teacher' || f.internalName === 'class_teacher');

  // Count roster sizes
  let totalRosterSize = 0;
  let withTeacher = 0;

  for (const cls of allClasses) {
    const rosterCount = await getRosterCount(cls.id, schoolId);
    totalRosterSize += rosterCount;

    // Check if teacher is assigned (via field value or relationship)
    if (teacherField) {
      const vals = await getFieldValues(cls.id, [teacherField]);
      if (vals[teacherField.internalName]) {
        withTeacher++;
      }
    } else {
      // Check via relationship
      const teacherTypeId = await getEntityTypeId(schoolId, 'teacher');
      if (teacherTypeId) {
        const relDef = await db.query.relationshipDefinitions.findFirst({
          where: (rd, { and: a, or: o }) =>
            a(
              eq(rd.isActive, true),
              o(
                a(eq(rd.fromEntityTypeId, classTypeId), eq(rd.toEntityTypeId, teacherTypeId)),
                a(eq(rd.fromEntityTypeId, teacherTypeId), eq(rd.toEntityTypeId, classTypeId)),
              ),
            ),
        });
        if (relDef) {
          const relRecords = await db.query.relationshipRecords.findMany({
            where: (rr, { and: a, or: o }) =>
              a(
                eq(rr.relationshipDefinitionId, relDef.id),
                o(
                  eq(rr.fromEntityRecordId, cls.id),
                  eq(rr.toEntityRecordId, cls.id),
                ),
              ),
          });
          if (relRecords.length > 0) withTeacher++;
        }
      }
    }
  }

  const avgSize = total > 0 ? Math.round(totalRosterSize / total * 10) / 10 : 0;

  return c.json({
    total,
    withTeacher,
    withoutTeacher: total - withTeacher,
    avgSize,
    totalStudents: totalRosterSize,
  });
});

// ─── Lightweight names-only endpoint (for dropdowns) ────────────
// Returns just {id, name} pairs without heavy relationship resolution.

classes.get('/names/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'class');
  if (!entityTypeId) return c.json({ records: [] });

  const fields = await getFieldDefs(entityTypeId);
  const nameField = fields.find(f => f.isIdentifier) || fields.find(f => f.internalName === 'class_name' || f.internalName === 'name') || fields.find(f => f.dataType === 'text');
  if (!nameField) return c.json({ records: [] });

  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 500,
  });
  if (records.length === 0) return c.json({ records: [] });

  const recordIds = records.map(r => r.id);
  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(
      eq(fv.fieldDefinitionId, nameField.id),
      i(fv.entityRecordId, recordIds),
    ),
  });
  const nameMap = new Map(allValues.map(v => [v.entityRecordId, v.textValue || '']));

  return c.json({
    records: records.map(r => ({
      id: r.id,
      name: nameMap.get(r.id) || 'Class',
    })),
  });
});

// ─── List all class records with field values ───────────────────

classes.get('/list/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'class');
  if (!entityTypeId) return c.json({ error: 'Class entity type not found' }, 404);

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

  // Batch fetch all field values
  const recordIds = records.map(r => r.id);
  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) =>
      a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, recordIds)),
  });

  // Build value map
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

  // Unified batch resolution + roster/child counts (all parallelized)
  const { resolveAllRelationshipData, batchGetRosterCounts } = await import('../../../shared/src/blocks/relationship-fields');

  const [rosterCounts, childCounts, { relFields, relValues, relCounts }] = await Promise.all([
    batchGetRosterCounts(recordIds, schoolId),
    db.query.entityRecords.findMany({
      where: (er, { and: a, eq: e, inArray: i }) => a(
        e(er.schoolId, schoolId),
        e(er.entityTypeId, entityTypeId),
        e(er.isDeleted, false),
        i(er.parentRecordId, recordIds),
      ),
      columns: { parentRecordId: true },
    }),
    resolveAllRelationshipData(schoolId, recordIds, entityTypeId, ['teacher']),
  ]);

  // Count children per parent in memory
  const childCountMap = new Map<string, number>();
  for (const child of childCounts) {
    if (child.parentRecordId) {
      childCountMap.set(child.parentRecordId, (childCountMap.get(child.parentRecordId) || 0) + 1);
    }
  }

  const result = records.map(r => {
    const vals = valueMap.get(r.id) || {};
    return {
      id: r.id,
      values: {
        ...vals,
        __roster_count: rosterCounts.get(r.id) || 0,
        __child_count: childCountMap.get(r.id) || 0,
        __teachers_count: relCounts.get(r.id)?.teacher || 0,
        ...(relValues.get(r.id) || {}),
      },
      parentRecordId: r.parentRecordId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  const sectionList = await db.query.sections.findMany({
    where: and(eq(sections.schoolId, schoolId), eq(sections.entityTypeId, entityTypeId)),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  // Include relationship fields in the fields list
  const allFields = [...fields, ...relFields];

  return c.json({ records: result, fields: allFields, sections: sectionList });
});

// ─── Get single class record with all values + roster ───────────

classes.get('/record/:schoolId/:recordId', async (c) => {
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

  // Get parent info
  let parent = null;
  if (record.parentRecordId) {
    const parentRecord = await db.query.entityRecords.findFirst({
      where: eq(entityRecords.id, record.parentRecordId),
    });
    if (parentRecord) {
      const parentVals = await getFieldValues(parentRecord.id, fields);
      parent = { id: parentRecord.id, name: parentVals.class_name || parentVals.name || 'Parent Class' };
    }
  }

  // Get children
  const childRecords = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, record.entityTypeId),
      eq(entityRecords.isDeleted, false),
      eq(entityRecords.parentRecordId, record.id),
    ),
  });
  const children: any[] = [];
  for (const child of childRecords) {
    const childVals = await getFieldValues(child.id, fields);
    const childRoster = await getRosterCount(child.id, schoolId);
    children.push({
      id: child.id,
      name: childVals.class_name || childVals.name || 'Stream',
      rosterCount: childRoster,
      values: childVals,
    });
  }

  return c.json({
    id: record.id,
    values,
    parentRecordId: record.parentRecordId,
    parent,
    children,
    sections: sectionsWithValues,
    unsectionedFields,
    related: relatedData,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
});

// ─── Create class record ────────────────────────────────────────

classes.post('/create/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { values } = body;

  const entityTypeId = await getEntityTypeId(schoolId, 'class');
  if (!entityTypeId) return c.json({ error: 'Class entity type not found' }, 404);

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

// ─── Update class record ────────────────────────────────────────

classes.put('/update/:schoolId/:recordId', async (c) => {
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

  const isPartial = body.partial === true;
  await upsertFieldValues(recordId, schoolId, fields, values || {}, isPartial);

  await db.update(entityRecords)
    .set({ updatedAt: new Date() })
    .where(eq(entityRecords.id, recordId));

  return c.json({ success: true });
});

// ─── Soft-delete class record ───────────────────────────────────

classes.delete('/delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId),
    ),
  });

  if (!record) return c.json({ error: 'Record not found' }, 404);

  await db.update(entityRecords)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(entityRecords.id, recordId));

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
    message: `Class record archived. ${affectedRel.length} relationship(s) will also be hidden.`,
  });
});

// ─── Permanent delete (hard delete) ───────────────────────────

classes.delete('/permanent-delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId),
    ),
  });

  if (!record) return c.json({ error: 'Record not found' }, 404);

  await db.delete(relationshipRecords).where(
    or(
      eq(relationshipRecords.fromEntityRecordId, recordId),
      eq(relationshipRecords.toEntityRecordId, recordId),
    ),
  );

  await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));
  await db.delete(entityRecords).where(eq(entityRecords.id, recordId));

  return c.json({ success: true, message: 'Class record permanently deleted.' });
});

// ─── Bulk permanent delete ─────────────────────────────────────

classes.post('/bulk-delete/:schoolId', async (c) => {
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

    await db.delete(relationshipRecords).where(
      or(
        eq(relationshipRecords.fromEntityRecordId, recordId),
        eq(relationshipRecords.toEntityRecordId, recordId),
      ),
    );

    await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));
    await db.delete(entityRecords).where(eq(entityRecords.id, recordId));
    deletedCount++;
  }

  return c.json({ success: true, deleted: deletedCount });
});

// ─── Get roster for a class ─────────────────────────────────────

classes.get('/roster/:schoolId/:classId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const classId = c.req.param('classId');

  const classTypeId = await getEntityTypeId(schoolId, 'class');
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!classTypeId || !learnerTypeId) return c.json({ roster: [] });

  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) =>
      a(
        eq(rd.isActive, true),
        o(
          a(eq(rd.fromEntityTypeId, classTypeId), eq(rd.toEntityTypeId, learnerTypeId)),
          a(eq(rd.fromEntityTypeId, learnerTypeId), eq(rd.toEntityTypeId, classTypeId)),
        ),
      ),
  });

  if (!relDef) return c.json({ roster: [], childrenRosters: [], relationshipDefinitionId: null });

  // Get direct roster for this class
  const getRosterForClass = async (classRecId: string) => {
    const relRecords = await db.query.relationshipRecords.findMany({
      where: (rr, { and: a, or: o }) =>
        a(
          eq(rr.relationshipDefinitionId, relDef.id),
          o(eq(rr.fromEntityRecordId, classRecId), eq(rr.toEntityRecordId, classRecId)),
        ),
    });
    const learnerIds = relRecords.map(rr =>
      rr.fromEntityRecordId === classRecId ? rr.toEntityRecordId : rr.fromEntityRecordId
    );
    const learnerFields = await getFieldDefs(learnerTypeId);
    const roster: any[] = [];
    for (const id of learnerIds) {
      const vals = await getFieldValues(id, learnerFields);
      roster.push({ id, values: vals, linkId: relRecords.find(rr =>
        (rr.fromEntityRecordId === classRecId && rr.toEntityRecordId === id) ||
        (rr.toEntityRecordId === classRecId && rr.fromEntityRecordId === id)
      )?.id });
    }
    return roster;
  };

  const directRoster = await getRosterForClass(classId);

  // Check for children (parent class rollup)
  const childRecords = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, classTypeId),
      eq(entityRecords.isDeleted, false),
      eq(entityRecords.parentRecordId, classId),
    ),
  });

  const childrenRosters: any[] = [];
  for (const child of childRecords) {
    const childRoster = await getRosterForClass(child.id);
    const childVals = await getFieldValues(child.id, await getFieldDefs(classTypeId));
    childrenRosters.push({
      classId: child.id,
      className: childVals.class_name || childVals.name || 'Stream',
      roster: childRoster,
    });
  }

  return c.json({
    roster: directRoster,
    childrenRosters,
    relationshipDefinitionId: relDef.id,
  });
});

// ─── Link learner to class (fix: was missing, caused 404) ──────

classes.post('/link/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordId, relationshipDefinitionId } = await c.req.json();

  if (!fromRecordId || !toRecordId || !relationshipDefinitionId) {
    return c.json({ error: 'fromRecordId, toRecordId, and relationshipDefinitionId required' }, 400);
  }

  const result = await linkRecord({ schoolId, fromRecordId, toRecordId, relationshipDefinitionId });
  if ('error' in result) return c.json(result, 400);
  return c.json(result, 201);
});

// ─── Bulk Link ───

classes.post('/link-bulk/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordIds, relationshipDefinitionId } = await c.req.json();

  if (!Array.isArray(toRecordIds) || toRecordIds.length === 0) {
    return c.json({ error: 'toRecordIds must be a non-empty array' }, 400);
  }

  const result = await linkRecordsBulk({ schoolId, fromRecordId, toRecordIds, relationshipDefinitionId });
  return c.json(result, 201);
});

// ─── Unlink learner from class ──────────────────────────────────

classes.delete('/unlink/:schoolId/:linkId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const linkId = c.req.param('linkId');
  await unlinkRecord({ schoolId, linkId });
  return c.json({ success: true });
});

// ─── Search available learners for a class ──────────────────────

classes.get('/available-learners/:schoolId/:classId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const classId = c.req.param('classId');
  const q = c.req.query('q') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  const offset = parseInt(c.req.query('offset') || '0');

  const classTypeId = await getEntityTypeId(schoolId, 'class');
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  if (!classTypeId || !learnerTypeId) return c.json({ learners: [], total: 0 });

  // Get learners already in this class's roster
  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) =>
      a(
        eq(rd.isActive, true),
        o(
          a(eq(rd.fromEntityTypeId, classTypeId), eq(rd.toEntityTypeId, learnerTypeId)),
          a(eq(rd.fromEntityTypeId, learnerTypeId), eq(rd.toEntityTypeId, classTypeId)),
        ),
      ),
  });

  const linkedLearnerIds = new Set<string>();
  if (relDef) {
    const linked = await db.query.relationshipRecords.findMany({
      where: (rr, { and: a, or: o }) =>
        a(
          eq(rr.relationshipDefinitionId, relDef.id),
          o(eq(rr.fromEntityRecordId, classId), eq(rr.toEntityRecordId, classId)),
        ),
    });
    for (const r of linked) {
      linkedLearnerIds.add(r.fromEntityRecordId === classId ? r.toEntityRecordId : r.fromEntityRecordId);
    }
  }

  // Get all learner records
  const allLearners = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, learnerTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 500,
  });

  // Get name fields for search
  const learnerFields = await getFieldDefs(learnerTypeId);
  const nameFields = learnerFields.filter(f =>
    f.internalName === 'full_name' || f.internalName === 'first_name' ||
    f.internalName === 'last_name' || f.internalName === 'name' || f.isIdentifier
  );

  // Fetch field values for name search and exclude already-linked
  const available: any[] = [];
  let totalCount = 0;

  for (const learner of allLearners) {
    if (linkedLearnerIds.has(learner.id)) continue;

    const vals = await getFieldValues(learner.id, learnerFields);

    // Search filter
    if (q) {
      const searchStr = Object.values(vals).join(' ').toLowerCase();
      if (!searchStr.includes(q.toLowerCase())) continue;
    }

    // Build display name
    const displayName = vals.full_name || vals.name ||
      ((vals.first_name || '') + ' ' + (vals.last_name || '')).trim() || 'Learner';

    totalCount++;
    if (totalCount > offset && available.length < limit) {
      available.push({ id: learner.id, displayName, values: vals });
    }
  }

  return c.json({ learners: available, total: totalCount });
});

// ─── Import classes from CSV data ──────────────────────────────

classes.post('/import/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { rows, columnMapping, dryRun } = body;

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: 'No rows provided' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'class');
  if (!entityTypeId) return c.json({ error: 'Class entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);
  const fieldMap = new Map(fields.map(f => [f.internalName, f]));

  const reverseMap: Record<string, string> = {};
  for (const [csvHeader, fieldName] of Object.entries(columnMapping)) {
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

// ─── Custom Field Management ────────────────────────────────────

classes.post('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { name, dataType, options, isRequired, unit, maxLength, min, max, color, fileSubtype } = body;

  if (!name || !dataType) return c.json({ error: 'name and dataType required' }, 400);

  const entityTypeId = await getEntityTypeId(schoolId, 'class');
  if (!entityTypeId) return c.json({ error: 'Class entity type not found' }, 404);

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

  invalidateClassFieldCache(entityTypeId);
  return c.json(field, 201);
});

classes.put('/fields/:schoolId/:fieldId', async (c) => {
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
      ...(body.validationRules !== undefined && { validationRules: body.validationRules }),
    })
    .where(eq(fieldDefinitions.id, fieldId))
    .returning();

  invalidateClassFieldCache(field.entityTypeId);
  return c.json(updated[0]);
});

classes.delete('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');

  const field = await db.query.fieldDefinitions.findFirst({
    where: (fd, { and: a, eq: e }) => a(a(e(fd.schoolId, schoolId), e(fd.id, fieldId))),
  });
  if (!field) return c.json({ error: 'Field not found' }, 404);

  await db.delete(fieldValues).where(eq(fieldValues.fieldDefinitionId, fieldId));
  await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));

  invalidateClassFieldCache(field.entityTypeId);
  return c.json({ success: true });
});

classes.get('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'class');
  if (!entityTypeId) return c.json({ fields: [] });

  const flat = await getFieldDefs(entityTypeId);

  // Include relationship definitions as virtual fields
  const { getRelationshipFields } = await import('../../../shared/src/blocks/relationship-fields');
  const relFields = await getRelationshipFields(schoolId, entityTypeId);

  return c.json({ fields: [...flat, ...relFields] });
});

// ─── Version marker for cache staleness detection ────────────────

classes.get('/version/:schoolId', async (c) => {
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

classes.get('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  return c.json({ widgets: (school?.settings as any)?.classWidgets || {} });
});

classes.put('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { widgets } = body;

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  const settings = (school?.settings as any) || {};
  settings.classWidgets = widgets;

  await db.update(schools).set({ settings, updatedAt: new Date() }).where(eq(schools.id, schoolId));

  return c.json({ success: true });
});

export default classes;

// Assessments Pillar — Doc 20
// CRUD, relationships, grid entry (batch create/update per Learner+Subject+Term), reporting

import { Hono } from 'hono';
import { db } from '../db';
import { linkRecord, unlinkRecord, linkRecordsBulk } from '../../../shared/src/blocks/relationship-operations';
import {
  entityTypes, fieldDefinitions, entityRecords, fieldValues,
  relationshipDefinitions, relationshipRecords, schools, sections,
} from '../../../drizzle/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';

const assessments = new Hono();

// ─── Helpers ────────────────────────────────────────────────────

// Positive-result caches for structural lookups (same TTL pattern as the
// field-def cache below). Entity types and relationship definitions are
// effectively immutable per school, and these lookups save a round trip on
// every request. Null results are never cached, so newly created types/rels
// are picked up immediately.
const entityTypeCache = new Map<string, { id: string; at: number }>();
const relDefCache = new Map<string, { id: string; fromEntityTypeId: string; at: number }>();
const STRUCT_CACHE_TTL = 60_000;

async function getEntityTypeId(schoolId: string, internalName: string) {
  const key = `${schoolId}:${internalName}`;
  const hit = entityTypeCache.get(key);
  if (hit && Date.now() - hit.at < STRUCT_CACHE_TTL) return hit.id;

  const type = await db.query.entityTypes.findFirst({
    where: and(eq(entityTypes.schoolId, schoolId), eq(entityTypes.internalName, internalName)),
  });
  if (!type) return null;
  entityTypeCache.set(key, { id: type.id, at: Date.now() });
  return type.id;
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

export function invalidateAssessmentFieldCache(entityTypeId?: string) {
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
        if (typeof val === 'object' && val !== null) row.fileValue = val;
        else row.textValue = String(val);
        break;
      default: row.textValue = String(val); break;
    }
    inserts.push(row);
  }

  if (inserts.length > 0) {
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
    columns: {
      entityRecordId: true, fieldDefinitionId: true,
      textValue: true, numericValue: true, dateValue: true, booleanValue: true, fileValue: true,
    },
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

// Resolve relationship record IDs for a given record + target entity type
async function findRelDef(schoolId: string, fromTypeId: string, toTypeId: string) {
  const pairKey = [fromTypeId, toTypeId].sort().join(':');
  const key = `${schoolId}:${pairKey}`;
  const hit = relDefCache.get(key);
  if (hit && Date.now() - hit.at < STRUCT_CACHE_TTL) return hit;

  const rd = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, fromTypeId), eq(rd.toEntityTypeId, toTypeId)),
        a(eq(rd.fromEntityTypeId, toTypeId), eq(rd.toEntityTypeId, fromTypeId)),
      ), eq(rd.isActive, true)
    ),
  });
  if (rd) relDefCache.set(key, { id: rd.id, fromEntityTypeId: rd.fromEntityTypeId, at: Date.now() });
  return rd;
}

// ─── Exam score machinery ──────────────────────────────────────
// The score a student earns lives in the ordinary "score" number field.
// "max_score" and "weight" are also ordinary fields on the exam's records.

const META_FIELD_NAMES = new Set(['max_score', 'weight']);

// Pick the field that holds the earned score: prefer "score", otherwise the
// first numeric field that is not max_score/weight.
function getScoreField(fields: any[]) {
  const numberFields = fields.filter(f => f.dataType === 'number');
  return numberFields.find(f => f.internalName === 'score')
    ?? numberFields.find(f => !META_FIELD_NAMES.has(f.internalName))
    ?? null;
}

// Find or create a field definition (ordinary, school-editable field)
async function ensureFieldDef(
  schoolId: string,
  entityTypeId: string,
  spec: { name: string; internalName: string; dataType: string },
) {
  const existing = await db.query.fieldDefinitions.findFirst({
    where: (fd, { and: a, eq: e }) => a(
      e(fd.schoolId, schoolId), e(fd.entityTypeId, entityTypeId), e(fd.internalName, spec.internalName),
    ),
  });
  if (existing) return existing;

  const last = await db.query.fieldDefinitions.findMany({
    where: (fd, { and: a, eq: e }) => a(e(fd.schoolId, schoolId), e(fd.entityTypeId, entityTypeId)),
    orderBy: (fd, { desc }) => [desc(fd.displayOrder)],
    limit: 1,
  });

  const [field] = await db.insert(fieldDefinitions).values({
    schoolId,
    entityTypeId,
    name: spec.name,
    internalName: spec.internalName,
    dataType: spec.dataType,
    displayOrder: (last[0]?.displayOrder ?? 0) + 1,
  }).returning();

  invalidateAssessmentFieldCache(entityTypeId);
  return field;
}

// Ensure Score / Max Score / Weight fields exist on the assessment entity.
// Checks the (cached) field list first so the common case costs zero queries.
async function ensureExamFields(schoolId: string, entityTypeId: string) {
  const existing = await getFieldDefs(entityTypeId);
  const have = new Set(existing.map((f: any) => f.internalName));
  const wanted = [
    { name: 'Score', internalName: 'score', dataType: 'number' },
    { name: 'Max Score', internalName: 'max_score', dataType: 'number' },
    { name: 'Weight', internalName: 'weight', dataType: 'number' },
    { name: 'Exam Date', internalName: 'date', dataType: 'date' },
  ];
  let createdAny = false;
  for (const spec of wanted) {
    if (!have.has(spec.internalName)) {
      await ensureFieldDef(schoolId, entityTypeId, spec);
      createdAny = true;
    }
  }
  return createdAny ? getFieldDefs(entityTypeId) : existing;
}

function medianOf(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pctOf(score: number | null | undefined, max: number | null | undefined): number | null {
  if (score === null || score === undefined || max === null || max === undefined) return null;
  const s = Number(score); const m = Number(max);
  if (isNaN(s) || isNaN(m) || m <= 0) return null;
  return Math.round((s / m) * 1000) / 10;
}

// ─── Grade scale (school-defined bands, derived at read time) ───

export interface GradeBand { label: string; min: number; max: number; remark?: string; }

async function getGradeScale(schoolId: string): Promise<GradeBand[]> {
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const bands = (school?.settings as any)?.gradeScale;
  return Array.isArray(bands) ? bands : [];
}

function normalizeBands(raw: any): GradeBand[] | null {
  if (!Array.isArray(raw)) return null;
  const bands: GradeBand[] = [];
  for (const b of raw) {
    if (!b || typeof b.label !== 'string' || b.label.trim() === '') return null;
    const min = Number(b.min); const max = Number(b.max);
    if (isNaN(min) || isNaN(max)) return null;
    const remark = typeof b.remark === 'string' ? b.remark.trim() : '';
    bands.push({ label: b.label.trim(), min, max, ...(remark ? { remark } : {}) });
  }
  return bands;
}

// Derive a grade label from a percentage using the school's own bands.
// Returns null when no scale is defined or the percentage falls outside every band.
function deriveGrade(pct: number | null, bands: GradeBand[]): string | null {
  if (pct === null || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const b of sorted) {
    if (pct >= b.min && pct <= b.max) return b.label;
  }
  return null;
}

// ─── Batched write helpers (used by exam create/save paths) ───

async function insertRecordsBatch(schoolId: string, entityTypeId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 500) {
    const chunkSize = Math.min(500, count - i);
    const rows = await db.insert(entityRecords)
      .values(Array.from({ length: chunkSize }, () => ({ schoolId, entityTypeId, isDeleted: false })))
      .returning({ id: entityRecords.id });
    ids.push(...rows.map(r => r.id));
  }
  return ids;
}

// Write field values for many records in a handful of queries.
// partial=false wipes each record's values first; partial=true only touches
// the fields present in each entry's values map.
async function bulkUpsertFieldValues(
  schoolId: string,
  entries: Array<{ recordId: string; values: Record<string, any> }>,
  fields: any[],
  partial = false,
) {
  if (entries.length === 0) return;
  const fieldByName = new Map(fields.map(f => [f.internalName, f]));
  const recordIds = entries.map(e => e.recordId);

  if (!partial) {
    for (let i = 0; i < recordIds.length; i += 500) {
      await db.delete(fieldValues).where(inArray(fieldValues.entityRecordId, recordIds.slice(i, i + 500)));
    }
  } else {
    const touchedFieldIds = new Set<string>();
    for (const e of entries) {
      for (const key of Object.keys(e.values)) {
        const f = fieldByName.get(key);
        if (f) touchedFieldIds.add(f.id);
      }
    }
    if (touchedFieldIds.size === 0) return;
    const fieldIdList = [...touchedFieldIds];
    for (let i = 0; i < recordIds.length; i += 200) {
      await db.delete(fieldValues).where(and(
        inArray(fieldValues.entityRecordId, recordIds.slice(i, i + 200)),
        inArray(fieldValues.fieldDefinitionId, fieldIdList),
      ));
    }
  }

  const inserts: any[] = [];
  for (const { recordId, values } of entries) {
    for (const [key, val] of Object.entries(values)) {
      const field = fieldByName.get(key);
      if (!field || val === undefined || val === null || val === '') continue;
      const row: any = { schoolId, entityRecordId: recordId, fieldDefinitionId: field.id };
      switch (field.dataType) {
        case 'number': row.numericValue = Number(val); break;
        case 'date': row.dateValue = String(val); break;
        case 'time': row.textValue = String(val); break;
        case 'boolean': row.booleanValue = Boolean(val); break;
        case 'file':
          if (typeof val === 'object' && val !== null) row.fileValue = val;
          else row.textValue = String(val);
          break;
        default: row.textValue = String(val); break;
      }
      inserts.push(row);
    }
  }

  for (let i = 0; i < inserts.length; i += 500) {
    await db.insert(fieldValues).values(inserts.slice(i, i + 500));
  }
}

interface LinkSpec { fromEntityRecordId: string; toEntityRecordId: string; relationshipDefinitionId: string; }

// Bulk-insert relationship rows (deduped, direction respected per rel def)
async function bulkInsertLinks(schoolId: string, links: LinkSpec[]) {
  const seen = new Set<string>();
  const rows: any[] = [];
  for (const l of links) {
    const key = `${l.relationshipDefinitionId}:${l.fromEntityRecordId}:${l.toEntityRecordId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ schoolId, ...l });
  }
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(relationshipRecords).values(rows.slice(i, i + 500));
  }
}

// Direction-aware link row builder: rel defs may point either way
function makeLink(rel: { id: string; fromEntityTypeId: string } | null | undefined, entityTypeId: string, recordId: string, otherId: string): LinkSpec | null {
  if (!rel) return null;
  const isFrom = rel.fromEntityTypeId === entityTypeId;
  return {
    relationshipDefinitionId: rel.id,
    fromEntityRecordId: isFrom ? recordId : otherId,
    toEntityRecordId: isFrom ? otherId : recordId,
  };
}

// Resolve display names for a set of record ids — 2 queries total regardless
// of how many entity types are involved.
async function resolveDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const displayNames = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return displayNames;

  const linkedRecords = await db.query.entityRecords.findMany({
    where: (er, { inArray: i }) => i(er.id, unique),
    columns: { id: true, entityTypeId: true },
  });
  if (linkedRecords.length === 0) return displayNames;

  // Name field per entity type (field defs are cached)
  const typesPresent = [...new Set(linkedRecords.map(r => r.entityTypeId))];
  const nameFieldByType = new Map<string, any>();
  const nameFieldIds: string[] = [];
  for (const typeId of typesPresent) {
    const lrFields = await getFieldDefs(typeId);
    const nameField = lrFields.find(f => f.isIdentifier) || lrFields.find(f => f.internalName.includes('name'));
    if (nameField) {
      nameFieldByType.set(typeId, nameField);
      nameFieldIds.push(nameField.id);
    }
  }
  if (nameFieldIds.length === 0) return displayNames;

  const uniqueSet = new Set(unique);
  const vals = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(
      i(fv.entityRecordId, unique),
      i(fv.fieldDefinitionId, nameFieldIds),
    ),
    columns: { entityRecordId: true, fieldDefinitionId: true, textValue: true },
  });

  const recordType = new Map(linkedRecords.map(r => [r.id, r.entityTypeId]));
  for (const v of vals) {
    if (!uniqueSet.has(v.entityRecordId)) continue;
    const typeId = recordType.get(v.entityRecordId);
    const nf = typeId ? nameFieldByType.get(typeId) : null;
    if (!nf || nf.id !== v.fieldDefinitionId) continue;
    if (v.textValue) displayNames.set(v.entityRecordId, v.textValue);
  }

  // Fallback: records whose name value row is missing → id as label
  for (const id of unique) {
    if (!displayNames.has(id)) displayNames.set(id, id);
  }
  return displayNames;
}

// ─── Exam context loader (shared by exam-load / exam-save / student-report) ───
// Returns every assessment record belonging to the given exam
// (same term + same exam name), with relationship lookups built.

interface ExamContext {
  matchedIds: string[];
  valuesMap: Map<string, Record<string, any>>;
  assessToLearner: Map<string, string>;
  assessToSubject: Map<string, string>;
  assessToTerm: Map<string, string>;
  assessToClasses: Map<string, string[]>;
  learnerRel: any; subjectRel: any; termRel: any; classRel: any;
}

async function loadExamContext(
  schoolId: string,
  entityTypeId: string,
  fields: any[],
  termId: string,
  examName: string,
  opts?: { needClasses?: boolean },
): Promise<ExamContext> {
  // The class relationship is by far the largest (historical exams link each
  // record to many classes) — skip fetching it when the caller doesn't read it.
  const needClasses = opts?.needClasses !== false;
  const empty: ExamContext = {
    matchedIds: [], valuesMap: new Map(),
    assessToLearner: new Map(), assessToSubject: new Map(), assessToTerm: new Map(), assessToClasses: new Map(),
    learnerRel: null, subjectRel: null, termRel: null, classRel: null,
  };

  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const classTypeId = await getEntityTypeId(schoolId, 'class');

  const [learnerRel, subjectRel, termRel, classRel] = await Promise.all([
    learnerTypeId ? findRelDef(schoolId, entityTypeId, learnerTypeId) : null,
    subjectTypeId ? findRelDef(schoolId, entityTypeId, subjectTypeId) : null,
    termTypeId ? findRelDef(schoolId, entityTypeId, termTypeId) : null,
    needClasses && classTypeId ? findRelDef(schoolId, entityTypeId, classTypeId) : null,
  ]);

  const allAssessments = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 2000,
  });
  if (allAssessments.length === 0 || !termRel) return { ...empty, learnerRel, subjectRel, classRel };

  const assessmentIds = allAssessments.map(a => a.id);
  const idSet = new Set(assessmentIds);
  const relDefIds = [learnerRel, subjectRel, termRel, classRel].filter(Boolean).map(r => r!.id);

  const allRelRecords = relDefIds.length > 0
    ? await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, inArray: i, or: o }) => a(
          inArray(rr.relationshipDefinitionId, relDefIds),
          or(inArray(rr.fromEntityRecordId, assessmentIds), inArray(rr.toEntityRecordId, assessmentIds)),
        ),
        columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
      })
    : [];

  const assessToLearner = new Map<string, string>();
  const assessToSubject = new Map<string, string>();
  const assessToTerm = new Map<string, string>();
  const assessToClasses = new Map<string, string[]>();

  const relIdSet = {
    learner: new Set(learnerRel ? [learnerRel.id] : []),
    subject: new Set(subjectRel ? [subjectRel.id] : []),
    term: new Set(termRel ? [termRel.id] : []),
    klass: new Set(classRel ? [classRel.id] : []),
  };

  for (const rr of allRelRecords) {
    const aId = idSet.has(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
    const linkedId = aId === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
    if (relIdSet.learner.has(rr.relationshipDefinitionId)) assessToLearner.set(aId, linkedId);
    if (relIdSet.subject.has(rr.relationshipDefinitionId)) assessToSubject.set(aId, linkedId);
    if (relIdSet.term.has(rr.relationshipDefinitionId)) assessToTerm.set(aId, linkedId);
    if (relIdSet.klass.has(rr.relationshipDefinitionId)) {
      const arr = assessToClasses.get(aId) || [];
      arr.push(linkedId); assessToClasses.set(aId, arr);
    }
  }

  // Filter by term, then by exam name (needs field values)
  const termMatched = assessmentIds.filter(id => assessToTerm.get(id) === termId);
  if (termMatched.length === 0) return { ...empty, learnerRel, subjectRel, termRel, classRel };

  const valuesMap = await batchGetFieldValues(termMatched, fields);
  const matchedIds = termMatched.filter(id => {
    const vals = valuesMap.get(id) || {};
    return (vals.assessment_name || vals.name || '') === examName;
  });

  return { matchedIds, valuesMap, assessToLearner, assessToSubject, assessToTerm, assessToClasses, learnerRel, subjectRel, termRel, classRel };
}

// Compute an overall percentage for a set of subject entries.
// No weights → plain total ÷ overall max. Weights set → weighted average of subject percentages.
function computeOverall(
  subjects: Array<{ score: number | null; max: number | null; weight: number | null }>,
): { sum: number; max: number; pct: number | null; weighted: boolean } {
  let sum = 0;
  let max = 0;
  let weightedNum = 0;
  let weightDen = 0;
  let anyWeight = false;

  for (const s of subjects) {
    const score = s.score === null ? null : Number(s.score);
    const m = s.max === null ? null : Number(s.max);
    const w = s.weight === null || isNaN(Number(s.weight)) || Number(s.weight) <= 0 ? 1 : Number(s.weight);
    if (s.weight !== null && Number(s.weight) > 0 && Number(s.weight) !== 1) anyWeight = true;
    if (score !== null && !isNaN(score)) sum += score;
    if (m !== null && !isNaN(m) && m > 0) {
      max += m;
      if (score !== null && !isNaN(score)) {
        weightedNum += (score / m) * w;
        weightDen += w;
      }
    }
  }

  const pct = anyWeight
    ? (weightDen > 0 ? Math.round((weightedNum / weightDen) * 1000) / 10 : null)
    : (max > 0 ? Math.round((sum / max) * 1000) / 10 : null);

  return { sum: Math.round(sum * 100) / 100, max: Math.round(max * 100) / 100, pct, weighted: anyWeight };
}

// ─── List all assessment records with field values ───

assessments.get('/list/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
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

  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) =>
      a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, recordIds)),
    columns: {
      entityRecordId: true, fieldDefinitionId: true,
      textValue: true, numericValue: true, dateValue: true, booleanValue: true, fileValue: true,
    },
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

  const { resolveAllRelationshipData } = await import('../../../shared/src/blocks/relationship-fields');
  const { relFields, relValues } = await resolveAllRelationshipData(schoolId, recordIds, entityTypeId);

  // Transform relValues from __rel_<defId> format to __${targetEntityName} format
  // so generateRelationshipColumns on the frontend can read them.
  const transformedRelValues = new Map<string, Record<string, any>>();
  for (const [recordId, vals] of relValues) {
    const out: Record<string, any> = {};
    for (const field of relFields) {
      const targetName = field._targetEntityName;
      const relKey = field.internalName; // __rel_<defId>
      const rawValue = vals[relKey];
      const namesKey = `${relKey}_names`;
      const names = vals[namesKey];

      if (rawValue !== undefined) {
        // Parse count from "1 learner" or "3 subjects" format
        const countMatch = String(rawValue).match(/^(\d+)/);
        const count = countMatch ? parseInt(countMatch[1], 10) : (Array.isArray(names) ? names.length : 0);
        out[`__${targetName}_count`] = count;
      }
      if (names !== undefined) {
        out[`__${targetName}_names`] = names;
      }
    }
    transformedRelValues.set(recordId, out);
  }

  const sectionRecords = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  const result = records.map(r => ({
    id: r.id,
    values: {
      ...(valueMap.get(r.id) || {}),
      ...(transformedRelValues.get(r.id) || {}),
    },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return c.json({ records: result, fields: [...fields, ...relFields], sections: sectionRecords });
});

// ─── Get single assessment record ───

assessments.get('/record/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId), eq(entityRecords.isDeleted, false)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);
  const values = await getFieldValues(recordId, fields);

  const sectionRecords = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, record.entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  return c.json({
    id: record.id,
    values,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fields,
    sections: sectionRecords,
  });
});

// ─── Create assessment record ───

assessments.post('/create/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { values } = body;

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);

  const requiredFields = fields.filter(f => f.isRequired);
  for (const rf of requiredFields) {
    if (!values || !values[rf.internalName]) {
      return c.json({ error: `Field "${rf.name}" is required` }, 400);
    }
  }

  const [record] = await db.insert(entityRecords).values({
    schoolId,
    entityTypeId,
    isDeleted: false,
  }).returning();

  await upsertFieldValues(record.id, schoolId, fields, values || {});

  return c.json({ id: record.id, success: true }, 201);
});

// ─── Update assessment record ───

assessments.put('/update/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const body = await c.req.json();
  const { values } = body;

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId), eq(entityRecords.isDeleted, false)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const fields = await getFieldDefs(record.entityTypeId);

  if (values) {
    await upsertFieldValues(recordId, schoolId, fields, values, true);
  }

  return c.json({ success: true });
});

// ─── Delete assessment (soft) ───

assessments.delete('/delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId), eq(entityRecords.isDeleted, false)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  await db.update(entityRecords).set({ isDeleted: true }).where(eq(entityRecords.id, recordId));
  return c.json({ success: true });
});

// ─── Permanent delete ───

assessments.delete('/permanent-delete/:schoolId/:recordId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');

  const record = await db.query.entityRecords.findFirst({
    where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.id, recordId)),
  });
  if (!record) return c.json({ error: 'Record not found' }, 404);

  await db.delete(fieldValues).where(eq(fieldValues.entityRecordId, recordId));
  await db.delete(relationshipRecords).where(
    or(eq(relationshipRecords.fromEntityRecordId, recordId), eq(relationshipRecords.toEntityRecordId, recordId)),
  );
  await db.delete(entityRecords).where(eq(entityRecords.id, recordId));
  return c.json({ success: true });
});

// ─── Bulk delete ───

assessments.post('/bulk-delete/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { ids } = await c.req.json() as { ids: string[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids must be a non-empty array' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  const records = await db.query.entityRecords.findMany({
    where: (er, { and: a, inArray: i }) => a(
      eq(er.schoolId, schoolId), eq(er.entityTypeId, entityTypeId), eq(er.isDeleted, false), i(er.id, ids),
    ),
  });

  if (records.length !== ids.length) {
    return c.json({ error: `Found ${records.length} of ${ids.length} records` }, 400);
  }

  await db.delete(relationshipRecords).where(
    or(inArray(relationshipRecords.fromEntityRecordId, ids), inArray(relationshipRecords.toEntityRecordId, ids)),
  );
  await db.delete(fieldValues).where(inArray(fieldValues.entityRecordId, ids));
  await db.update(entityRecords).set({ isDeleted: true }).where(inArray(entityRecords.id, ids));

  return c.json({ deleted: ids.length });
});

// ─── Fields ───

assessments.get('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ fields: [], sections: [] });

  const fields = await getFieldDefs(entityTypeId);
  const sectionRecords = await db.query.sections.findMany({
    where: eq(sections.entityTypeId, entityTypeId),
    orderBy: (s, { asc }) => [asc(s.displayOrder)],
  });

  return c.json({ fields, sections: sectionRecords });
});

assessments.post('/fields/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { name, dataType, options, isRequired, unit, maxLength, min, max, color, fileSubtype, sectionId } = body;

  if (!name || !dataType) return c.json({ error: 'name and dataType required' }, 400);

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

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

  invalidateAssessmentFieldCache(entityTypeId);
  return c.json(field, 201);
});

assessments.put('/fields/:schoolId/:fieldId', async (c) => {
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
  invalidateAssessmentFieldCache(field.entityTypeId);
  return c.json({ success: true });
});

assessments.delete('/fields/:schoolId/:fieldId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const fieldId = c.req.param('fieldId');

  const field = await db.query.fieldDefinitions.findFirst({
    where: and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.schoolId, schoolId)),
  });
  if (!field) return c.json({ error: 'Field not found' }, 404);

  await db.delete(fieldValues).where(eq(fieldValues.fieldDefinitionId, fieldId));
  await db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));

  invalidateAssessmentFieldCache(field.entityTypeId);
  return c.json({ success: true });
});

// ─── Link / Unlink / Bulk Link ───

assessments.post('/link/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordId, relationshipDefinitionId } = await c.req.json();
  const result = await linkRecord({ schoolId, fromRecordId, toRecordId, relationshipDefinitionId });
  if ('error' in result) return c.json(result, 400);
  return c.json(result, 201);
});

assessments.post('/link-bulk/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { fromRecordId, toRecordIds, relationshipDefinitionId } = await c.req.json();
  if (!Array.isArray(toRecordIds) || toRecordIds.length === 0) {
    return c.json({ error: 'toRecordIds must be a non-empty array' }, 400);
  }
  const result = await linkRecordsBulk({ schoolId, fromRecordId, toRecordIds, relationshipDefinitionId });
  return c.json(result, 201);
});

assessments.delete('/unlink/:schoolId/:linkId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const linkId = c.req.param('linkId');
  await unlinkRecord({ schoolId, linkId });
  return c.json({ success: true });
});

// ─── Related Records ───

assessments.get('/related/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const assessmentTypeId = await getEntityTypeId(schoolId, 'assessment');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!assessmentTypeId || !targetTypeId) return c.json({ records: [], relationshipDefinitionId: null });

  const relDef = await findRelDef(schoolId, assessmentTypeId, targetTypeId);
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

assessments.get('/available/:schoolId/:recordId/:targetEntityName', async (c) => {
  const schoolId = c.req.param('schoolId');
  const recordId = c.req.param('recordId');
  const targetEntityName = c.req.param('targetEntityName');

  const assessmentTypeId = await getEntityTypeId(schoolId, 'assessment');
  const targetTypeId = await getEntityTypeId(schoolId, targetEntityName);
  if (!assessmentTypeId || !targetTypeId) return c.json({ records: [] });

  const relDef = await findRelDef(schoolId, assessmentTypeId, targetTypeId);
  if (!relDef) return c.json({ records: [] });

  const linked = await db.query.relationshipRecords.findMany({
    where: (rr, { or: o, and: a }) => a(
      eq(rr.relationshipDefinitionId, relDef.id),
      o(eq(rr.fromEntityRecordId, recordId), eq(rr.toEntityRecordId, recordId)),
    ),
  });
  const linkedIds = new Set(linked.flatMap(rr => [rr.fromEntityRecordId, rr.toEntityRecordId]));

  const allTarget = await db.query.entityRecords.findMany({
    where: (er, { and: a, eq: e }) => a(
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

// ─── Grid Entry: batch create/update per Learner+Subject+Term ───

assessments.post('/grid-save/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { learnerIds, subjectId, termId, classId, values } = body as {
    learnerIds: string[];
    subjectId: string;
    termId: string;
    classId?: string;
    values: Record<string, Record<string, any>>; // learnerId → { fieldName: value }
  };

  if (!Array.isArray(learnerIds) || learnerIds.length === 0) {
    return c.json({ error: 'learnerIds must be a non-empty array' }, 400);
  }
  if (!subjectId || !termId) {
    return c.json({ error: 'subjectId and termId are required' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);

  // Find relationship definitions for assessment ↔ learner, subject, term
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const classTypeId = await getEntityTypeId(schoolId, 'class');

  const [learnerRel, subjectRel, termRel, classRel] = await Promise.all([
    learnerTypeId ? findRelDef(schoolId, entityTypeId, learnerTypeId) : null,
    subjectTypeId ? findRelDef(schoolId, entityTypeId, subjectTypeId) : null,
    termTypeId ? findRelDef(schoolId, entityTypeId, termTypeId) : null,
    classTypeId ? findRelDef(schoolId, entityTypeId, classTypeId) : null,
  ]);

  // Batched lookup: for each learner, find the existing assessment linked to
  // this learner + subject + term. Three queries total instead of three per learner.
  const existingByLearner = new Map<string, string>();

  if (learnerRel && subjectRel && termRel) {
    // 1) all assessment links for these learners
    const learnerAssessRels = await db.query.relationshipRecords.findMany({
      where: (rr, { and: a, inArray: i, or: o }) => a(
        eq(rr.relationshipDefinitionId, learnerRel.id),
        o(i(rr.fromEntityRecordId, learnerIds), i(rr.toEntityRecordId, learnerIds)),
      ),
      columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
    });

    const learnerToAssessments = new Map<string, Set<string>>();
    const candidateIds = new Set<string>();
    const learnerIdSet = new Set(learnerIds);
    for (const rr of learnerAssessRels) {
      const learnerId = learnerIdSet.has(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
      const assessId = learnerId === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
      const set = learnerToAssessments.get(learnerId) || new Set<string>();
      set.add(assessId); learnerToAssessments.set(learnerId, set);
      candidateIds.add(assessId);
    }

    if (candidateIds.size > 0) {
      const candList = [...candidateIds];
      // 2) which candidates link to this subject
      const subjectRels = await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, inArray: i, or: o }) => a(
          eq(rr.relationshipDefinitionId, subjectRel.id),
          o(i(rr.fromEntityRecordId, candList), i(rr.toEntityRecordId, candList)),
        ),
        columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
      });
      const subjectMatched = new Set<string>();
      for (const rr of subjectRels) {
        const cand = rr.fromEntityRecordId === subjectId ? rr.fromEntityRecordId
          : candList.includes(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
        // verify the other side is the requested subject
        const other = cand === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
        if (other === subjectId) subjectMatched.add(cand);
      }

      // 3) which of those link to this term
      const subjectCandList = [...subjectMatched];
      if (subjectCandList.length > 0) {
        const termRels = await db.query.relationshipRecords.findMany({
          where: (rr, { and: a, inArray: i, or: o }) => a(
            eq(rr.relationshipDefinitionId, termRel.id),
            o(i(rr.fromEntityRecordId, subjectCandList), i(rr.toEntityRecordId, subjectCandList)),
          ),
          columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
        });
        const termMatched = new Set<string>();
        for (const rr of termRels) {
          const other = subjectCandList.includes(rr.fromEntityRecordId) ? rr.toEntityRecordId : rr.fromEntityRecordId;
          if (other === termId) {
            termMatched.add(subjectCandList.includes(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId);
          }
        }

        for (const [learnerId, assessSet] of learnerToAssessments) {
          for (const aId of assessSet) {
            if (termMatched.has(aId)) { existingByLearner.set(learnerId, aId); break; }
          }
        }
      }
    }
  }

  // Split into updates and creates, then write both in batch
  const updateEntries: Array<{ recordId: string; values: Record<string, any> }> = [];
  const createPairs: Array<{ learnerId: string; values: Record<string, any> }> = [];
  const recordIds: string[] = [];
  let created = 0;
  let updated = 0;

  for (const learnerId of learnerIds) {
    const learnerValues = values[learnerId];
    if (!learnerValues || Object.keys(learnerValues).length === 0) continue;

    const existingRecordId = existingByLearner.get(learnerId);
    if (existingRecordId) {
      updateEntries.push({ recordId: existingRecordId, values: learnerValues });
      recordIds.push(existingRecordId);
      updated++;
    } else {
      createPairs.push({ learnerId, values: learnerValues });
      created++;
    }
  }

  await bulkUpsertFieldValues(schoolId, updateEntries, fields, true);

  if (createPairs.length > 0) {
    const newRecordIds = await insertRecordsBatch(schoolId, entityTypeId, createPairs.length);
    await bulkUpsertFieldValues(schoolId, createPairs.map((p, i) => ({ recordId: newRecordIds[i], values: p.values })), fields);

    const links: LinkSpec[] = [];
    for (let i = 0; i < createPairs.length; i++) {
      const rid = newRecordIds[i];
      recordIds.push(rid);
      const l = makeLink(learnerRel, entityTypeId, rid, createPairs[i].learnerId); if (l) links.push(l);
      const s = makeLink(subjectRel, entityTypeId, rid, subjectId); if (s) links.push(s);
      const t = makeLink(termRel, entityTypeId, rid, termId); if (t) links.push(t);
      if (classId && classRel) {
        const cl = makeLink(classRel, entityTypeId, rid, classId); if (cl) links.push(cl);
      }
    }
    await bulkInsertLinks(schoolId, links);
  }

  return c.json({ created, updated, total: learnerIds.length, recordIds });
});

// ─── Grid Entry: load existing data for a Learner+Subject+Term combo ───

assessments.get('/grid-load/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const subjectId = c.req.query('subjectId');
  const termId = c.req.query('termId');
  const classId = c.req.query('classId');
  const examName = c.req.query('examName'); // optional: filter by specific exam

  if (!subjectId || !termId) {
    return c.json({ error: 'subjectId and termId query params required' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);

  // Find learners linked to this subject+term via the roster
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const classTypeId = await getEntityTypeId(schoolId, 'class');

  // Get learners: if classId provided, get class roster; otherwise get all learners
  let learnerIds: string[] = [];
  if (classId && classTypeId && learnerTypeId) {
    const classLearnerRel = await findRelDef(schoolId, classTypeId, learnerTypeId);
    if (classLearnerRel) {
      const rels = await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, eq: e, or: o }) => a(
          e(rr.relationshipDefinitionId, classLearnerRel.id),
          o(e(rr.fromEntityRecordId, classId), e(rr.toEntityRecordId, classId)),
        ),
      });
      learnerIds = rels.map(rr =>
        rr.fromEntityRecordId === classId ? rr.toEntityRecordId : rr.fromEntityRecordId
      );
    }
  } else if (learnerTypeId) {
    // No class filter — load all learners
    const allLearners = await db.query.entityRecords.findMany({
      where: and(
        eq(entityRecords.schoolId, schoolId),
        eq(entityRecords.entityTypeId, learnerTypeId),
        eq(entityRecords.isDeleted, false),
      ),
      limit: 200,
    });
    learnerIds = allLearners.map(l => l.id);
  }

  // Get learner names if we have IDs
  let learnerMap = new Map<string, Record<string, any>>();
  if (learnerIds.length > 0 && learnerTypeId) {
    const learnerFields = await getFieldDefs(learnerTypeId);
    learnerMap = await batchGetFieldValues(learnerIds, learnerFields);
  }

  // Find all assessments for this school+type
  const allAssessments = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 1000,
  });

  // For each assessment, check if it's linked to the given subject+term
  const subjectRelsList = subjectTypeId ? await db.query.relationshipDefinitions.findMany({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, entityTypeId), eq(rd.toEntityTypeId, subjectTypeId)),
        a(eq(rd.fromEntityTypeId, subjectTypeId), eq(rd.toEntityTypeId, entityTypeId)),
      ), eq(rd.isActive, true)
    ),
  }) : [];
  const termRelsList = termTypeId ? await db.query.relationshipDefinitions.findMany({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, entityTypeId), eq(rd.toEntityTypeId, termTypeId)),
        a(eq(rd.fromEntityTypeId, termTypeId), eq(rd.toEntityTypeId, entityTypeId)),
      ), eq(rd.isActive, true)
    ),
  }) : [];
  const learnerRelsList = learnerTypeId ? await db.query.relationshipDefinitions.findMany({
    where: (rd, { and: a, or: o }) => a(
      o(
        a(eq(rd.fromEntityTypeId, entityTypeId), eq(rd.toEntityTypeId, learnerTypeId)),
        a(eq(rd.fromEntityTypeId, learnerTypeId), eq(rd.toEntityTypeId, entityTypeId)),
      ), eq(rd.isActive, true)
    ),
  }) : [];

  // Batch fetch all relationship records for ALL matching rel defs
  const relDefIds = [...subjectRelsList, ...termRelsList, ...learnerRelsList].map(r => r.id);
  const assessmentIds = allAssessments.map(a => a.id);

  const allRelRecords = relDefIds.length > 0 && assessmentIds.length > 0
    ? await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, inArray: i }) => a(
          inArray(rr.relationshipDefinitionId, relDefIds),
          or(inArray(rr.fromEntityRecordId, assessmentIds), inArray(rr.toEntityRecordId, assessmentIds)),
        ),
        columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
      })
    : [];

  // Group relationship records by entity type pair (aggregate across duplicate rel defs)
  const assessToSubject = new Map<string, string>();
  const assessToTerm = new Map<string, string>();
  const assessToLearner = new Map<string, string>();
  const assessmentIdSet = new Set(assessmentIds);

  const subjectRelIds = new Set(subjectRelsList.map(r => r.id));
  const termRelIds = new Set(termRelsList.map(r => r.id));
  const learnerRelIds = new Set(learnerRelsList.map(r => r.id));

  for (const rr of allRelRecords) {
    const aId = assessmentIdSet.has(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
    const linkedId = aId === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
    if (subjectRelIds.has(rr.relationshipDefinitionId)) assessToSubject.set(aId, linkedId);
    if (termRelIds.has(rr.relationshipDefinitionId)) assessToTerm.set(aId, linkedId);
    if (learnerRelIds.has(rr.relationshipDefinitionId)) assessToLearner.set(aId, linkedId);
  }

  // Find assessments that are linked to both the subject and term
  const matchedAssessments: string[] = [];

  {
    // If examName provided, we need field values to filter by assessment_name
    // First get all field values for assessments matching subject+term
    const candidateIds = assessmentIds.filter(aId =>
      assessToSubject.get(aId) === subjectId && assessToTerm.get(aId) === termId
    );

    if (examName && candidateIds.length > 0) {
      // Filter by exam name
      const candidateValues = await batchGetFieldValues(candidateIds, fields);
      for (const aId of candidateIds) {
        const vals = candidateValues.get(aId) || {};
        if (vals.assessment_name === examName || vals.name === examName) {
          matchedAssessments.push(aId);
        }
      }
    } else {
      matchedAssessments.push(...candidateIds);
    }
  }

  // Get field values for matched assessments
  const gridData: Record<string, any> = {};
  if (matchedAssessments.length > 0) {
    const valuesMap = await batchGetFieldValues(matchedAssessments, fields);
    for (const aId of matchedAssessments) {
      const learnerId = assessToLearner.get(aId) || null;
      if (learnerId) {
        gridData[learnerId] = {
          assessmentId: aId,
          values: valuesMap.get(aId) || {},
        };
      }
    }
  }

  // Build learner list with display names
  const learners = learnerIds.map(id => {
    const vals = learnerMap.get(id) || {};
    return {
      id,
      name: vals.full_name || vals.name ||
        ((vals.first_name || '') + ' ' + (vals.last_name || '')).trim() || 'Learner',
      values: vals,
    };
  });

  return c.json({
    learners,
    gridData,
    fields: fields.map(f => ({ id: f.id, name: f.name, internalName: f.internalName, dataType: f.dataType, options: f.options })),
  });
});

// ─── Grid Entry: list available exams for a Subject+Term combo ───

assessments.get('/grid-exams/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const subjectId = c.req.query('subjectId'); // optional — exams span subjects
  const termId = c.req.query('termId');

  if (!termId) {
    return c.json({ exams: [] });
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ exams: [] });

  const fields = await getFieldDefs(entityTypeId);

  // Get relationship definitions
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');

  const subjectRel = subjectTypeId ? await findRelDef(schoolId, entityTypeId, subjectTypeId) : null;
  const termRel = termTypeId ? await findRelDef(schoolId, entityTypeId, termTypeId) : null;

  if (!subjectRel || !termRel) return c.json({ exams: [] });

  // Fetch all assessments
  const allAssessments = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 2000,
  });

  if (allAssessments.length === 0) return c.json({ exams: [] });

  const assessmentIds = allAssessments.map(a => a.id);

  // Batch fetch relationship records
  const allRelRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { and: a, inArray: i }) => a(
      inArray(rr.relationshipDefinitionId, [subjectRel.id, termRel.id]),
      or(inArray(rr.fromEntityRecordId, assessmentIds), inArray(rr.toEntityRecordId, assessmentIds)),
    ),
  });

  // Build maps
  const assessToSubject = new Map<string, string>();
  const assessToTerm = new Map<string, string>();
  const assessmentIdSet = new Set(assessmentIds);

  for (const rr of allRelRecords) {
    const aId = assessmentIdSet.has(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
    const linkedId = aId === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
    if (rr.relationshipDefinitionId === subjectRel.id) assessToSubject.set(aId, linkedId);
    if (rr.relationshipDefinitionId === termRel.id) assessToTerm.set(aId, linkedId);
  }

  // Find assessments matching term (and subject, when provided)
  const matchedIds = assessmentIds.filter(aId =>
    assessToTerm.get(aId) === termId && (!subjectId || assessToSubject.get(aId) === subjectId)
  );

  if (matchedIds.length === 0) return c.json({ exams: [] });

  // Get field values to extract exam names and statuses
  const valuesMap = await batchGetFieldValues(matchedIds, fields);

  // Group by exam name
  const examMap = new Map<string, { name: string; count: number; gradedCount: number; statuses: Set<string> }>();
  for (const aId of matchedIds) {
    const vals = valuesMap.get(aId) || {};
    const examName = vals.assessment_name || vals.name || 'Unnamed Exam';
    const status = vals.status || 'Unknown';

    const existing = examMap.get(examName);
    if (existing) {
      existing.count++;
      existing.statuses.add(status);
      if (status === 'Graded' || status === 'Completed') existing.gradedCount++;
    } else {
      examMap.set(examName, {
        name: examName,
        count: 1,
        gradedCount: (status === 'Graded' || status === 'Completed') ? 1 : 0,
        statuses: new Set([status]),
      });
    }
  }

  const exams = [...examMap.values()].map(e => ({
    name: e.name,
    totalCount: e.count,
    gradedCount: e.gradedCount,
    statuses: [...e.statuses],
  }));

  return c.json({ exams });
});

// ─── Reporting: compute stats with filters ───

assessments.get('/report/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const classId = c.req.query('classId');
  const subjectId = c.req.query('subjectId');
  const termId = c.req.query('termId');
  const teacherId = c.req.query('teacherId');

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  const fields = await getFieldDefs(entityTypeId);

  // Fetch all assessment records for this school
  const allAssessments = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 2000,
  });

  if (allAssessments.length === 0) {
    return c.json({ records: [], stats: { total: 0, passRate: 0, avgScore: 0 } });
  }

  const assessmentIds = allAssessments.map(a => a.id);

  // Get all relevant relationship definitions
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const teacherTypeId = await getEntityTypeId(schoolId, 'teacher');
  const classTypeId = await getEntityTypeId(schoolId, 'class');

  const relDefs = await Promise.all([
    learnerTypeId ? findRelDef(schoolId, entityTypeId, learnerTypeId) : null,
    subjectTypeId ? findRelDef(schoolId, entityTypeId, subjectTypeId) : null,
    termTypeId ? findRelDef(schoolId, entityTypeId, termTypeId) : null,
    teacherTypeId ? findRelDef(schoolId, entityTypeId, teacherTypeId) : null,
    classTypeId ? findRelDef(schoolId, entityTypeId, classTypeId) : null,
  ]);
  const [learnerRel, subjectRel, termRel, teacherRel, classRel] = relDefs;

  // Batch fetch all relationship records
  const relDefIds = relDefs.filter(Boolean).map(r => r!.id);
  const allRelRecords = relDefIds.length > 0
    ? await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, inArray: i }) => a(
          inArray(rr.relationshipDefinitionId, relDefIds),
          or(inArray(rr.fromEntityRecordId, assessmentIds), inArray(rr.toEntityRecordId, assessmentIds)),
        ),
        columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
      })
    : [];

  // Build lookup maps: assessmentId → linked IDs per relationship type
  function buildRelMap(relDefId: string | null): Map<string, string> {
    const map = new Map<string, string>();
    if (!relDefId) return map;
    for (const rr of allRelRecords) {
      if (rr.relationshipDefinitionId !== relDefId) continue;
      const aId = assessmentIds.includes(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
      const linkedId = aId === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
      map.set(aId, linkedId);
    }
    return map;
  }

  const assessToLearner = buildRelMap(learnerRel?.id ?? null);
  const assessToSubject = buildRelMap(subjectRel?.id ?? null);
  const assessToTerm = buildRelMap(termRel?.id ?? null);
  const assessToTeacher = buildRelMap(teacherRel?.id ?? null);
  const assessToClass = buildRelMap(classRel?.id ?? null);

  // Apply filters
  let filteredIds = assessmentIds;

  if (subjectId) {
    filteredIds = filteredIds.filter(id => assessToSubject.get(id) === subjectId);
  }
  if (termId) {
    filteredIds = filteredIds.filter(id => assessToTerm.get(id) === termId);
  }
  if (classId) {
    filteredIds = filteredIds.filter(id => assessToClass.get(id) === classId);
  }
  if (teacherId) {
    filteredIds = filteredIds.filter(id => assessToTeacher.get(id) === teacherId);
  }

  // Get field values for filtered assessments
  const valuesMap = await batchGetFieldValues(filteredIds, fields);

  // Resolve display names for linked entities
  const allLinkedIds = new Set<string>();
  for (const id of filteredIds) {
    const l = assessToLearner.get(id); if (l) allLinkedIds.add(l);
    const s = assessToSubject.get(id); if (s) allLinkedIds.add(s);
    const t = assessToTerm.get(id); if (t) allLinkedIds.add(t);
    const c = assessToClass.get(id); if (c) allLinkedIds.add(c);
  }

  const displayNames = await resolveDisplayNames([...allLinkedIds]);

  // Compute stats
  let totalScore = 0;
  let scoreCount = 0;
  let passCount = 0;

  // Find the score field (prefer "score"; never max_score/weight)
  const scoreField = getScoreField(fields);

  const enrichedRecords = filteredIds.map(id => {
    const vals = valuesMap.get(id) || {};
    const score = scoreField && vals[scoreField.internalName] != null ? Number(vals[scoreField.internalName]) : null;
    const maxScore = vals.max_score ?? null;

    if (score !== null) {
      totalScore += Number(score);
      scoreCount++;
      if (maxScore !== null && Number(maxScore) > 0) {
        if (Number(score) / Number(maxScore) >= 0.5) passCount++;
      } else {
        passCount++; // no max score, assume pass
      }
    }

    return {
      id,
      values: vals,
      learnerName: displayNames.get(assessToLearner.get(id) || '') || null,
      subjectName: displayNames.get(assessToSubject.get(id) || '') || null,
      termName: displayNames.get(assessToTerm.get(id) || '') || null,
      className: displayNames.get(assessToClass.get(id) || '') || null,
      score,
      maxScore,
    };
  });

  const stats = {
    total: filteredIds.length,
    passRate: filteredIds.length > 0 ? Math.round((passCount / filteredIds.length) * 100) : 0,
    avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount * 10) / 10 : 0,
    passCount,
    scoreCount,
  };

  return c.json({ records: enrichedRecords, stats, fields });
});

// ─── Stats ───

assessments.get('/stats/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ total: 0, byStatus: {} });

  const records = await db.query.entityRecords.findMany({
    where: (er, { and: a, eq: e }) => a(e(er.schoolId, schoolId), e(er.entityTypeId, entityTypeId), e(er.isDeleted, false)),
    limit: 2000,
  });

  if (records.length === 0) return c.json({ total: 0, byStatus: {} });

  const recordIds = records.map(r => r.id);
  const fields = await getFieldDefs(entityTypeId);
  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { and: a, inArray: i }) => a(a(eq(fv.schoolId, schoolId)), i(fv.entityRecordId, recordIds)),
    columns: {
      entityRecordId: true, fieldDefinitionId: true,
      textValue: true, numericValue: true, dateValue: true, booleanValue: true, fileValue: true,
    },
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

  const byStatus: Record<string, number> = {};
  for (const r of records) {
    const vals = valueMap.get(r.id) || {};
    const status = vals.status || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  return c.json({ total: records.length, byStatus });
});

// ─── Version ───

assessments.get('/version/:schoolId', async (c) => {
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
  // Score edits only touch field_values (not entity_records.updated_at), so include
  // this marker for the frontend's stale-while-revalidate cache on the results tree.
  const fv = await db.execute(sql`
    SELECT MAX(updated_at) as last FROM field_values WHERE school_id = ${schoolId}
  `);
  const fieldValuesUpdatedAt = (fv.rows as any[])[0]?.last ?? null;
  return c.json({ versions: map, fieldValuesUpdatedAt });
});

// ─── Widget Config ───

assessments.get('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  return c.json({ widgets: (school?.settings as any)?.assessmentWidgets || null });
});

assessments.put('/widgets/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const { widgets } = await c.req.json();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const settings = (school?.settings as any) || {};
  settings.assessmentWidgets = widgets;
  await db.update(schools).set({ settings }).where(eq(schools.id, schoolId));
  return c.json({ success: true });
});

// ─── Import ───

assessments.post('/import/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { records: importRecords } = body as { records: any[] };

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

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
      console.warn('[assessments] Import row failed:', err);
      skipped++;
    }
  }

  return c.json({ imported, skipped });
});

// ─── Pivot: dynamic group-by aggregation ───

assessments.get('/pivot/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const groupBy = c.req.query('groupBy') || 'class'; // class, subject, term, learner, exam_name
  const classId = c.req.query('classId');
  const subjectId = c.req.query('subjectId');
  const termId = c.req.query('termId');
  const learnerId = c.req.query('learnerId');

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ groups: [], meta: { groupBy, totalRecords: 0 } });

  const fields = await getFieldDefs(entityTypeId);

  // Fetch all assessment records
  const allAssessments = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 2000,
  });

  if (allAssessments.length === 0) {
    return c.json({ groups: [], meta: { groupBy, totalRecords: 0 } });
  }

  const assessmentIds = allAssessments.map(a => a.id);

  // Get all relevant relationship definitions
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const classTypeId = await getEntityTypeId(schoolId, 'class');

  const relDefs = await Promise.all([
    learnerTypeId ? findRelDef(schoolId, entityTypeId, learnerTypeId) : null,
    subjectTypeId ? findRelDef(schoolId, entityTypeId, subjectTypeId) : null,
    termTypeId ? findRelDef(schoolId, entityTypeId, termTypeId) : null,
    classTypeId ? findRelDef(schoolId, entityTypeId, classTypeId) : null,
  ]);
  const [learnerRel, subjectRel, termRel, classRel] = relDefs;

  // Batch fetch all relationship records
  const relDefIds = relDefs.filter(Boolean).map(r => r!.id);
  const allRelRecords = relDefIds.length > 0
    ? await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, inArray: i }) => a(
          inArray(rr.relationshipDefinitionId, relDefIds),
          or(inArray(rr.fromEntityRecordId, assessmentIds), inArray(rr.toEntityRecordId, assessmentIds)),
        ),
        columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
      })
    : [];

  // Build lookup maps
  function buildRelMap(relDefId: string | null): Map<string, string> {
    const map = new Map<string, string>();
    if (!relDefId) return map;
    for (const rr of allRelRecords) {
      if (rr.relationshipDefinitionId !== relDefId) continue;
      const aId = assessmentIds.includes(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
      const linkedId = aId === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
      map.set(aId, linkedId);
    }
    return map;
  }

  const assessToLearner = buildRelMap(learnerRel?.id ?? null);
  const assessToSubject = buildRelMap(subjectRel?.id ?? null);
  const assessToTerm = buildRelMap(termRel?.id ?? null);
  const assessToClass = buildRelMap(classRel?.id ?? null);

  // Apply filters
  let filteredIds = assessmentIds;
  if (subjectId) filteredIds = filteredIds.filter(id => assessToSubject.get(id) === subjectId);
  if (termId) filteredIds = filteredIds.filter(id => assessToTerm.get(id) === termId);
  if (classId) filteredIds = filteredIds.filter(id => assessToClass.get(id) === classId);
  if (learnerId) filteredIds = filteredIds.filter(id => assessToLearner.get(id) === learnerId);

  // Get field values for filtered assessments
  const valuesMap = await batchGetFieldValues(filteredIds, fields);

  // Resolve display names for all linked entities
  const allLinkedIds = new Set<string>();
  for (const id of filteredIds) {
    const l = assessToLearner.get(id); if (l) allLinkedIds.add(l);
    const s = assessToSubject.get(id); if (s) allLinkedIds.add(s);
    const t = assessToTerm.get(id); if (t) allLinkedIds.add(t);
    const cl = assessToClass.get(id); if (cl) allLinkedIds.add(cl);
  }

  const displayNames = await resolveDisplayNames([...allLinkedIds]);

  // Find the score field (prefer "score"; never max_score/weight)
  const scoreField = getScoreField(fields);

  // Build enriched records with group keys
  const enrichedRecords = filteredIds.map(id => {
    const vals = valuesMap.get(id) || {};
    const score = scoreField && vals[scoreField.internalName] != null ? Number(vals[scoreField.internalName]) : null;
    const maxScore = vals.max_score ?? null;

    // Determine group key based on groupBy
    let groupKey: string;
    let groupId: string | null = null;
    switch (groupBy) {
      case 'learner':
        groupId = assessToLearner.get(id) || null;
        groupKey = groupId ? (displayNames.get(groupId) || 'Unknown Learner') : 'Unknown Learner';
        break;
      case 'subject':
        groupId = assessToSubject.get(id) || null;
        groupKey = groupId ? (displayNames.get(groupId) || 'Unknown Subject') : 'Unknown Subject';
        break;
      case 'term':
        groupId = assessToTerm.get(id) || null;
        groupKey = groupId ? (displayNames.get(groupId) || 'Unknown Term') : 'Unknown Term';
        break;
      case 'class':
        groupId = assessToClass.get(id) || null;
        groupKey = groupId ? (displayNames.get(groupId) || 'Unknown Class') : 'Unknown Class';
        break;
      case 'exam_name':
        groupKey = vals.assessment_name || vals.name || 'Unnamed Exam';
        groupId = null;
        break;
      default:
        groupKey = 'All';
        groupId = null;
    }

    return { id, groupKey, groupId, score, maxScore, vals };
  });

  // Group records and compute aggregates per group
  const groupMap = new Map<string, typeof enrichedRecords>();
  for (const r of enrichedRecords) {
    const arr = groupMap.get(r.groupKey);
    if (arr) arr.push(r);
    else groupMap.set(r.groupKey, [r]);
  }

  const groups = [...groupMap.entries()].map(([label, records]) => {
    let totalScore = 0;
    let scoreCount = 0;
    let passCount = 0;
    const scores: number[] = [];
    let minScore: number | null = null;
    let maxScoreVal: number | null = null;

    for (const r of records) {
      if (r.score !== null) {
        totalScore += Number(r.score);
        scores.push(Number(r.score));
        scoreCount++;
        minScore = minScore === null ? Number(r.score) : Math.min(minScore, Number(r.score));
        maxScoreVal = maxScoreVal === null ? Number(r.score) : Math.max(maxScoreVal, Number(r.score));
        if (r.maxScore !== null && Number(r.maxScore) > 0) {
          if (Number(r.score) / Number(r.maxScore) >= 0.5) passCount++;
        } else {
          passCount++;
        }
      }
    }

    const groupId = records[0]?.groupId || null;
    const median = medianOf(scores);

    return {
      label,
      groupId,
      count: records.length,
      avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount * 10) / 10 : 0,
      sumScore: Math.round(totalScore * 100) / 100,
      medianScore: median !== null ? Math.round(median * 10) / 10 : null,
      minScore,
      maxScore: maxScoreVal,
      passRate: records.length > 0 ? Math.round((passCount / records.length) * 100) : 0,
      scoreCount,
      passCount,
    };
  });

  // Sort groups by count descending
  groups.sort((a, b) => b.count - a.count);

  return c.json({
    groups,
    meta: {
      groupBy,
      totalRecords: filteredIds.length,
      filters: { classId: classId || null, subjectId: subjectId || null, termId: termId || null, learnerId: learnerId || null },
    },
  });
});

// ─── Exam Create: create shell records for an exam (Status = Scheduled) ───
// One record per learner per subject. Max scores and optional weights are
// stored as ordinary fields on the records; the overall max is never stored.
// All writes are batched so creating 100s of records takes a handful of queries.

assessments.post('/exam-create/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { name, termId, classIds, learnerIds } = body as {
    name: string;
    termId: string;
    classIds?: string[];
    learnerIds?: string[];
    // Optional exam date — stored on every record, shown as "the time" in All Results
    date?: string;
    // New shape: multi-subject with per-subject max/weight
    subjects?: Array<{ subjectId: string; maxScore?: number | string | null; weight?: number | string | null }>;
    defaultMax?: number | string | null;
    // Legacy shape: single subject
    subjectId?: string;
  };
  const examDate = typeof (body as any).date === 'string' && (body as any).date.trim() !== ''
    ? (body as any).date.trim() : null;

  // Accept both the multi-subject shape and the legacy single-subject shape
  let subjectsInput: Array<{ subjectId: string; maxScore?: number | string | null; weight?: number | string | null }> = [];
  if (Array.isArray((body as any).subjects) && (body as any).subjects.length > 0) {
    subjectsInput = (body as any).subjects.filter((s: any) => s && s.subjectId);
  } else if ((body as any).subjectId) {
    subjectsInput = [{ subjectId: (body as any).subjectId, maxScore: (body as any).defaultMax ?? null }];
  }

  if (!name || !termId || subjectsInput.length === 0) {
    return c.json({ error: 'name, termId, and at least one subject are required' }, 400);
  }

  const defaultMaxRaw = (body as any).defaultMax;
  const defaultMax = defaultMaxRaw !== undefined && defaultMaxRaw !== null && defaultMaxRaw !== ''
    ? Number(defaultMaxRaw) : null;

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  // Score / Max Score / Weight are ordinary fields — create them if missing
  const fields = await ensureExamFields(schoolId, entityTypeId);
  const scoreField = getScoreField(fields);
  if (!scoreField) {
    return c.json({ error: 'No numeric score field available on assessments' }, 500);
  }

  // Resolve relationship definitions
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const classTypeId = await getEntityTypeId(schoolId, 'class');

  const [learnerRel, subjectRel, termRel, classRel] = await Promise.all([
    learnerTypeId ? findRelDef(schoolId, entityTypeId, learnerTypeId) : null,
    subjectTypeId ? findRelDef(schoolId, entityTypeId, subjectTypeId) : null,
    termTypeId ? findRelDef(schoolId, entityTypeId, termTypeId) : null,
    classTypeId ? findRelDef(schoolId, entityTypeId, classTypeId) : null,
  ]);

  // Resolve target learners — a single query for all class rosters.
  // Also records each learner's own class(es) so each exam record links to the
  // class the student actually sits in (not every selected class).
  let targetLearnerIds: string[] = [];
  const ownClassesByLearner = new Map<string, string[]>();

  if (Array.isArray(learnerIds) && learnerIds.length > 0) {
    targetLearnerIds = [...new Set(learnerIds)];
  }

  if (Array.isArray(classIds) && classIds.length > 0 && classTypeId && learnerTypeId) {
    const classLearnerRel = await findRelDef(schoolId, classTypeId, learnerTypeId);
    if (classLearnerRel) {
      const rosterRels = await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, inArray: i, or: o }) => a(
          a(eq(rr.relationshipDefinitionId, classLearnerRel.id)),
          o(i(rr.fromEntityRecordId, classIds), i(rr.toEntityRecordId, classIds)),
        ),
      });
      const cidSet = new Set(classIds);
      const seen = new Set<string>();
      for (const rr of rosterRels) {
        const fromIsClass = cidSet.has(rr.fromEntityRecordId);
        const toIsClass = cidSet.has(rr.toEntityRecordId);
        if (!fromIsClass && !toIsClass) continue;
        const cid = fromIsClass ? rr.fromEntityRecordId : rr.toEntityRecordId;
        const lid = fromIsClass ? rr.toEntityRecordId : rr.fromEntityRecordId;

        const own = ownClassesByLearner.get(lid) || [];
        if (!own.includes(cid)) { own.push(cid); ownClassesByLearner.set(lid, own); }

        if (learnerIds && learnerIds.length > 0) continue; // explicit list already set targets
        if (!seen.has(lid)) { seen.add(lid); targetLearnerIds.push(lid); }
      }
    }
  }

  if (targetLearnerIds.length === 0) {
    return c.json({ error: 'No learners found. Provide classIds or learnerIds.' }, 400);
  }

  // One record per learner per subject
  const pairs: Array<{ learnerId: string; subjectId: string; max: number | null; weight: number | null }> = [];
  for (const s of subjectsInput) {
    const ownMax = s.maxScore !== undefined && s.maxScore !== null && s.maxScore !== '' ? Number(s.maxScore) : null;
    const ownWeight = s.weight !== undefined && s.weight !== null && s.weight !== '' ? Number(s.weight) : null;
    for (const learnerId of targetLearnerIds) {
      pairs.push({ learnerId, subjectId: s.subjectId, max: ownMax ?? defaultMax, weight: ownWeight });
    }
  }

  // Batched writes: records → field values → relationship rows
  const recordIds = await insertRecordsBatch(schoolId, entityTypeId, pairs.length);

  const valueEntries = pairs.map((p, i) => ({
    recordId: recordIds[i],
    values: {
      assessment_name: name,
      status: 'Scheduled',
      // score intentionally left empty until scores are entered
      ...(examDate ? { date: examDate } : {}),
      ...(p.max !== null ? { max_score: p.max } : {}),
      ...(p.weight !== null ? { weight: p.weight } : {}),
    },
  }));
  await bulkUpsertFieldValues(schoolId, valueEntries, fields);

  const links: LinkSpec[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const rid = recordIds[i];
    const l = makeLink(learnerRel, entityTypeId, rid, p.learnerId); if (l) links.push(l);
    const s = makeLink(subjectRel, entityTypeId, rid, p.subjectId); if (s) links.push(s);
    const t = makeLink(termRel, entityTypeId, rid, termId); if (t) links.push(t);
    if (classRel && Array.isArray(classIds) && classIds.length > 0) {
      // Link the class the student actually belongs to (from the roster);
      // fall back to all selected classes when no roster row exists.
      const own = ownClassesByLearner.get(p.learnerId);
      if (own && own.length > 0) {
        for (const cid of own) {
          const cl = makeLink(classRel, entityTypeId, rid, cid); if (cl) links.push(cl);
        }
      } else {
        for (const cid of classIds) {
          const cl = makeLink(classRel, entityTypeId, rid, cid); if (cl) links.push(cl);
        }
      }
    }
  }
  await bulkInsertLinks(schoolId, links);

  return c.json({
    success: true,
    created: recordIds.length,
    learners: targetLearnerIds.length,
    subjects: subjectsInput.length,
    name,
    status: 'Scheduled',
  }, 201);
});

// ─── Grade Scale: school-defined bands, stored in school settings ───
// Grades are always derived from percentage at read time — never stored.

assessments.get('/grade-scale/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const bands = await getGradeScale(schoolId);
  return c.json({ bands });
});

assessments.put('/grade-scale/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const bands = normalizeBands(body?.bands);
  if (bands === null) {
    return c.json({ error: 'bands must be an array of { label, min, max, remark? }' }, 400);
  }

  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  if (!school) return c.json({ error: 'School not found' }, 404);

  const settings = (school.settings as any) || {};
  settings.gradeScale = bands;
  await db.update(schools).set({ settings, updatedAt: new Date() }).where(eq(schools.id, schoolId));

  return c.json({ success: true, bands });
});

// ─── Exam Load: all subjects × learners for one exam (Term + Exam name) ───

assessments.get('/exam-load/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const termId = c.req.query('termId');
  const examName = c.req.query('examName');
  const classId = c.req.query('classId'); // optional roster filter

  if (!termId || !examName) {
    return c.json({ error: 'termId and examName query params required' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  // Field defs and grade scale are independent — fetch them together
  const [fields, gradeScale] = await Promise.all([
    getFieldDefs(entityTypeId),
    getGradeScale(schoolId),
  ]);
  const scoreField = getScoreField(fields);

  const ctx = await loadExamContext(schoolId, entityTypeId, fields, termId, examName);
  if (ctx.matchedIds.length === 0) {
    return c.json({ subjects: [], learners: [], cells: {}, gradeScale, scoreField: scoreField?.internalName || 'score' });
  }

  // Subjects with their max/weight (stored as ordinary fields on the records)
  const subjectIdSet = new Set<string>();
  for (const id of ctx.matchedIds) {
    const sid = ctx.assessToSubject.get(id);
    if (sid) subjectIdSet.add(sid);
  }

  // Learners sitting this exam (optionally filtered by class link)
  const learnerIdSet = new Set<string>();
  for (const id of ctx.matchedIds) {
    const lid = ctx.assessToLearner.get(id);
    if (!lid) continue;
    if (classId && !(ctx.assessToClasses.get(id) || []).includes(classId)) continue;
    learnerIdSet.add(lid);
  }

  // Classes linked to this exam
  const classIdSet = new Set<string>();
  for (const id of ctx.matchedIds) {
    for (const cid of ctx.assessToClasses.get(id) || []) classIdSet.add(cid);
  }

  // One batched display-name pass for subjects + learners + classes
  const allLinkedIds = [...subjectIdSet, ...learnerIdSet, ...classIdSet];
  const displayNames = await resolveDisplayNames(allLinkedIds);

  const subjects = [...subjectIdSet].map(sid => {
    const sampleId = ctx.matchedIds.find(id => ctx.assessToSubject.get(id) === sid);
    const vals = sampleId ? (ctx.valuesMap.get(sampleId) || {}) : {};
    return {
      id: sid,
      name: displayNames.get(sid) || 'Subject',
      maxScore: vals.max_score ?? null,
      weight: vals.weight ?? null,
    };
  });

  const learners = [...learnerIdSet].map(lid => ({ id: lid, name: displayNames.get(lid) || 'Learner' }));

  // Cells: learnerId → subjectId → { score, assessmentId }
  const cells: Record<string, Record<string, { score: any; assessmentId: string }>> = {};
  for (const id of ctx.matchedIds) {
    const lid = ctx.assessToLearner.get(id);
    const sid = ctx.assessToSubject.get(id);
    if (!lid || !sid || !learnerIdSet.has(lid)) continue;
    const vals = ctx.valuesMap.get(id) || {};
    if (!cells[lid]) cells[lid] = {};
    cells[lid][sid] = {
      score: scoreField ? (vals[scoreField.internalName] ?? null) : null,
      assessmentId: id,
    };
  }

  const classes = [...classIdSet].map(cid => ({ id: cid, name: displayNames.get(cid) || 'Class' }));

  return c.json({
    subjects,
    learners,
    classes,
    cells,
    gradeScale,
    scoreField: scoreField?.internalName || 'score',
  });
});

// ─── Exam Save: write scores for an exam (Term + Exam name) in batch ───
// Body: { termId, examName, scores: { [learnerId]: { [subjectId]: score | '' } } }

assessments.post('/exam-save/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const body = await c.req.json();
  const { termId, examName, scores } = body as {
    termId: string;
    examName: string;
    scores: Record<string, Record<string, any>>;
  };

  if (!termId || !examName || !scores || typeof scores !== 'object') {
    return c.json({ error: 'termId, examName and scores are required' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  const fields = await ensureExamFields(schoolId, entityTypeId);
  const scoreField = getScoreField(fields);
  if (!scoreField) return c.json({ error: 'No numeric score field available on assessments' }, 500);

  const ctx = await loadExamContext(schoolId, entityTypeId, fields, termId, examName, { needClasses: false });

  // Map (learner, subject) → existing record
  const recordByKey = new Map<string, string>();
  for (const id of ctx.matchedIds) {
    const lid = ctx.assessToLearner.get(id);
    const sid = ctx.assessToSubject.get(id);
    if (lid && sid) recordByKey.set(`${lid}:${sid}`, id);
  }

  const updateEntries: Array<{ recordId: string; values: Record<string, any> }> = [];
  const createPairs: Array<{ learnerId: string; subjectId: string; score: any }> = [];
  const invalid: Array<{ learnerId: string; subjectId: string; reason: string }> = [];

  // Per-subject ceiling: max_score stored on each existing record of this exam
  const maxBySubject = new Map<string, number>();
  for (const id of ctx.matchedIds) {
    const sid = ctx.assessToSubject.get(id);
    if (!sid || maxBySubject.has(sid)) continue;
    const m = ctx.valuesMap.get(id)?.max_score;
    if (m !== null && m !== undefined && m !== '' && !isNaN(Number(m))) maxBySubject.set(sid, Number(m));
  }

  for (const [learnerId, perSubject] of Object.entries(scores)) {
    if (!perSubject || typeof perSubject !== 'object') continue;
    for (const [subjectId, score] of Object.entries(perSubject)) {
      const raw = score === null || score === undefined ? '' : String(score).trim();
      // Score rules: must be a number, never negative, never above the subject's max.
      if (raw !== '') {
        const n = Number(raw);
        let reason: string | null = null;
        if (!isFinite(n)) reason = `"${raw}" is not a number`;
        else if (n < 0) reason = `${raw} is negative — scores cannot be below 0`;
        else {
          const max = maxBySubject.get(subjectId);
          if (max !== undefined && n > max) reason = `${raw} exceeds the maximum of ${max}`;
        }
        if (reason) { invalid.push({ learnerId, subjectId, reason }); continue; }
      }

      const rid = recordByKey.get(`${learnerId}:${subjectId}`);
      if (rid) {
        updateEntries.push({ recordId: rid, values: { [scoreField.internalName]: score } });
      } else if (raw !== '') {
        createPairs.push({ learnerId, subjectId, score });
      }
    }
  }

  if (invalid.length > 0) {
    // Resolve display names only on the error path (few ids)
    const ids = [...new Set(invalid.flatMap(v => [v.learnerId, v.subjectId]))];
    const names = await resolveDisplayNames(ids);
    const shown = invalid.slice(0, 5).map(v =>
      `${names.get(v.learnerId) || 'Learner'} / ${names.get(v.subjectId) || 'subject'}: ${v.reason}`);
    const more = invalid.length > shown.length ? ` (+${invalid.length - shown.length} more)` : '';
    return c.json({ error: `Invalid score — ${shown.join('; ')}${more}` }, 400);
  }

  await bulkUpsertFieldValues(schoolId, updateEntries, fields, true);

  let created = 0;
  if (createPairs.length > 0) {
    const newIds = await insertRecordsBatch(schoolId, entityTypeId, createPairs.length);
    await bulkUpsertFieldValues(
      schoolId,
      createPairs.map((p, i) => ({
        recordId: newIds[i],
        values: {
          assessment_name: examName,
          status: 'Scheduled',
          [scoreField.internalName]: p.score,
        },
      })),
      fields,
    );

    const learnerRel = ctx.learnerRel;
    const subjectRel = ctx.subjectRel;
    const termRel = ctx.termRel;
    const links: LinkSpec[] = [];
    for (let i = 0; i < createPairs.length; i++) {
      const rid = newIds[i];
      const l = makeLink(learnerRel, entityTypeId, rid, createPairs[i].learnerId); if (l) links.push(l);
      const s = makeLink(subjectRel, entityTypeId, rid, createPairs[i].subjectId); if (s) links.push(s);
      const t = makeLink(termRel, entityTypeId, rid, termId); if (t) links.push(t);
    }
    await bulkInsertLinks(schoolId, links);
    created = createPairs.length;
  }

  return c.json({ success: true, created, updated: updateEntries.length });
});

// ─── Student Report: per-student exam report with class stats (avg, median, rank) ───

assessments.get('/student-report/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const termId = c.req.query('termId');
  const examName = c.req.query('examName');
  const learnerId = c.req.query('learnerId');

  if (!termId || !examName || !learnerId) {
    return c.json({ error: 'termId, examName and learnerId query params required' }, 400);
  }

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ error: 'Assessment entity type not found' }, 404);

  // Field defs and grade scale are independent — fetch them together
  const [fields, gradeScale] = await Promise.all([
    getFieldDefs(entityTypeId),
    getGradeScale(schoolId),
  ]);
  const scoreField = getScoreField(fields);

  const ctx = await loadExamContext(schoolId, entityTypeId, fields, termId, examName);

  // Group exam records by learner → subject
  const perLearner = new Map<string, Array<{ subjectId: string | null; score: number | null; max: number | null; weight: number | null }>>();
  for (const id of ctx.matchedIds) {
    const lid = ctx.assessToLearner.get(id);
    if (!lid) continue;
    const vals = ctx.valuesMap.get(id) || {};
    const arr = perLearner.get(lid) || [];
    arr.push({
      subjectId: ctx.assessToSubject.get(id) || null,
      score: scoreField && vals[scoreField.internalName] != null ? Number(vals[scoreField.internalName]) : null,
      max: vals.max_score != null ? Number(vals.max_score) : null,
      weight: vals.weight != null ? Number(vals.weight) : null,
    });
    perLearner.set(lid, arr);
  }

  const targetSubjects = perLearner.get(learnerId) || [];
  if (targetSubjects.length === 0) {
    return c.json({ error: 'No exam records found for this student' }, 404);
  }

  // Overall totals for every learner in the exam
  const overallByLearner = new Map<string, { sum: number; max: number; pct: number | null }>();
  for (const [lid, subs] of perLearner) {
    overallByLearner.set(lid, computeOverall(subs));
  }

  // Class scope: the target student's class(es); everyone in the exam in those classes
  const targetClassIds = new Set<string>();
  for (const id of ctx.matchedIds) {
    if (ctx.assessToLearner.get(id) === learnerId) {
      for (const cid of ctx.assessToClasses.get(id) || []) targetClassIds.add(cid);
    }
  }

  const peerIds = [...perLearner.keys()].filter(lid => {
    if (targetClassIds.size === 0) return true; // no class links → rank within the whole exam
    for (const id of ctx.matchedIds) {
      if (ctx.assessToLearner.get(id) !== lid) continue;
      for (const cid of ctx.assessToClasses.get(id) || []) {
        if (targetClassIds.has(cid)) return true;
      }
    }
    return false;
  });

  // Class stats over learners who have a computable overall %
  const peerPcts = peerIds
    .map(lid => overallByLearner.get(lid)?.pct)
    .filter((p): p is number => p !== null && p !== undefined);

  const targetPct = overallByLearner.get(learnerId)?.pct ?? null;
  // Standard competition ranking: ties share a position (1, 2, 2, 4)
  const rank = targetPct === null
    ? null
    : 1 + peerPcts.filter(p => p > targetPct!).length;

  const displayNames = await resolveDisplayNames([
    learnerId,
    ...targetClassIds,
    ...targetSubjects.map(s => s.subjectId).filter(Boolean) as string[],
  ]);
  const learnerNames = displayNames;
  const subjectNames = displayNames;
  const classNames = displayNames;

  const targetOverall = overallByLearner.get(learnerId) || { sum: 0, max: 0, pct: null };

  return c.json({
    student: { id: learnerId, name: learnerNames.get(learnerId) || 'Learner' },
    exam: { name: examName, termId },
    classes: [...targetClassIds].map(cid => ({ id: cid, name: classNames.get(cid) || 'Class' })),
    subjects: targetSubjects.map(s => {
      const pct = pctOf(s.score, s.max);
      return {
        subjectId: s.subjectId,
        subjectName: s.subjectId ? (subjectNames.get(s.subjectId) || 'Subject') : 'Subject',
        score: s.score,
        max: s.max,
        weight: s.weight,
        pct,
        grade: deriveGrade(pct, gradeScale),
      };
    }),
    totals: {
      sum: targetOverall.sum,
      max: targetOverall.max,
      pct: targetOverall.pct,
      grade: deriveGrade(targetOverall.pct, gradeScale),
    },
    classStats: {
      students: peerPcts.length,
      averagePct: peerPcts.length > 0
        ? Math.round((peerPcts.reduce((a, b) => a + b, 0) / peerPcts.length) * 10) / 10
        : null,
      medianPct: medianOf(peerPcts),
      rank,
    },
    gradeScale,
  });
});

// ─── All Results: flat records with full relationship data for tree building ───

assessments.get('/all-results/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const termId = c.req.query('termId');
  const subjectId = c.req.query('subjectId');
  const classId = c.req.query('classId');

  const entityTypeId = await getEntityTypeId(schoolId, 'assessment');
  if (!entityTypeId) return c.json({ records: [] });

  const fields = await getFieldDefs(entityTypeId);

  // Fetch all assessment records
  const allAssessments = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false),
    ),
    limit: 2000,
  });

  if (allAssessments.length === 0) return c.json({ records: [] });

  const assessmentIds = allAssessments.map(a => a.id);

  // Get all relevant relationship definitions
  const learnerTypeId = await getEntityTypeId(schoolId, 'learner');
  const subjectTypeId = await getEntityTypeId(schoolId, 'subject');
  const termTypeId = await getEntityTypeId(schoolId, 'term');
  const classTypeId = await getEntityTypeId(schoolId, 'class');

  const relDefs = await Promise.all([
    learnerTypeId ? findRelDef(schoolId, entityTypeId, learnerTypeId) : null,
    subjectTypeId ? findRelDef(schoolId, entityTypeId, subjectTypeId) : null,
    termTypeId ? findRelDef(schoolId, entityTypeId, termTypeId) : null,
    classTypeId ? findRelDef(schoolId, entityTypeId, classTypeId) : null,
  ]);
  const [learnerRel, subjectRel, termRel, classRel] = relDefs;

  // Batch fetch all relationship records
  const relDefIds = relDefs.filter(Boolean).map(r => r!.id);
  const allRelRecords = relDefIds.length > 0
    ? await db.query.relationshipRecords.findMany({
        where: (rr, { and: a, inArray: i }) => a(
          inArray(rr.relationshipDefinitionId, relDefIds),
          or(inArray(rr.fromEntityRecordId, assessmentIds), inArray(rr.toEntityRecordId, assessmentIds)),
        ),
        columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
      })
    : [];

  // Build lookup maps
  function buildRelMap(relDefId: string | null): Map<string, string> {
    const map = new Map<string, string>();
    if (!relDefId) return map;
    for (const rr of allRelRecords) {
      if (rr.relationshipDefinitionId !== relDefId) continue;
      const aId = assessmentIds.includes(rr.fromEntityRecordId) ? rr.fromEntityRecordId : rr.toEntityRecordId;
      const linkedId = aId === rr.fromEntityRecordId ? rr.toEntityRecordId : rr.fromEntityRecordId;
      map.set(aId, linkedId);
    }
    return map;
  }

  const assessToLearner = buildRelMap(learnerRel?.id ?? null);
  const assessToSubject = buildRelMap(subjectRel?.id ?? null);
  const assessToTerm = buildRelMap(termRel?.id ?? null);
  const assessToClass = buildRelMap(classRel?.id ?? null);

  // Apply optional filters
  let filteredIds = assessmentIds;
  if (subjectId) filteredIds = filteredIds.filter(id => assessToSubject.get(id) === subjectId);
  if (termId) filteredIds = filteredIds.filter(id => assessToTerm.get(id) === termId);
  if (classId) filteredIds = filteredIds.filter(id => assessToClass.get(id) === classId);

  // Get field values
  const valuesMap = await batchGetFieldValues(filteredIds, fields);

  // Resolve display names
  const allLinkedIds = new Set<string>();
  for (const id of filteredIds) {
    const l = assessToLearner.get(id); if (l) allLinkedIds.add(l);
    const s = assessToSubject.get(id); if (s) allLinkedIds.add(s);
    const t = assessToTerm.get(id); if (t) allLinkedIds.add(t);
    const cl = assessToClass.get(id); if (cl) allLinkedIds.add(cl);
  }

  const displayNames = await resolveDisplayNames([...allLinkedIds]);

  // Find the score field (prefer "score"; never max_score/weight)
  const scoreField = getScoreField(fields);

  const result = filteredIds.map(id => {
    const vals = valuesMap.get(id) || {};
    const score = scoreField && vals[scoreField.internalName] != null ? Number(vals[scoreField.internalName]) : null;
    const maxScore = vals.max_score ?? null;

    return {
      id,
      values: vals,
      score,
      maxScore,
      status: vals.status || null,
      examName: vals.assessment_name || vals.name || null,
      learnerId: assessToLearner.get(id) || null,
      learnerName: displayNames.get(assessToLearner.get(id) || '') || null,
      subjectId: assessToSubject.get(id) || null,
      subjectName: displayNames.get(assessToSubject.get(id) || '') || null,
      termId: assessToTerm.get(id) || null,
      termName: displayNames.get(assessToTerm.get(id) || '') || null,
      classId: assessToClass.get(id) || null,
      className: displayNames.get(assessToClass.get(id) || '') || null,
    };
  });

  return c.json({ records: result });
});

export default assessments;

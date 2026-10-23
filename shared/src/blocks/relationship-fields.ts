// Relationship-as-Field — Shared helpers for treating relationships as first-class fields
// Used by both backend API routes and (indirectly) frontend components
//
// PERFORMANCE: Uses a unified resolveAllRelationshipData() that does 5 queries total
// (shared across counts + values + field defs), instead of the previous 9+ separate queries.
// batchGetRosterCounts is standalone: 2 queries.

import { db } from '../../../api/src/db';
import {
  entityTypes,
  fieldDefinitions,
  fieldValues,
  relationshipDefinitions,
  relationshipRecords,
} from '../../../drizzle/schema';
import { eq, and, or, inArray } from 'drizzle-orm';

// ─── Unified Batch Resolution ─────────────────────────────────────

/**
 * Result returned by resolveAllRelationshipData — everything the list endpoints need.
 */
export interface RelationshipDataResult {
  /** Virtual field definitions for the field list / widget picker / column picker */
  relFields: Array<Record<string, any>>;
  /** Map: recordId → { __rel_<defId>: displayName } for each relationship */
  relValues: Map<string, Record<string, string>>;
  /** Map: recordId → { [targetEntityName]: count } for quick count lookups */
  relCounts: Map<string, Record<string, number>>;
}

/**
 * Unified batch resolver — fetches everything in 5 shared queries:
 *   1. relationshipDefinitions involving this entity type (shared by fields + counts + values)
 *   2. entityTypes for all targets (shared by fields + counts + values)
 *   3. fieldDefinitions for target types (for display-name resolution)
 *   4. ALL relationshipRecords for all rel defs + recordIds (shared by counts + values)
 *   5. ALL fieldValues for display-name resolution
 *
 * This replaces the previous getRelationshipFields() + batchGetRelationshipCounts() +
 * resolveRelationshipValues() trio which ran 9+ queries with redundant fetches.
 */
export async function resolveAllRelationshipData(
  schoolId: string,
  recordIds: string[],
  entityTypeId: string,
  countTargetNames?: string[], // e.g. ['subject', 'class'] for __subjects_count, __classes_count
): Promise<RelationshipDataResult> {
  const emptyResult: RelationshipDataResult = {
    relFields: [],
    relValues: new Map(),
    relCounts: new Map(),
  };

  // Initialize counts map
  const relCounts = new Map<string, Record<string, number>>();
  for (const rid of recordIds) relCounts.set(rid, {});

  // Initialize values map
  const relValues = new Map<string, Record<string, string>>();
  for (const rid of recordIds) relValues.set(rid, {});

  if (recordIds.length === 0) return emptyResult;

  // ─── Query 1: Relationship definitions involving this entity type ───
  const relDefs = await db.query.relationshipDefinitions.findMany({
    where: (rd, { and: a, eq: e, or: o }) => a(
      e(rd.schoolId, schoolId),
      a(o(e(rd.fromEntityTypeId, entityTypeId), e(rd.toEntityTypeId, entityTypeId)), e(rd.isActive, true)),
    ),
  });

  if (relDefs.length === 0) return emptyResult;

  // ─── Query 2: Target entity types ───
  const targetTypeIds = [...new Set(
    relDefs.flatMap(rd => [rd.fromEntityTypeId, rd.toEntityTypeId])
  )].filter(id => id !== entityTypeId);

  const allTargetTypes = targetTypeIds.length > 0
    ? await db.query.entityTypes.findMany({
        where: (et, { inArray: i }) => i(et.id, targetTypeIds),
      })
    : [];
  const targetTypeMap = new Map(allTargetTypes.map(t => [t.id, t]));

  // Build countTargetName → typeId mapping (for counts)
  const countTargetNameMap = new Map<string, string>(); // name → typeId
  if (countTargetNames && countTargetNames.length > 0) {
    const nameTypes = allTargetTypes.filter(t => countTargetNames.includes(t.internalName));
    for (const t of nameTypes) countTargetNameMap.set(t.internalName, t.id);
  }

  // ─── Query 3: Field definitions for target types (display name resolution) ───
  const allTargetFields = targetTypeIds.length > 0
    ? await db.query.fieldDefinitions.findMany({
        where: (fd, { inArray: i }) => i(fd.entityTypeId, targetTypeIds),
      })
    : [];

  // Build display field per target entity type
  const displayFieldMap = new Map<string, typeof allTargetFields[0]>();
  for (const targetTypeId of targetTypeIds) {
    const fields = allTargetFields.filter(f => f.entityTypeId === targetTypeId);
    const displayField =
      fields.find(f => f.isIdentifier) ||
      fields.find(f => f.internalName === 'name' || f.internalName === 'full_name' || f.internalName === 'class_name') ||
      fields.find(f => f.dataType === 'text');
    if (displayField) displayFieldMap.set(targetTypeId, displayField);
  }

  // ─── Query 4: ALL relationship records (shared between counts + display values) ───
  const relDefIds = relDefs.map(rd => rd.id);
  const allRelRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { and: a, inArray: i, or: o }) => a(
      i(rr.relationshipDefinitionId, relDefIds),
      o(i(rr.fromEntityRecordId, recordIds), i(rr.toEntityRecordId, recordIds)),
    ),
    // Only the three columns the resolver reads — cuts transfer on the
    // (often thousands-of-rows) relationship bulk fetch.
    columns: { relationshipDefinitionId: true, fromEntityRecordId: true, toEntityRecordId: true },
  });

  // Group by relationshipDefinitionId
  const relRecordsByDef = new Map<string, typeof allRelRecords>();
  for (const rr of allRelRecords) {
    const arr = relRecordsByDef.get(rr.relationshipDefinitionId) || [];
    arr.push(rr);
    relRecordsByDef.set(rr.relationshipDefinitionId, arr);
  }

  // ─── Query 5: ALL field values for display-name resolution ───
  const displayFieldIds = [...new Set(
    [...displayFieldMap.values()].map(f => f.id)
  )];

  const allTargetRecordIds = new Set<string>();
  for (const rr of allRelRecords) {
    allTargetRecordIds.add(rr.fromEntityRecordId);
    allTargetRecordIds.add(rr.toEntityRecordId);
  }

  const targetRecordIdArr = [...allTargetRecordIds];
  const allDisplayValues = (displayFieldIds.length > 0 && targetRecordIdArr.length > 0)
    ? await db.query.fieldValues.findMany({
        where: (fv, { and: a, inArray: i }) => a(
          i(fv.fieldDefinitionId, displayFieldIds),
          i(fv.entityRecordId, targetRecordIdArr),
        ),
        columns: { entityRecordId: true, fieldDefinitionId: true, textValue: true, numericValue: true },
      })
    : [];

  // Build name lookup: `${fieldDefId}:${entityId}` → display value
  const nameLookup = new Map<string, string>();
  for (const tv of allDisplayValues) {
    nameLookup.set(`${tv.fieldDefinitionId}:${tv.entityRecordId}`, tv.textValue || String(tv.numericValue ?? ''));
  }

  // ─── Process everything in memory (no more DB queries) ───

  // Build relFields array (virtual field definitions for the frontend)
  const relFields = relDefs.map((rd, idx) => {
    const isFrom = rd.fromEntityTypeId === entityTypeId;
    const targetTypeId = isFrom ? rd.toEntityTypeId : rd.fromEntityTypeId;
    const targetType = targetTypeMap.get(targetTypeId);

    return {
      id: `rel_${rd.id}`,
      schoolId: rd.schoolId,
      entityTypeId: entityTypeId,
      sectionId: null,
      name: targetType?.name || 'Linked Record',
      internalName: `__rel_${rd.id}`,
      dataType: 'relationship' as const,
      unit: null,
      isRequired: false,
      isUnique: false,
      isIdentifier: false,
      displayOrder: 9000 + idx,
      validationRules: {},
      options: null,
      defaultValue: null,
      createdAt: rd.createdAt,
      updatedAt: rd.updatedAt,
      _relationshipDefinitionId: rd.id,
      _targetEntityTypeId: targetTypeId,
      _targetEntityName: targetType?.internalName || 'unknown',
      _targetEntityDisplayName: targetType?.name || 'Unknown',
      _cardinality: rd.cardinality,
      _isFrom: isFrom,
    };
  });

  // Process counts + display values per rel def
  for (const rd of relDefs) {
    const isFrom = rd.fromEntityTypeId === entityTypeId;
    const targetEntityTypeId = isFrom ? rd.toEntityTypeId : rd.fromEntityTypeId;
    const targetType = targetTypeMap.get(targetEntityTypeId);
    const displayField = displayFieldMap.get(targetEntityTypeId);
    const relRecords = relRecordsByDef.get(rd.id) || [];

    if (!targetType) continue;

    // Map: source recordId → [linked target record ids]
    const linkedMap = new Map<string, string[]>();
    for (const rr of relRecords) {
      const sourceId = isFrom ? rr.fromEntityRecordId : rr.toEntityRecordId;
      const targetId = isFrom ? rr.toEntityRecordId : rr.fromEntityRecordId;
      if (!linkedMap.has(sourceId)) linkedMap.set(sourceId, []);
      linkedMap.get(sourceId)!.push(targetId);
    }

    // --- Counts ---
    const countTargetName = [...countTargetNameMap.entries()].find(([, tid]) => tid === targetEntityTypeId)?.[0];
    if (countTargetName) {
      for (const [recordId, linkedIds] of linkedMap) {
        const counts = relCounts.get(recordId) || {};
        counts[countTargetName] = linkedIds.length;
        relCounts.set(recordId, counts);
      }
    }

    // --- Display values ---
    const relFieldKey = `__rel_${rd.id}`;
    for (const [recordId, linkedIds] of linkedMap) {
      const names = linkedIds.map(id => {
        if (displayField) {
          const name = nameLookup.get(`${displayField.id}:${id}`);
          if (name) return name;
        }
        return id.slice(0, 8);
      });

      const recordResult = relValues.get(recordId) || {};

      if (rd.cardinality === '1-1') {
        recordResult[relFieldKey] = names[0] || '';
      } else if (rd.cardinality === '1-many') {
        recordResult[relFieldKey] = names.length > 0 ? names[0] : '';
        // Store full names array for dropdown rendering
        if (names.length > 0) recordResult[`${relFieldKey}_names`] = names;
      } else {
        // many-many: show count text + include full names array for dropdown
        recordResult[relFieldKey] = names.length > 0
          ? `${names.length} ${targetType.name.toLowerCase()}${names.length !== 1 ? 's' : ''}`
          : '';
        // Store actual names for dropdown rendering
        recordResult[`${relFieldKey}_names`] = names;
      }

      relValues.set(recordId, recordResult);
    }
  }

  return { relFields, relValues, relCounts };
}

// ─── Standalone Batch Helpers ──────────────────────────────────────

/**
 * Batch-compute roster counts for multiple class records.
 * Uses exactly 2 queries regardless of classRecordIds count.
 */
export async function batchGetRosterCounts(
  classRecordIds: string[],
  schoolId: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const cid of classRecordIds) result.set(cid, 0);
  if (classRecordIds.length === 0) return result;

  // Find class and learner entity type IDs
  const entityTypesList = await db.query.entityTypes.findMany({
    where: (et, { and: a, eq: e, inArray: i }) => a(
      e(et.schoolId, schoolId),
      i(et.internalName, ['class', 'learner']),
    ),
  });
  const classTypeId = entityTypesList.find(t => t.internalName === 'class')?.id;
  const learnerTypeId = entityTypesList.find(t => t.internalName === 'learner')?.id;
  if (!classTypeId || !learnerTypeId) return result;

  // Find class↔learner relationship definition
  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: (rd, { and: a, eq: e, or: o }) => a(
      e(rd.schoolId, schoolId),
      e(rd.isActive, true),
      o(
        a(e(rd.fromEntityTypeId, classTypeId), e(rd.toEntityTypeId, learnerTypeId)),
        a(e(rd.fromEntityTypeId, learnerTypeId), e(rd.toEntityTypeId, classTypeId)),
      ),
    ),
  });
  if (!relDef) return result;

  const isFrom = relDef.fromEntityTypeId === classTypeId;

  // Batch query: ALL relationship records for our class IDs
  const allRelRecords = await db.query.relationshipRecords.findMany({
    where: (rr, { and: a, eq: e, or: o, inArray: i }) => a(
      e(rr.relationshipDefinitionId, relDef.id),
      o(i(rr.fromEntityRecordId, classRecordIds), i(rr.toEntityRecordId, classRecordIds)),
    ),
  });

  for (const rr of allRelRecords) {
    const classId = isFrom ? rr.fromEntityRecordId : rr.toEntityRecordId;
    const count = result.get(classId);
    if (count !== undefined) result.set(classId, count + 1);
  }

  return result;
}

// ─── Get relationship field definitions (for /fields endpoints) ────────
// Returns virtual field definitions for all relationship fields of an entity type.
// Does NOT need recordIds since it only returns field definitions, not actual values.

export async function getRelationshipFields(schoolId: string, entityTypeId: string) {
  const relDefs = await db.query.relationshipDefinitions.findMany({
    where: (rd, { and: a, eq: e, or: o }) => a(
      e(rd.schoolId, schoolId),
      a(o(e(rd.fromEntityTypeId, entityTypeId), e(rd.toEntityTypeId, entityTypeId)), e(rd.isActive, true)),
    ),
  });

  if (relDefs.length === 0) return [];

  const targetTypeIds = [...new Set(
    relDefs.flatMap(rd => [rd.fromEntityTypeId, rd.toEntityTypeId])
  )].filter(id => id !== entityTypeId);

  const allTargetTypes = targetTypeIds.length > 0
    ? await db.query.entityTypes.findMany({
        where: (et, { inArray: i }) => i(et.id, targetTypeIds),
      })
    : [];
  const targetTypeMap = new Map(allTargetTypes.map(t => [t.id, t]));

  return relDefs.map((rd, idx) => {
    const isFrom = rd.fromEntityTypeId === entityTypeId;
    const targetTypeId = isFrom ? rd.toEntityTypeId : rd.fromEntityTypeId;
    const targetType = targetTypeMap.get(targetTypeId);

    return {
      id: `__rel_${rd.id}`,
      schoolId: rd.schoolId,
      entityTypeId: entityTypeId,
      sectionId: null,
      name: targetType?.name || 'Linked Record',
      internalName: `__rel_${rd.id}`,
      dataType: 'relationship' as const,
      unit: null,
      isRequired: false,
      isUnique: false,
      isIdentifier: false,
      displayOrder: 9000 + idx,
      validationRules: {},
      options: null,
      defaultValue: null,
      createdAt: rd.createdAt,
      updatedAt: rd.updatedAt,
      _relationshipDefinitionId: rd.id,
      _targetEntityTypeId: targetTypeId,
      _targetEntityName: targetType?.internalName || 'unknown',
      _targetEntityDisplayName: targetType?.name || 'Unknown',
      _cardinality: rd.cardinality,
      _isFrom: isFrom,
    };
  });
}

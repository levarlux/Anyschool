// Structural Blocks - How values relate to each other

import { db } from '../../../api/src/db';
import {
  entityRecords,
  fieldValues,
  fieldDefinitions,
  relationshipDefinitions,
  relationshipRecords,
  sections,
} from '../../../drizzle/schema';
import { eq, and, SQL } from 'drizzle-orm';

export type StructuralBlockType = 'table' | 'detail' | 'link' | 'rollup' | 'computed';

/**
 * Table/List Block - Rows of records of one entity type
 */
export async function getTableBlock(
  schoolId: string,
  entityTypeId: string,
  options?: {
    limit?: number;
    offset?: number;
    filters?: Record<string, any>;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
    limit: options?.limit || 50,
    offset: options?.offset || 0,
  });

  // Get field definitions for this entity type
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
  });

  // Get field values for all records
  const recordIds = records.map(r => r.id);
  const values = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      // In a real implementation, we'd use IN clause here
    ),
  });

  // Group values by record
  const recordsWithValues = records.map(record => {
    const recordValues = values.filter(v => v.entityRecordId === record.id);
    const fieldMap = new Map(recordValues.map(v => [v.fieldDefinitionId, v]));
    return {
      ...record,
      fields: fields.map(field => ({
        ...field,
        value: fieldMap.get(field.id),
      })),
    };
  });

  return {
    type: 'table' as const,
    entityTypeId,
    records: recordsWithValues,
    total: records.length,
  };
}

/**
 * Detail/Profile View Block - One record's fields grouped by sections
 */
export async function getDetailBlock(
  schoolId: string,
  entityRecordId: string
) {
  // Get the entity record
  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, entityRecordId)
    ),
  });

  if (!record) {
    return null;
  }

  // Get sections for this entity type
  const entitySections = await db.query.sections.findMany({
    where: and(
      eq(sections.schoolId, schoolId),
      eq(sections.entityTypeId, record.entityTypeId)
    ),
    orderBy: (sections, { asc }) => [asc(sections.displayOrder)],
  });

  // Get field definitions grouped by section
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, record.entityTypeId)
    ),
    orderBy: (fieldDefinitions, { asc }) => [asc(fieldDefinitions.displayOrder)],
  });

  // Get field values for this record
  const values = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.entityRecordId, entityRecordId)
    ),
  });

  // Group fields by section
  const sectionsWithFields = entitySections.map(section => ({
    ...section,
    fields: fields
      .filter(f => f.sectionId === section.id)
      .map(field => ({
        ...field,
        value: values.find(v => v.fieldDefinitionId === field.id),
      })),
  }));

  // Include fields without a section
  const unsectionedFields = fields
    .filter(f => !f.sectionId)
    .map(field => ({
      ...field,
      value: values.find(v => v.fieldDefinitionId === field.id),
    }));

  return {
    type: 'detail' as const,
    record,
    sections: sectionsWithFields,
    unsectionedFields,
  };
}

/**
 * Link/Relationship Block - Connects two entity types
 */
export async function getLinkBlock(
  schoolId: string,
  relationshipDefinitionId: string
) {
  const relDef = await db.query.relationshipDefinitions.findFirst({
    where: and(
      eq(relationshipDefinitions.schoolId, schoolId),
      eq(relationshipDefinitions.id, relationshipDefinitionId)
    ),
  });

  if (!relDef) {
    return null;
  }

  // Get all relationship records for this definition
  const relRecords = await db.query.relationshipRecords.findMany({
    where: and(
      eq(relationshipRecords.schoolId, schoolId),
      eq(relationshipRecords.relationshipDefinitionId, relationshipDefinitionId)
    ),
  });

  return {
    type: 'link' as const,
    definition: relDef,
    records: relRecords,
    cardinality: relDef.cardinality,
  };
}

/**
 * Rollup Block - Calculates a value through a relationship
 */
export async function calculateRollup(
  schoolId: string,
  sourceRecordId: string,
  relationshipDefId: string,
  targetFieldDefId: string,
  operation: 'sum' | 'count' | 'avg' | 'min' | 'max'
) {
  // Get relationships from source record
  const relRecords = await db.query.relationshipRecords.findMany({
    where: and(
      eq(relationshipRecords.schoolId, schoolId),
      eq(relationshipRecords.fromEntityRecordId, sourceRecordId),
      eq(relationshipRecords.relationshipDefinitionId, relationshipDefId)
    ),
  });

  // Get target record IDs
  const targetRecordIds = relRecords.map(r => r.toEntityRecordId);

  // Get field values for target records
  const values = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, targetFieldDefId)
    ),
  });

  // Filter to only values from related records
  const relatedValues = values.filter(v => targetRecordIds.includes(v.entityRecordId));

  // Calculate rollup
  const numericValues = relatedValues
    .map(v => v.numericValue)
    .filter((v): v is number => v !== null && v !== undefined);

  switch (operation) {
    case 'sum':
      return numericValues.reduce((a, b) => a + b, 0);
    case 'count':
      return relatedValues.length;
    case 'avg':
      return numericValues.length > 0
        ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
        : 0;
    case 'min':
      return numericValues.length > 0 ? Math.min(...numericValues) : 0;
    case 'max':
      return numericValues.length > 0 ? Math.max(...numericValues) : 0;
    default:
      return 0;
  }
}

/**
 * Computed/Formula Field Block - Value derived from other fields
 */
export async function calculateComputedField(
  schoolId: string,
  entityRecordId: string,
  formula: {
    fields: string[]; // field internal names
    operation: string; // e.g., "field1 + field2", "field1 * field2"
  }
) {
  // Get field definitions
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId)
    ),
  });

  // Get field values for this record
  const values = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.entityRecordId, entityRecordId)
    ),
  });

  // Create a map of field internal name to value
  const fieldValueMap = new Map<string, number>();
  for (const fieldInternalName of formula.fields) {
    const fieldDef = fields.find(f => f.internalName === fieldInternalName);
    if (fieldDef) {
      const value = values.find(v => v.fieldDefinitionId === fieldDef.id);
      if (value?.numericValue !== null && value?.numericValue !== undefined) {
        fieldValueMap.set(fieldInternalName, value.numericValue);
      }
    }
  }

  // Simple formula evaluation (in production, use a proper expression parser)
  try {
    let expression = formula.operation;
    for (const [name, value] of fieldValueMap) {
      expression = expression.replace(new RegExp(name, 'g'), value.toString());
    }
    // Only allow basic math operations
    if (/^[\d\s\+\-\*\/\(\)]+$/.test(expression)) {
      return Function(`"use strict"; return (${expression})`)();
    }
    return null;
  } catch {
    return null;
  }
}
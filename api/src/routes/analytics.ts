// Calculation & Analytics Engine API Routes
// Doc 05 — Computed fields, rollups, charts, KPIs

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import {
  entityTypes,
  entityRecords,
  fieldDefinitions,
  fieldValues,
  relationshipDefinitions,
  relationshipRecords,
} from '../../../drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';

const analytics = new Hono();

// Validation schemas
const computedFieldSchema = z.object({
  entityTypeId: z.string().uuid(),
  name: z.string().min(1),
  formula: z.object({
    fields: z.array(z.string()), // field internal names
    expression: z.string(), // e.g., "field1 + field2", "field1 / field2 * 100"
  }),
  unit: z.string().optional(),
});

const rollupSchema = z.object({
  entityTypeId: z.string().uuid(),
  name: z.string().min(1),
  relationshipDefId: z.string().uuid(),
  targetFieldDefId: z.string().uuid(),
  operation: z.enum(['sum', 'avg', 'count', 'min', 'max']),
  filters: z.object({
    field: z.string().optional(),
    value: z.any().optional(),
  }).optional(),
});

const chartQuerySchema = z.object({
  entityTypeId: z.string().uuid(),
  valueFieldId: z.string().uuid(),
  groupByFieldId: z.string().uuid().optional(),
  chartType: z.enum(['bar', 'line', 'pie', 'doughnut', 'area']),
  filters: z.array(z.object({
    fieldId: z.string().uuid(),
    operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'like']),
    value: z.any(),
  })).optional(),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
});

// Computed Field Evaluation

/**
 * Evaluate a computed field formula for a record
 */
async function evaluateComputedField(
  schoolId: string,
  entityRecordId: string,
  formula: { fields: string[]; expression: string }
): Promise<number | null> {
  // Get field definitions
  const fields = await db.query.fieldDefinitions.findMany({
    where: eq(fieldDefinitions.schoolId, schoolId),
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
      } else {
        // Missing value, cannot compute
        return null;
      }
    } else {
      // Field not found
      return null;
    }
  }

  // Evaluate expression
  try {
    let expression = formula.expression;
    for (const [name, value] of fieldValueMap) {
      expression = expression.replace(new RegExp(`\\b${name}\\b`, 'g'), value.toString());
    }
    // Only allow basic math operations
    if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(expression)) {
      return Function(`"use strict"; return (${expression})`)();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Calculate rollup through a relationship
 */
async function calculateRollup(
  schoolId: string,
  sourceRecordId: string,
  relationshipDefId: string,
  targetFieldDefId: string,
  operation: 'sum' | 'avg' | 'count' | 'min' | 'max',
  filters?: { field?: string; value?: any }
): Promise<number | null> {
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

  if (targetRecordIds.length === 0) {
    return operation === 'count' ? 0 : null;
  }

  // Get field values for target records
  const values = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, targetFieldDefId)
    ),
  });

  // Filter to only values from related records
  let relatedValues = values.filter(v => targetRecordIds.includes(v.entityRecordId));

  // Apply filters if specified
  if (filters?.field && filters?.value !== undefined) {
    const filterField = await db.query.fieldDefinitions.findFirst({
      where: and(
        eq(fieldDefinitions.schoolId, schoolId),
        eq(fieldDefinitions.internalName, filters.field)
      ),
    });

    if (filterField) {
      const filterValues = await db.query.fieldValues.findMany({
        where: and(
          eq(fieldValues.schoolId, schoolId),
          eq(fieldValues.fieldDefinitionId, filterField.id)
        ),
      });

      const matchingRecordIds = filterValues
        .filter(v => v.textValue === filters.value || v.numericValue === filters.value)
        .map(v => v.entityRecordId);

      relatedValues = relatedValues.filter(v => matchingRecordIds.includes(v.entityRecordId));
    }
  }

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
        : null;
    case 'min':
      return numericValues.length > 0 ? Math.min(...numericValues) : null;
    case 'max':
      return numericValues.length > 0 ? Math.max(...numericValues) : null;
    default:
      return null;
  }
}

// API Endpoints

/**
 * Evaluate a computed field for all records of an entity type
 */
analytics.post('/computed-field', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = computedFieldSchema.parse(body);

  // Get all records for this entity type
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, validated.entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Evaluate computed field for each record
  const results = [];
  for (const record of records) {
    const value = await evaluateComputedField(schoolId, record.id, validated.formula);
    results.push({
      recordId: record.id,
      value,
    });
  }

  return c.json({
    entityTypeId: validated.entityTypeId,
    fieldName: validated.name,
    formula: validated.formula,
    results,
  });
});

/**
 * Calculate rollup for all records of an entity type
 */
analytics.post('/rollup', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = rollupSchema.parse(body);

  // Get all records for this entity type
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, validated.entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Calculate rollup for each record
  const results = [];
  for (const record of records) {
    const value = await calculateRollup(
      schoolId,
      record.id,
      validated.relationshipDefId,
      validated.targetFieldDefId,
      validated.operation,
      validated.filters
    );
    results.push({
      recordId: record.id,
      value,
    });
  }

  return c.json({
    entityTypeId: validated.entityTypeId,
    fieldName: validated.name,
    operation: validated.operation,
    results,
  });
});

/**
 * Query chart data with multi-dimensional filtering
 */
analytics.post('/chart', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = chartQuerySchema.parse(body);

  // Get all records for this entity type
  let records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, validated.entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get all field definitions
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, validated.entityTypeId)
    ),
  });

  // Get all field values
  const allValues = await db.query.fieldValues.findMany({
    where: eq(fieldValues.schoolId, schoolId),
  });

  // Apply filters
  if (validated.filters && validated.filters.length > 0) {
    const filteredRecordIds = new Set<string>();

    for (const record of records) {
      let passesAllFilters = true;

      for (const filter of validated.filters) {
        const field = fields.find(f => f.id === filter.fieldId);
        if (!field) continue;

        const value = allValues.find(
          v => v.entityRecordId === record.id && v.fieldDefinitionId === filter.fieldId
        );

        const fieldValue = value?.textValue || value?.numericValue || value?.dateValue;
        let passesFilter = false;

        switch (filter.operator) {
          case 'eq':
            passesFilter = fieldValue === filter.value;
            break;
          case 'neq':
            passesFilter = fieldValue !== filter.value;
            break;
          case 'gt':
            passesFilter = typeof fieldValue === 'number' && fieldValue > filter.value;
            break;
          case 'lt':
            passesFilter = typeof fieldValue === 'number' && fieldValue < filter.value;
            break;
          case 'gte':
            passesFilter = typeof fieldValue === 'number' && fieldValue >= filter.value;
            break;
          case 'lte':
            passesFilter = typeof fieldValue === 'number' && fieldValue <= filter.value;
            break;
          case 'in':
            passesFilter = Array.isArray(filter.value) && filter.value.includes(fieldValue);
            break;
          case 'like':
            passesFilter = typeof fieldValue === 'string' && fieldValue.includes(filter.value);
            break;
        }

        if (!passesFilter) {
          passesAllFilters = false;
          break;
        }
      }

      if (passesAllFilters) {
        filteredRecordIds.add(record.id);
      }
    }

    records = records.filter(r => filteredRecordIds.has(r.id));
  }

  // Prepare chart data
  const chartData = records.map(record => {
    const valueField = fields.find(f => f.id === validated.valueFieldId);
    const value = allValues.find(
      v => v.entityRecordId === record.id && v.fieldDefinitionId === validated.valueFieldId
    );

    let group = 'Ungrouped';
    if (validated.groupByFieldId) {
      const groupValue = allValues.find(
        v => v.entityRecordId === record.id && v.fieldDefinitionId === validated.groupByFieldId
      );
      group = groupValue?.textValue || 'Ungrouped';
    }

    return {
      recordId: record.id,
      value: value?.numericValue || 0,
      group,
    };
  });

  // Aggregate by group
  const groupedData = new Map<string, number[]>();
  for (const item of chartData) {
    if (!groupedData.has(item.group)) {
      groupedData.set(item.group, []);
    }
    groupedData.get(item.group)!.push(item.value);
  }

  const aggregatedData = Array.from(groupedData.entries()).map(([group, values]) => ({
    label: group,
    value: values.reduce((a, b) => a + b, 0),
    count: values.length,
    average: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
  }));

  return c.json({
    entityTypeId: validated.entityTypeId,
    chartType: validated.chartType,
    totalRecords: records.length,
    data: aggregatedData,
  });
});

/**
 * Get KPI data for a field
 */
analytics.post('/kpi', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { entityTypeId, fieldId, operation, label } = body;

  // Get field definition
  const field = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.id, fieldId)
    ),
  });

  if (!field) {
    return c.json({ error: 'Field not found' }, 404);
  }

  // Get all records for this entity type
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get field values
  const values = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, fieldId)
    ),
  });

  // Filter to values from records of this entity type
  const recordIds = new Set(records.map(r => r.id));
  const relevantValues = values.filter(v => recordIds.has(v.entityRecordId));

  // Calculate KPI
  const numericValues = relevantValues
    .map(v => v.numericValue)
    .filter((v): v is number => v !== null && v !== undefined);

  let kpiValue: number;
  switch (operation) {
    case 'sum':
      kpiValue = numericValues.reduce((a, b) => a + b, 0);
      break;
    case 'count':
      kpiValue = relevantValues.length;
      break;
    case 'avg':
      kpiValue = numericValues.length > 0
        ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
        : 0;
      break;
    case 'min':
      kpiValue = numericValues.length > 0 ? Math.min(...numericValues) : 0;
      break;
    case 'max':
      kpiValue = numericValues.length > 0 ? Math.max(...numericValues) : 0;
      break;
    default:
      kpiValue = 0;
  }

  return c.json({
    label: label || field.name,
    value: kpiValue,
    operation,
    unit: field.unit,
  });
});

export default analytics;
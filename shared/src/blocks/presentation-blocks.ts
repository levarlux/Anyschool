// Presentation Blocks - How data is displayed

import { db } from '../../../api/src/db';
import {
  entityRecords,
  fieldValues,
  fieldDefinitions,
} from '../../../drizzle/schema';
import { eq, and, SQL } from 'drizzle-orm';

export type PresentationBlockType = 'chart' | 'kpi' | 'timeline' | 'status';

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'area';

/**
 * Chart Block - Visualizes any Number or Date field grouped by any Dropdown/Category
 */
export async function getChartData(
  schoolId: string,
  entityTypeId: string,
  config: {
    valueFieldId: string; // Number or Date field to measure
    groupByFieldId?: string; // Dropdown/Category field to group by
    chartType: ChartType;
    dateRange?: { start: Date; end: Date };
  }
) {
  // Get all records for this entity type
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get field values for the value field
  const valueValues = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, config.valueFieldId)
    ),
  });

  // Get group-by field values if specified
  let groupByValues = null;
  if (config.groupByFieldId) {
    groupByValues = await db.query.fieldValues.findMany({
      where: and(
        eq(fieldValues.schoolId, schoolId),
        eq(fieldValues.fieldDefinitionId, config.groupByFieldId)
      ),
    });
  }

  // Prepare chart data
  const data = records.map(record => {
    const value = valueValues.find(v => v.entityRecordId === record.id);
    const group = groupByValues?.find(v => v.entityRecordId === record.id);

    return {
      recordId: record.id,
      value: value?.numericValue || value?.dateValue,
      group: group?.textValue || 'Ungrouped',
    };
  });

  // Aggregate data by group
  const groupedData = new Map<string, number[]>();
  for (const item of data) {
    const group = item.group;
    if (!groupedData.has(group)) {
      groupedData.set(group, []);
    }
    if (typeof item.value === 'number') {
      groupedData.get(group)!.push(item.value);
    }
  }

  // Calculate aggregates per group
  const chartData = Array.from(groupedData.entries()).map(([group, values]) => ({
    label: group,
    value: values.reduce((a, b) => a + b, 0), // Sum by default
    count: values.length,
  }));

  return {
    type: 'chart' as const,
    chartType: config.chartType,
    data: chartData,
  };
}

/**
 * KPI/Metric Card Block - One prominent number
 */
export async function getKPIData(
  schoolId: string,
  config: {
    valueFieldId: string;
    operation: 'sum' | 'count' | 'avg' | 'min' | 'max';
    entityTypeId: string;
    label: string;
  }
) {
  // Get all records for this entity type
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, config.entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get field values
  const values = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, config.valueFieldId)
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
  switch (config.operation) {
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

  return {
    type: 'kpi' as const,
    label: config.label,
    value: kpiValue,
    operation: config.operation,
  };
}

/**
 * Timeline/Calendar View Block - Plots records across time
 */
export async function getTimelineData(
  schoolId: string,
  entityTypeId: string,
  dateFieldId: string,
  options?: {
    start?: Date;
    end?: Date;
    groupBy?: 'day' | 'week' | 'month' | 'year';
  }
) {
  // Get all records for this entity type
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get date field values
  const dateValues = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, dateFieldId)
    ),
  });

  // Prepare timeline data
  const timelineData = records
    .map(record => {
      const dateValue = dateValues.find(v => v.entityRecordId === record.id);
      return {
        recordId: record.id,
        date: dateValue?.dateValue,
      };
    })
    .filter(item => item.date)
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

  // Group by time period if specified
  if (options?.groupBy) {
    const grouped = new Map<string, typeof timelineData>();
    for (const item of timelineData) {
      const date = new Date(item.date!);
      let key: string;
      switch (options.groupBy) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'year':
          key = date.getFullYear().toString();
          break;
        default:
          key = date.toISOString().split('T')[0];
      }
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }
    return {
      type: 'timeline' as const,
      grouped: true,
      groupBy: options.groupBy,
      data: Array.from(grouped.entries()).map(([key, items]) => ({
        period: key,
        records: items,
        count: items.length,
      })),
    };
  }

  return {
    type: 'timeline' as const,
    grouped: false,
    data: timelineData,
  };
}

/**
 * Status/Stage Indicator Block - Visually distinct badge/stage
 */
export async function getStatusData(
  schoolId: string,
  entityTypeId: string,
  statusFieldId: string
) {
  // Get all records for this entity type
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get status field values
  const statusValues = await db.query.fieldValues.findMany({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, statusFieldId)
    ),
  });

  // Get status field definition for options
  const statusField = await db.query.fieldDefinitions.findFirst({
    where: eq(fieldDefinitions.id, statusFieldId),
  });

  // Count records by status
  const statusCounts = new Map<string, number>();
  for (const record of records) {
    const statusValue = statusValues.find(v => v.entityRecordId === record.id);
    const status = statusValue?.textValue || 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  }

  // Get available statuses from field options
  const availableStatuses = (statusField?.options as string[]) || [];

  return {
    type: 'status' as const,
    statuses: availableStatuses.map(status => ({
      name: status,
      count: statusCounts.get(status) || 0,
      percentage: records.length > 0
        ? ((statusCounts.get(status) || 0) / records.length) * 100
        : 0,
    })),
    total: records.length,
  };
}
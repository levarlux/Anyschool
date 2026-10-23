// Default Charts for Launch-Scope Pages
// Doc 05 §5 — Learner Performance, Attendance, Finance, Enrollment

import { db } from '../db';
import {
  entityTypes,
  fieldDefinitions,
} from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

export interface DefaultChart {
  id: string;
  name: string;
  description: string;
  chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'area';
  valueType: 'field' | 'computed' | 'rollup';
  valueConfig: {
    fieldInternalName?: string;
    formula?: { fields: string[]; expression: string };
    rollupConfig?: {
      relationshipInternalName: string;
      targetFieldInternalName: string;
      operation: 'sum' | 'avg' | 'count' | 'min' | 'max';
    };
  };
  groupByType: 'field' | 'relationship' | 'none';
  groupByConfig: {
    fieldInternalName?: string;
    relationshipInternalName?: string;
  };
}

/**
 * Default charts for Learner Performance
 */
export const learnerPerformanceCharts: DefaultChart[] = [
  {
    id: 'lp-avg-scores',
    name: 'Average Scores by Subject',
    description: 'Shows average assessment scores across all subjects',
    chartType: 'bar',
    valueType: 'rollup',
    valueConfig: {
      rollupConfig: {
        relationshipInternalName: 'assessment',
        targetFieldInternalName: 'score',
        operation: 'avg',
      },
    },
    groupByType: 'relationship',
    groupByConfig: {
      relationshipInternalName: 'subject',
    },
  },
  {
    id: 'lp-score-distribution',
    name: 'Score Distribution',
    description: 'Distribution of scores across all assessments',
    chartType: 'histogram',
    valueType: 'field',
    valueConfig: {
      fieldInternalName: 'score',
    },
    groupByType: 'none',
    groupByConfig: {},
  },
  {
    id: 'lp-performance-trend',
    name: 'Performance Trend',
    description: 'Average scores over time by term',
    chartType: 'line',
    valueType: 'rollup',
    valueConfig: {
      rollupConfig: {
        relationshipInternalName: 'assessment',
        targetFieldInternalName: 'score',
        operation: 'avg',
      },
    },
    groupByType: 'relationship',
    groupByConfig: {
      relationshipInternalName: 'term',
    },
  },
];

/**
 * Default charts for Attendance
 */
export const attendanceCharts: DefaultChart[] = [
  {
    id: 'att-rate-by-class',
    name: 'Attendance Rate by Class',
    description: 'Shows attendance percentage for each class',
    chartType: 'bar',
    valueType: 'computed',
    valueConfig: {
      formula: {
        fields: ['present_days', 'total_days'],
        expression: '(present_days / total_days) * 100',
      },
    },
    groupByType: 'relationship',
    groupByConfig: {
      relationshipInternalName: 'class',
    },
  },
  {
    id: 'att-trend',
    name: 'Attendance Trend',
    description: 'Daily attendance rate over time',
    chartType: 'line',
    valueType: 'computed',
    valueConfig: {
      formula: {
        fields: ['present_days', 'total_days'],
        expression: '(present_days / total_days) * 100',
      },
    },
    groupByType: 'field',
    groupByConfig: {
      fieldInternalName: 'date',
    },
  },
  {
    id: 'att-status-breakdown',
    name: 'Attendance Status Breakdown',
    description: 'Distribution of present, absent, late, excused',
    chartType: 'pie',
    valueType: 'field',
    valueConfig: {
      fieldInternalName: 'status',
    },
    groupByType: 'none',
    groupByConfig: {},
  },
];

/**
 * Default charts for Finance
 */
export const financeCharts: DefaultChart[] = [
  {
    id: 'fin-revenue-by-term',
    name: 'Revenue by Term',
    description: 'Total payments collected per term',
    chartType: 'bar',
    valueType: 'rollup',
    valueConfig: {
      rollupConfig: {
        relationshipInternalName: 'payment',
        targetFieldInternalName: 'amount',
        operation: 'sum',
      },
    },
    groupByType: 'relationship',
    groupByConfig: {
      relationshipInternalName: 'term',
    },
  },
  {
    id: 'fin-payment-status',
    name: 'Payment Status',
    description: 'Distribution of paid, pending, overdue',
    chartType: 'doughnut',
    valueType: 'field',
    valueConfig: {
      fieldInternalName: 'status',
    },
    groupByType: 'none',
    groupByConfig: {},
  },
  {
    id: 'fin-collection-trend',
    name: 'Collection Trend',
    description: 'Daily collection amount over time',
    chartType: 'area',
    valueType: 'rollup',
    valueConfig: {
      rollupConfig: {
        relationshipInternalName: 'payment',
        targetFieldInternalName: 'amount',
        operation: 'sum',
      },
    },
    groupByType: 'field',
    groupByConfig: {
      fieldInternalName: 'payment_date',
    },
  },
];

/**
 * Default charts for Enrollment
 */
export const enrollmentCharts: DefaultChart[] = [
  {
    id: 'enr-by-class',
    name: 'Enrollment by Class',
    description: 'Number of enrolled students per class',
    chartType: 'bar',
    valueType: 'rollup',
    valueConfig: {
      rollupConfig: {
        relationshipInternalName: 'learner',
        targetFieldInternalName: 'id',
        operation: 'count',
      },
    },
    groupByType: 'relationship',
    groupByConfig: {
      relationshipInternalName: 'class',
    },
  },
  {
    id: 'enr-status',
    name: 'Enrollment Status',
    description: 'Distribution of active, transferred, graduated, withdrawn',
    chartType: 'pie',
    valueType: 'field',
    valueConfig: {
      fieldInternalName: 'status',
    },
    groupByType: 'none',
    groupByConfig: {},
  },
  {
    id: 'enr-trend',
    name: 'Enrollment Trend',
    description: 'New enrollments over time by term',
    chartType: 'line',
    valueType: 'rollup',
    valueConfig: {
      rollupConfig: {
        relationshipInternalName: 'learner',
        targetFieldInternalName: 'id',
        operation: 'count',
      },
    },
    groupByType: 'relationship',
    groupByConfig: {
      relationshipInternalName: 'term',
    },
  },
];

/**
 * All default charts grouped by page
 */
export const defaultChartsByPage = {
  'learner-performance': learnerPerformanceCharts,
  'attendance': attendanceCharts,
  'finance': financeCharts,
  'enrollment': enrollmentCharts,
};

/**
 * Get default charts for a page
 */
export async function getDefaultCharts(pageId: string): Promise<DefaultChart[]> {
  return defaultChartsByPage[pageId as keyof typeof defaultChartsByPage] || [];
}

/**
 * Resolve a default chart configuration to actual field/relationship IDs
 */
export async function resolveChartConfig(
  schoolId: string,
  entityTypeId: string,
  chart: DefaultChart
): Promise<{
  valueFieldId?: string;
  rollupConfig?: {
    relationshipDefId: string;
    targetFieldDefId: string;
    operation: string;
  };
  groupByFieldId?: string;
} | null> {
  // Get all field definitions for this entity type
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
  });

  let valueFieldId: string | undefined;
  let rollupConfig: any;
  let groupByFieldId: string | undefined;

  // Resolve value source
  if (chart.valueType === 'field' && chart.valueConfig.fieldInternalName) {
    const field = fields.find(f => f.internalName === chart.valueConfig.fieldInternalName);
    valueFieldId = field?.id;
  } else if (chart.valueType === 'rollup' && chart.valueConfig.rollupConfig) {
    // For rollups, we need to resolve the target field
    const targetField = fields.find(
      f => f.internalName === chart.valueConfig.rollupConfig!.targetFieldInternalName
    );
    if (targetField) {
      rollupConfig = {
        relationshipDefId: '', // Would need to resolve from relationship internal name
        targetFieldDefId: targetField.id,
        operation: chart.valueConfig.rollupConfig.operation,
      };
    }
  }

  // Resolve group-by
  if (chart.groupByType === 'field' && chart.groupByConfig.fieldInternalName) {
    const field = fields.find(f => f.internalName === chart.groupByConfig.fieldInternalName);
    groupByFieldId = field?.id;
  }

  if (!valueFieldId && !rollupConfig) {
    return null;
  }

  return {
    valueFieldId,
    rollupConfig,
    groupByFieldId,
  };
}
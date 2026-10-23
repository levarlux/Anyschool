// Building Blocks Library - Complete export
// Based on Doc 03

export * from './value-blocks';
export * from './structural-blocks';
export * from './presentation-blocks';
export * from './layout-rules';
export * from './labels';

/**
 * The Closed Set (Doc 03 §11)
 * Everything a school or the AI agent can build is composed from:
 * - 6 value blocks
 * - 5 structural blocks
 * - 4 presentation blocks
 * - 4 behavior blocks (implemented in rules-automation)
 * - Labels system
 * - Layout rules
 */

export type BlockLibrary = {
  // Value blocks
  valueBlocks: {
    text: typeof import('./value-blocks').createTextBlock;
    number: typeof import('./value-blocks').createNumberBlock;
    datetime: typeof import('./value-blocks').createDateTimeBlock;
    boolean: typeof import('./value-blocks').createBooleanBlock;
    select: typeof import('./value-blocks').createSelectBlock;
    file: typeof import('./value-blocks').createFileBlock;
  };
  // Structural blocks
  structuralBlocks: {
    table: typeof import('./structural-blocks').getTableBlock;
    detail: typeof import('./structural-blocks').getDetailBlock;
    link: typeof import('./structural-blocks').getLinkBlock;
    rollup: typeof import('./structural-blocks').calculateRollup;
    computed: typeof import('./structural-blocks').calculateComputedField;
  };
  // Presentation blocks
  presentationBlocks: {
    chart: typeof import('./presentation-blocks').getChartData;
    kpi: typeof import('./presentation-blocks').getKPIData;
    timeline: typeof import('./presentation-blocks').getTimelineData;
    status: typeof import('./presentation-blocks').getStatusData;
  };
  // Layout rules
  layout: {
    getBlockPosition: typeof import('./layout-rules').getBlockPosition;
    getRelationshipLayout: typeof import('./layout-rules').getRelationshipLayout;
    generateAutoLayout: typeof import('./layout-rules').generateAutoLayout;
  };
  // Labels
  labels: {
    getDisplayLabel: typeof import('./labels').getDisplayLabel;
    renameEntityType: typeof import('./labels').renameEntityType;
    renameField: typeof import('./labels').renameField;
  };
};
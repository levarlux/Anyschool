// Layout Rules - How blocks position themselves automatically
// Based on Doc 03 §6

export type BlockType = 'table' | 'detail' | 'link' | 'rollup' | 'computed' | 'chart' | 'kpi' | 'timeline' | 'status';

export interface LayoutPosition {
  width: 'full' | 'half' | 'third' | 'quarter';
  order: number;
  section: 'header' | 'main' | 'sidebar' | 'footer';
}

/**
 * Block-type default positioning (Doc 03 §6.1)
 */
const BLOCK_POSITIONS: Record<BlockType, LayoutPosition> = {
  // Table → full-width, primary content
  table: { width: 'full', order: 100, section: 'main' },

  // Detail/Profile view → fields stacked top-to-bottom
  detail: { width: 'full', order: 50, section: 'main' },

  // KPI/metric card → small, multiple in a row near top
  kpi: { width: 'quarter', order: 10, section: 'header' },

  // Chart → medium-sized, after KPI cards, before detail tables
  chart: { width: 'half', order: 30, section: 'main' },

  // Timeline → medium-sized, similar to chart
  timeline: { width: 'half', order: 35, section: 'main' },

  // Status indicator → small, near top
  status: { width: 'third', order: 15, section: 'header' },

  // Link/Relationship → tag list or small linked table
  link: { width: 'half', order: 60, section: 'sidebar' },

  // Rollup → small, often in header or sidebar
  rollup: { width: 'third', order: 20, section: 'header' },

  // Computed field → inline with other fields
  computed: { width: 'full', order: 55, section: 'main' },
};

/**
 * Get default layout position for a block type
 */
export function getBlockPosition(blockType: BlockType): LayoutPosition {
  return BLOCK_POSITIONS[blockType] || { width: 'full', order: 100, section: 'main' };
}

/**
 * Relationship cardinality dictates nesting (Doc 03 §6.2)
 */
export function getRelationshipLayout(
  cardinality: '1-1' | '1-many' | 'many-many',
  side: 'from' | 'to'
): LayoutPosition {
  switch (cardinality) {
    case '1-1':
      // One-to-one: either side can embed
      return { width: 'half', order: 70, section: 'sidebar' };

    case '1-many':
      if (side === 'from') {
        // The "one" side embeds the "many" side as a table
        return { width: 'full', order: 80, section: 'main' };
      } else {
        // The "many" side shows as a tag or small linked table
        return { width: 'half', order: 70, section: 'sidebar' };
      }

    case 'many-many':
      // Many-to-many: renders as tag list or small linked table
      return { width: 'half', order: 70, section: 'sidebar' };

    default:
      return { width: 'full', order: 100, section: 'main' };
  }
}

/**
 * Field-type dictates ordering priority within a group (Doc 03 §6.3)
 */
export function getFieldOrderPriority(
  fieldInternalName: string,
  isIdentifier: boolean,
  isStatus: boolean,
  displayOrder: number
): number {
  // Identity/name-like fields render first
  if (isIdentifier) {
    return 1;
  }

  // Status fields render near the top
  if (isStatus) {
    return 5;
  }

  // Everything else follows school's field order
  return 100 + displayOrder;
}

/**
 * Auto-layout generator for an entity type
 * Produces a complete layout configuration based on block types and relationships
 */
export function generateAutoLayout(config: {
  hasKPIs?: boolean;
  hasCharts?: boolean;
  hasTimeline?: boolean;
  hasStatus?: boolean;
  relationships: Array<{
    cardinality: '1-1' | '1-many' | 'many-many';
    targetName: string;
  }>;
}): LayoutPosition[] {
  const layout: LayoutPosition[] = [];

  // KPIs go first in header
  if (config.hasKPIs) {
    layout.push({ ...BLOCK_POSITIONS.kpi, section: 'header' });
  }

  // Status indicators in header
  if (config.hasStatus) {
    layout.push({ ...BLOCK_POSITIONS.status, section: 'header' });
  }

  // Charts in main section
  if (config.hasCharts) {
    layout.push({ ...BLOCK_POSITIONS.chart, section: 'main' });
  }

  // Timeline in main section
  if (config.hasTimeline) {
    layout.push({ ...BLOCK_POSITIONS.timeline, section: 'main' });
  }

  // Relationships
  for (const rel of config.relationships) {
    layout.push(getRelationshipLayout(rel.cardinality, 'from'));
  }

  // Sort by order
  layout.sort((a, b) => a.order - b.order);

  return layout;
}

/**
 * Calculate responsive grid columns based on layout
 */
export function getGridColumns(layout: LayoutPosition[]): number {
  const hasFullWidth = layout.some(p => p.width === 'full');
  if (hasFullWidth) return 1;

  const hasHalfWidth = layout.some(p => p.width === 'half');
  if (hasHalfWidth) return 2;

  const hasThirdWidth = layout.some(p => p.width === 'third');
  if (hasThirdWidth) return 3;

  return 4; // quarter width
}
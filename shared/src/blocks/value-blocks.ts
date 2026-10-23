// Value Blocks - The atoms of the building block system
// Each block maps to a field_definitions row and a typed column in field_values

export type ValueBlockType = 'text' | 'number' | 'datetime' | 'boolean' | 'select' | 'file';

export interface ValueBlockConfig {
  type: ValueBlockType;
  label: string;
  internalName: string;
  required?: boolean;
  unique?: boolean;
  isIdentifier?: boolean;
  unit?: 'currency' | 'weight' | 'distance' | 'duration' | 'percentage' | null;
  options?: string[]; // for select type
  validation?: {
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
}

/**
 * Text Block - Short or long text
 */
export function createTextBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig {
  return {
    ...config,
    type: 'text',
  };
}

/**
 * Number Block - Numeric values with optional unit tag
 */
export function createNumberBlock(
  config: Omit<ValueBlockConfig, 'type'> & { unit?: ValueBlockConfig['unit'] }
): ValueBlockConfig {
  return {
    ...config,
    type: 'number',
  };
}

/**
 * DateTime Block - Date, time, or both
 */
export function createDateTimeBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig {
  return {
    ...config,
    type: 'datetime',
  };
}

/**
 * Boolean Block - Simple yes/no toggle
 */
export function createBooleanBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig {
  return {
    ...config,
    type: 'boolean',
  };
}

/**
 * Select Block - Dropdown with school-defined options
 */
export function createSelectBlock(
  config: Omit<ValueBlockConfig, 'type'> & { options: string[] }
): ValueBlockConfig {
  return {
    ...config,
    type: 'select',
  };
}

/**
 * File Block - File/image upload reference
 */
export function createFileBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig {
  return {
    ...config,
    type: 'file',
  };
}

/**
 * Get the appropriate storage column for a value block type
 */
export function getStorageColumn(type: ValueBlockType): string {
  switch (type) {
    case 'text':
    case 'select':
      return 'textValue';
    case 'number':
      return 'numericValue';
    case 'datetime':
      return 'dateValue';
    case 'boolean':
      return 'booleanValue';
    case 'file':
      return 'fileValue';
    default:
      return 'textValue';
  }
}

/**
 * Validate a value against its block configuration
 */
export function validateValue(
  value: any,
  config: ValueBlockConfig
): { valid: boolean; error?: string } {
  if (config.required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: `${config.label} is required` };
  }

  if (!config.required && (value === null || value === undefined || value === '')) {
    return { valid: true };
  }

  switch (config.type) {
    case 'text':
      if (typeof value !== 'string') {
        return { valid: false, error: `${config.label} must be text` };
      }
      if (config.validation?.maxLength && value.length > config.validation.maxLength) {
        return { valid: false, error: `${config.label} exceeds maximum length of ${config.validation.maxLength}` };
      }
      if (config.validation?.pattern && !new RegExp(config.validation.pattern).test(value)) {
        return { valid: false, error: `${config.label} format is invalid` };
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: `${config.label} must be a number` };
      }
      if (config.validation?.min !== undefined && value < config.validation.min) {
        return { valid: false, error: `${config.label} must be at least ${config.validation.min}` };
      }
      if (config.validation?.max !== undefined && value > config.validation.max) {
        return { valid: false, error: `${config.label} must be at most ${config.validation.max}` };
      }
      break;

    case 'select':
      if (!config.options?.includes(value)) {
        return { valid: false, error: `${config.label} must be one of: ${config.options?.join(', ')}` };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: `${config.label} must be true or false` };
      }
      break;

    case 'file':
      if (!value?.url || !value?.key) {
        return { valid: false, error: `${config.label} must be a valid file reference` };
      }
      break;
  }

  return { valid: true };
}
export type ValueBlockType = 'text' | 'number' | 'datetime' | 'boolean' | 'select' | 'file';
export interface ValueBlockConfig {
    type: ValueBlockType;
    label: string;
    internalName: string;
    required?: boolean;
    unique?: boolean;
    isIdentifier?: boolean;
    unit?: 'currency' | 'weight' | 'distance' | 'duration' | 'percentage' | null;
    options?: string[];
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
export declare function createTextBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig;
/**
 * Number Block - Numeric values with optional unit tag
 */
export declare function createNumberBlock(config: Omit<ValueBlockConfig, 'type'> & {
    unit?: ValueBlockConfig['unit'];
}): ValueBlockConfig;
/**
 * DateTime Block - Date, time, or both
 */
export declare function createDateTimeBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig;
/**
 * Boolean Block - Simple yes/no toggle
 */
export declare function createBooleanBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig;
/**
 * Select Block - Dropdown with school-defined options
 */
export declare function createSelectBlock(config: Omit<ValueBlockConfig, 'type'> & {
    options: string[];
}): ValueBlockConfig;
/**
 * File Block - File/image upload reference
 */
export declare function createFileBlock(config: Omit<ValueBlockConfig, 'type'>): ValueBlockConfig;
/**
 * Get the appropriate storage column for a value block type
 */
export declare function getStorageColumn(type: ValueBlockType): string;
/**
 * Validate a value against its block configuration
 */
export declare function validateValue(value: any, config: ValueBlockConfig): {
    valid: boolean;
    error?: string;
};
//# sourceMappingURL=value-blocks.d.ts.map
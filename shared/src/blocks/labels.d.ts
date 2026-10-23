/**
 * Internal system name - fixed at creation, never shown in UI
 * Used as stable reference for code, relationships, formulas, rules
 */
export declare function validateInternalName(name: string): {
    valid: boolean;
    error?: string;
};
/**
 * Generate internal name from display label
 */
export declare function generateInternalName(label: string): string;
/**
 * Get display label for an entity type
 */
export declare function getDisplayLabel(schoolId: string, entityTypeId: string): Promise<string>;
/**
 * Get display label for a field
 */
export declare function getFieldDisplayLabel(schoolId: string, fieldDefinitionId: string): Promise<string>;
/**
 * Rename an entity type's display label
 * This ripples through every screen showing that pillar's label
 */
export declare function renameEntityType(schoolId: string, entityTypeId: string, newDisplayName: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Rename a field's display label
 * This ripples through every screen showing that field's label
 */
export declare function renameField(schoolId: string, fieldDefinitionId: string, newDisplayName: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get all labels for an entity type (for UI rendering)
 */
export declare function getEntityLabels(schoolId: string, entityTypeId: string): Promise<{
    entityName: string;
    fields: Array<{
        internalName: string;
        displayName: string;
    }>;
}>;
export declare function getCachedLabels(schoolId: string, entityTypeId: string): {
    entityName: string;
    fields: Map<string, string>;
} | undefined;
export declare function setCachedLabels(schoolId: string, entityTypeId: string, labels: {
    entityName: string;
    fields: Map<string, string>;
}): void;
export declare function clearLabelsCache(schoolId: string, entityTypeId?: string): void;
//# sourceMappingURL=labels.d.ts.map
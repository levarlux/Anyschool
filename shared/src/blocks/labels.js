// Labels System - Internal Name vs Display Label
// Based on Doc 03 §7
import { db } from '../../../api/src/db';
import { entityTypes, fieldDefinitions } from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
/**
 * Internal system name - fixed at creation, never shown in UI
 * Used as stable reference for code, relationships, formulas, rules
 */
export function validateInternalName(name) {
    // Must be lowercase
    if (name !== name.toLowerCase()) {
        return { valid: false, error: 'Internal name must be lowercase' };
    }
    // Must start with a letter
    if (!/^[a-z]/.test(name)) {
        return { valid: false, error: 'Internal name must start with a letter' };
    }
    // Can only contain letters, numbers, and underscores
    if (!/^[a-z0-9_]+$/.test(name)) {
        return { valid: false, error: 'Internal name can only contain letters, numbers, and underscores' };
    }
    // Must be at least 2 characters
    if (name.length < 2) {
        return { valid: false, error: 'Internal name must be at least 2 characters' };
    }
    return { valid: true };
}
/**
 * Generate internal name from display label
 */
export function generateInternalName(label) {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}
/**
 * Get display label for an entity type
 */
export async function getDisplayLabel(schoolId, entityTypeId) {
    const entityType = await db.query.entityTypes.findFirst({
        where: and(eq(entityTypes.schoolId, schoolId), eq(entityTypes.id, entityTypeId)),
    });
    // Return the display name (which is the renameable label)
    return entityType?.name || 'Unknown';
}
/**
 * Get display label for a field
 */
export async function getFieldDisplayLabel(schoolId, fieldDefinitionId) {
    const fieldDef = await db.query.fieldDefinitions.findFirst({
        where: and(eq(fieldDefinitions.schoolId, schoolId), eq(fieldDefinitions.id, fieldDefinitionId)),
    });
    // Return the display name (which is the renameable label)
    return fieldDef?.name || 'Unknown';
}
/**
 * Rename an entity type's display label
 * This ripples through every screen showing that pillar's label
 */
export async function renameEntityType(schoolId, entityTypeId, newDisplayName) {
    // Validate the new name
    if (!newDisplayName || newDisplayName.trim().length === 0) {
        return { success: false, error: 'Display name cannot be empty' };
    }
    // Update the display name
    await db.update(entityTypes)
        .set({ name: newDisplayName.trim() })
        .where(and(eq(entityTypes.schoolId, schoolId), eq(entityTypes.id, entityTypeId)));
    return { success: true };
}
/**
 * Rename a field's display label
 * This ripples through every screen showing that field's label
 */
export async function renameField(schoolId, fieldDefinitionId, newDisplayName) {
    // Validate the new name
    if (!newDisplayName || newDisplayName.trim().length === 0) {
        return { success: false, error: 'Display name cannot be empty' };
    }
    // Update the display name
    await db.update(fieldDefinitions)
        .set({ name: newDisplayName.trim() })
        .where(and(eq(fieldDefinitions.schoolId, schoolId), eq(fieldDefinitions.id, fieldDefinitionId)));
    return { success: true };
}
/**
 * Get all labels for an entity type (for UI rendering)
 */
export async function getEntityLabels(schoolId, entityTypeId) {
    const entityType = await db.query.entityTypes.findFirst({
        where: and(eq(entityTypes.schoolId, schoolId), eq(entityTypes.id, entityTypeId)),
    });
    const fields = await db.query.fieldDefinitions.findMany({
        where: and(eq(fieldDefinitions.schoolId, schoolId), eq(fieldDefinitions.entityTypeId, entityTypeId)),
    });
    return {
        entityName: entityType?.name || 'Unknown',
        fields: fields.map(f => ({
            internalName: f.internalName,
            displayName: f.name,
        })),
    };
}
/**
 * Labels cache for performance
 * In production, this would be Redis or in-memory cache
 */
const labelsCache = new Map();
export function getCachedLabels(schoolId, entityTypeId) {
    return labelsCache.get(`${schoolId}:${entityTypeId}`);
}
export function setCachedLabels(schoolId, entityTypeId, labels) {
    labelsCache.set(`${schoolId}:${entityTypeId}`, labels);
}
export function clearLabelsCache(schoolId, entityTypeId) {
    if (entityTypeId) {
        labelsCache.delete(`${schoolId}:${entityTypeId}`);
    }
    else {
        // Clear all labels for this school
        for (const key of labelsCache.keys()) {
            if (key.startsWith(`${schoolId}:`)) {
                labelsCache.delete(key);
            }
        }
    }
}
//# sourceMappingURL=labels.js.map
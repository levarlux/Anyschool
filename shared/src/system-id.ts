// Invisible System ID Mechanism
// The invisible system ID is simply the primary key of entity_records.
// Human-facing identifiers are just regular field values stored in field_values.

import { db } from '../api/src/db';
import { entityRecords, fieldDefinitions, fieldValues } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Get the invisible system ID for an entity record
 * This is just the UUID primary key - never displayed to users
 */
export async function getSystemId(entityRecordId: string): Promise<string> {
  return entityRecordId; // The ID itself is the invisible system ID
}

/**
 * Find an entity record by a human-facing identifier field
 * e.g., find a Learner by their admission number
 */
export async function findByIdentifier(
  schoolId: string,
  entityTypeId: string,
  identifierInternalName: string,
  identifierValue: string
): Promise<string | null> {
  // Find the field definition marked as identifier
  const identifierField = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId),
      eq(fieldDefinitions.internalName, identifierInternalName),
      eq(fieldDefinitions.isIdentifier, true)
    ),
  });

  if (!identifierField) {
    return null;
  }

  // Find the field value matching the identifier
  const fieldValue = await db.query.fieldValues.findFirst({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.fieldDefinitionId, identifierField.id),
      eq(fieldValues.textValue, identifierValue)
    ),
  });

  if (!fieldValue) {
    return null;
  }

  return fieldValue.entityRecordId;
}

/**
 * Get the display value for an entity record's identifier
 */
export async function getDisplayIdentifier(
  schoolId: string,
  entityTypeId: string,
  entityRecordId: string
): Promise<string | null> {
  // Find the field definition marked as identifier
  const identifierField = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId),
      eq(fieldDefinitions.isIdentifier, true)
    ),
  });

  if (!identifierField) {
    return null;
  }

  // Find the field value for this record
  const fieldValue = await db.query.fieldValues.findFirst({
    where: and(
      eq(fieldValues.schoolId, schoolId),
      eq(fieldValues.entityRecordId, entityRecordId),
      eq(fieldValues.fieldDefinitionId, identifierField.id)
    ),
  });

  if (!fieldValue) {
    return null;
  }

  return fieldValue.textValue;
}
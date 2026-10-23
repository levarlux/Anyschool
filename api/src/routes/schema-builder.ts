// Schema Builder API Routes
// Doc 03 §8 — The interface a school uses to create sections/fields/relationships

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import {
  entityTypes,
  sections,
  fieldDefinitions,
  relationshipDefinitions,
  entityRecords,
  fieldValues,
} from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { validateInternalName, generateInternalName } from '../../../shared/src/blocks/labels';
import { createTextBlock, createNumberBlock, createSelectBlock } from '../../../shared/src/blocks/value-blocks';

const schemaBuilder = new Hono();

// Validation schemas
const createSectionSchema = z.object({
  entityTypeId: z.string().uuid(),
  name: z.string().min(1),
  internalName: z.string().optional(),
  displayOrder: z.number().optional(),
});

const createFieldSchema = z.object({
  entityTypeId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  name: z.string().min(1),
  internalName: z.string().optional(),
  dataType: z.enum(['text', 'number', 'datetime', 'boolean', 'select', 'file']),
  unit: z.string().optional(),
  isRequired: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isIdentifier: z.boolean().optional(),
  displayOrder: z.number().optional(),
  options: z.array(z.string()).optional(),
  defaultValue: z.string().optional(),
  validation: z.object({
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
});

const createRelationshipSchema = z.object({
  fromEntityTypeId: z.string().uuid(),
  toEntityTypeId: z.string().uuid(),
  cardinality: z.enum(['1-1', '1-many', 'many-many']),
});

// Get all entity types for a school
schemaBuilder.get('/entity-types', async (c) => {
  const schoolId = c.req.query('schoolId') || c.get('schoolId');
  if (!schoolId) return c.json({ error: 'schoolId required' }, 400);
  const types = await db.query.entityTypes.findMany({
    where: eq(entityTypes.schoolId, schoolId),
  });
  return c.json(types);
});

// Get records for an entity type with field values
schemaBuilder.get('/records/:entityTypeId', async (c) => {
  const schoolId = c.req.query('schoolId') || c.get('schoolId');
  if (!schoolId) return c.json({ error: 'schoolId required' }, 400);
  const entityTypeId = c.req.param('entityTypeId');

  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
    ),
    limit: 200,
  });

  const recordIds = records.map(r => r.id);
  if (recordIds.length === 0) return c.json([]);

  // Get all field definitions for this entity type
  const fields = await db.query.fieldDefinitions.findMany({
    where: eq(fieldDefinitions.entityTypeId, entityTypeId),
  });
  const fieldMap = new Map(fields.map(f => [f.id, f.internalName]));

  // Get all field values for these records
  const allValues = await db.query.fieldValues.findMany({
    where: (fv, { inArray }) => inArray(fv.entityRecordId, recordIds),
  });

  // Group values by record
  const valueMap = new Map<string, Record<string, any>>();
  const fieldDefs = new Map(fields.map(f => [f.id, f]));
  for (const v of allValues) {
    if (!valueMap.has(v.entityRecordId)) valueMap.set(v.entityRecordId, {});
    const internalName = fieldMap.get(v.fieldDefinitionId);
    if (internalName) {
      const recordValues = valueMap.get(v.entityRecordId)!;
      // For file type, return URL from the JSONB fileValue; otherwise return typed value
      const def = fieldDefs.get(v.fieldDefinitionId);
      if (def?.dataType === 'file' && v.fileValue) {
        recordValues[internalName] = (v.fileValue as any)?.url ?? v.fileValue;
      } else {
        recordValues[internalName] = v.textValue ?? v.numericValue ?? v.dateValue ?? v.booleanValue;
      }
    }
  }

  const result = records.map(r => ({
    id: r.id,
    values: valueMap.get(r.id) || {},
    createdAt: r.createdAt,
  }));

  return c.json(result);
});

// Get entity type with sections and fields
schemaBuilder.get('/entity-types/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const entityTypeId = c.req.param('id');

  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, entityTypeId)
    ),
  });

  if (!entityType) {
    return c.json({ error: 'Entity type not found' }, 404);
  }

  const entitySections = await db.query.sections.findMany({
    where: and(
      eq(sections.schoolId, schoolId),
      eq(sections.entityTypeId, entityTypeId)
    ),
    orderBy: (sections, { asc }) => [asc(sections.displayOrder)],
  });

  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
    orderBy: (fieldDefinitions, { asc }) => [asc(fieldDefinitions.displayOrder)],
  });

  // Flatten fileSubtype for convenience
  const flatFields = fields.map(f => ({
    ...f,
    fileSubtype: (f.validationRules as any)?.fileSubtype ?? null,
  }));

  // Group fields by section
  const sectionsWithFields = entitySections.map(section => ({
    ...section,
    fields: flatFields.filter(f => f.sectionId === section.id),
  }));

  // Include fields without a section
  const unsectionedFields = flatFields.filter(f => !f.sectionId);

  return c.json({
    ...entityType,
    sections: sectionsWithFields,
    unsectionedFields,
  });
});

// Create a section
schemaBuilder.post('/sections', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createSectionSchema.parse(body);

  const internalName = validated.internalName || generateInternalName(validated.name);

  // Validate internal name
  const nameValidation = validateInternalName(internalName);
  if (!nameValidation.valid) {
    return c.json({ error: nameValidation.error }, 400);
  }

  // Check for duplicate internal name within entity type
  const existing = await db.query.sections.findFirst({
    where: and(
      eq(sections.schoolId, schoolId),
      eq(sections.entityTypeId, validated.entityTypeId),
      eq(sections.internalName, internalName)
    ),
  });

  if (existing) {
    return c.json({ error: 'A section with this internal name already exists' }, 400);
  }

  const section = await db.insert(sections).values({
    schoolId,
    entityTypeId: validated.entityTypeId,
    name: validated.name,
    internalName,
    displayOrder: validated.displayOrder || 0,
  }).returning();

  return c.json(section[0], 201);
});

// Update a section
schemaBuilder.put('/sections/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const sectionId = c.req.param('id');
  const body = await c.req.json();

  const section = await db.query.sections.findFirst({
    where: and(
      eq(sections.schoolId, schoolId),
      eq(sections.id, sectionId)
    ),
  });

  if (!section) {
    return c.json({ error: 'Section not found' }, 404);
  }

  const updated = await db.update(sections)
    .set({
      name: body.name || section.name,
      displayOrder: body.displayOrder ?? section.displayOrder,
    })
    .where(and(
      eq(sections.schoolId, schoolId),
      eq(sections.id, sectionId)
    ))
    .returning();

  return c.json(updated[0]);
});

// Delete a section
schemaBuilder.delete('/sections/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const sectionId = c.req.param('id');

  const section = await db.query.sections.findFirst({
    where: and(
      eq(sections.schoolId, schoolId),
      eq(sections.id, sectionId)
    ),
  });

  if (!section) {
    return c.json({ error: 'Section not found' }, 404);
  }

  // Move fields to unsectioned
  await db.update(fieldDefinitions)
    .set({ sectionId: null })
    .where(and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.sectionId, sectionId)
    ));

  // Delete section
  await db.delete(sections).where(and(
    eq(sections.schoolId, schoolId),
    eq(sections.id, sectionId)
  ));

  return c.json({ success: true });
});

// Create a field
schemaBuilder.post('/fields', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createFieldSchema.parse(body);

  const internalName = validated.internalName || generateInternalName(validated.name);

  // Validate internal name
  const nameValidation = validateInternalName(internalName);
  if (!nameValidation.valid) {
    return c.json({ error: nameValidation.error }, 400);
  }

  // Check for duplicate internal name within entity type
  const existing = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, validated.entityTypeId),
      eq(fieldDefinitions.internalName, internalName)
    ),
  });

  if (existing) {
    return c.json({ error: 'A field with this internal name already exists' }, 400);
  }

  // If marking as identifier, ensure no other identifier exists for this entity type
  if (validated.isIdentifier) {
    const existingIdentifier = await db.query.fieldDefinitions.findFirst({
      where: and(
        eq(fieldDefinitions.schoolId, schoolId),
        eq(fieldDefinitions.entityTypeId, validated.entityTypeId),
        eq(fieldDefinitions.isIdentifier, true)
      ),
    });

    if (existingIdentifier) {
      return c.json({ error: 'An identifier field already exists for this entity type' }, 400);
    }
  }

  const field = await db.insert(fieldDefinitions).values({
    schoolId,
    entityTypeId: validated.entityTypeId,
    sectionId: validated.sectionId,
    name: validated.name,
    internalName,
    dataType: validated.dataType,
    unit: validated.unit,
    isRequired: validated.isRequired || false,
    isUnique: validated.isUnique || false,
    isIdentifier: validated.isIdentifier || false,
    displayOrder: validated.displayOrder || 0,
    options: validated.options,
    defaultValue: validated.defaultValue,
    validationRules: validated.validation || {},
  }).returning();

  return c.json(field[0], 201);
});

// Update a field
schemaBuilder.put('/fields/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const fieldId = c.req.param('id');
  const body = await c.req.json();

  const field = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.id, fieldId)
    ),
  });

  if (!field) {
    return c.json({ error: 'Field not found' }, 404);
  }

  const updated = await db.update(fieldDefinitions)
    .set({
      name: body.name || field.name,
      sectionId: body.sectionId ?? field.sectionId,
      unit: body.unit ?? field.unit,
      isRequired: body.isRequired ?? field.isRequired,
      isUnique: body.isUnique ?? field.isUnique,
      isIdentifier: body.isIdentifier ?? field.isIdentifier,
      displayOrder: body.displayOrder ?? field.displayOrder,
      options: body.options ?? field.options,
      defaultValue: body.defaultValue ?? field.defaultValue,
      validationRules: body.validation ?? field.validationRules,
    })
    .where(and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.id, fieldId)
    ))
    .returning();

  return c.json(updated[0]);
});

// Delete a field
schemaBuilder.delete('/fields/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const fieldId = c.req.param('id');

  const field = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.id, fieldId)
    ),
  });

  if (!field) {
    return c.json({ error: 'Field not found' }, 404);
  }

  // Soft delete - mark as inactive (field_values remain for recovery)
  await db.delete(fieldDefinitions).where(and(
    eq(fieldDefinitions.schoolId, schoolId),
    eq(fieldDefinitions.id, fieldId)
  ));

  return c.json({ success: true });
});

// Create a relationship
schemaBuilder.post('/relationships', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createRelationshipSchema.parse(body);

  // Check for duplicate relationship
  const existing = await db.query.relationshipDefinitions.findFirst({
    where: and(
      eq(relationshipDefinitions.schoolId, schoolId),
      eq(relationshipDefinitions.fromEntityTypeId, validated.fromEntityTypeId),
      eq(relationshipDefinitions.toEntityTypeId, validated.toEntityTypeId)
    ),
  });

  if (existing) {
    return c.json({ error: 'A relationship between these entity types already exists' }, 400);
  }

  const relationship = await db.insert(relationshipDefinitions).values({
    schoolId,
    fromEntityTypeId: validated.fromEntityTypeId,
    toEntityTypeId: validated.toEntityTypeId,
    cardinality: validated.cardinality,
    isDefault: false,
    isActive: true,
  }).returning();

  return c.json(relationship[0], 201);
});

// Delete a relationship
schemaBuilder.delete('/relationships/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const relationshipId = c.req.param('id');

  const relationship = await db.query.relationshipDefinitions.findFirst({
    where: and(
      eq(relationshipDefinitions.schoolId, schoolId),
      eq(relationshipDefinitions.id, relationshipId)
    ),
  });

  if (!relationship) {
    return c.json({ error: 'Relationship not found' }, 404);
  }

  // Soft delete - mark as inactive
  await db.update(relationshipDefinitions)
    .set({ isActive: false })
    .where(and(
      eq(relationshipDefinitions.schoolId, schoolId),
      eq(relationshipDefinitions.id, relationshipId)
    ));

  return c.json({ success: true });
});

export default schemaBuilder;
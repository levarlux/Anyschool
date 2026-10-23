// Upload/Import Handling API Routes
// Doc 03 §9 — Entity-type detection, matching priority, preview-before-commit, reconciliation

import { Hono } from 'hono';
import { db } from '../db';
import {
  entityTypes,
  fieldDefinitions,
  entityRecords,
  fieldValues,
} from '../../../drizzle/schema';
import { eq, and, inArray } from 'drizzle-orm';

const uploadImport = new Hono();

interface UploadColumn {
  header: string;
  values: any[];
}

interface MatchResult {
  entityTypeId: string;
  entityTypeName: string;
  confidence: number;
  matchedFields: Array<{
    uploadColumn: string;
    fieldDefinitionId: string;
    fieldName: string;
  }>;
  unmatchedColumns: string[];
}

/**
 * Detect entity type from uploaded column headers
 */
async function detectEntityType(
  schoolId: string,
  columns: string[]
): Promise<MatchResult[]> {
  // Get all entity types for this school
  const types = await db.query.entityTypes.findMany({
    where: eq(entityTypes.schoolId, schoolId),
  });

  // Get all field definitions for all entity types
  const allFields = await db.query.fieldDefinitions.findMany({
    where: inArray(
      fieldDefinitions.entityTypeId,
      types.map(t => t.id)
    ),
  });

  const results: MatchResult[] = [];

  for (const entityType of types) {
    const typeFields = allFields.filter(f => f.entityTypeId === entityType.id);
    const matchedFields: MatchResult['matchedFields'] = [];
    const unmatchedColumns: string[] = [];

    for (const column of columns) {
      const normalizedColumn = column.toLowerCase().replace(/[_\s]+/g, '');

      // Try exact match on internal name
      let matched = typeFields.find(
        f => f.internalName.toLowerCase() === normalizedColumn
      );

      // Try match on display name (normalized)
      if (!matched) {
        matched = typeFields.find(
          f => f.name.toLowerCase().replace(/[_\s]+/g, '') === normalizedColumn
        );
      }

      // Try partial match
      if (!matched) {
        matched = typeFields.find(
          f => normalizedColumn.includes(f.internalName.toLowerCase()) ||
               f.internalName.toLowerCase().includes(normalizedColumn)
        );
      }

      if (matched) {
        matchedFields.push({
          uploadColumn: column,
          fieldDefinitionId: matched.id,
          fieldName: matched.name,
        });
      } else {
        unmatchedColumns.push(column);
      }
    }

    // Calculate confidence based on matched fields
    const confidence = typeFields.length > 0
      ? matchedFields.length / typeFields.length
      : 0;

    // Only include if we matched at least one field
    if (matchedFields.length > 0) {
      results.push({
        entityTypeId: entityType.id,
        entityTypeName: entityType.name,
        confidence,
        matchedFields,
        unmatchedColumns,
      });
    }
  }

  // Sort by confidence (highest first)
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Preview upload before commit
 */
uploadImport.post('/preview', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { columns, entityTypeId } = body;

  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    return c.json({ error: 'No columns provided' }, 400);
  }

  // Get field definitions for the specified or detected entity type
  let targetEntityTypeId = entityTypeId;

  if (!targetEntityTypeId) {
    // Auto-detect entity type
    const detections = await detectEntityType(schoolId, columns.map((col: UploadColumn) => col.header));
    if (detections.length === 0) {
      return c.json({ error: 'Could not detect entity type from columns' }, 400);
    }
    targetEntityTypeId = detections[0].entityTypeId;
  }

  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, targetEntityTypeId)
    ),
  });

  // Get identifier field
  const identifierField = fields.find(f => f.isIdentifier);

  // Get existing records for matching
  const existingRecords = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, targetEntityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get existing field values for identifier field
  let existingIdentifierValues: Map<string, string> = new Map();
  if (identifierField) {
    const identifierValues = await db.query.fieldValues.findMany({
      where: and(
        eq(fieldValues.schoolId, schoolId),
        eq(fieldValues.fieldDefinitionId, identifierField.id)
      ),
    });

    for (const val of identifierValues) {
      if (val.textValue) {
        existingIdentifierValues.set(val.textValue, val.entityRecordId);
      }
    }
  }

  // Analyze each row
  const preview = {
    new: 0,
    updated: 0,
    unchanged: 0,
    missing: existingRecords.length,
    rows: [] as any[],
  };

  // Get first column as data rows (assuming first row is header)
  const dataRows = columns[0]?.values || [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowData: Record<string, any> = {};
    for (const column of columns) {
      rowData[column.header] = column.values[i];
    }

    let status = 'new';
    let existingRecordId: string | null = null;

    // Try to match by identifier
    if (identifierField) {
      const identifierValue = rowData[identifierField.name] || rowData[identifierField.internalName];
      if (identifierValue && existingIdentifierValues.has(String(identifierValue))) {
        existingRecordId = existingIdentifierValues.get(String(identifierValue))!;
        status = 'updated';
        preview.missing--;
      }
    }

    preview.rows.push({
      row: i + 1,
      status,
      recordId: existingRecordId,
      data: rowData,
    });

    if (status === 'new') preview.new++;
    else if (status === 'updated') preview.updated++;
  }

  return c.json(preview);
});

/**
 * Commit upload/import
 */
uploadImport.post('/commit', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { entityTypeId, rows, createNewFields } = body;

  if (!entityTypeId || !rows || !Array.isArray(rows)) {
    return c.json({ error: 'Invalid commit data' }, 400);
  }

  // Get field definitions
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
  });

  const results = {
    created: 0,
    updated: 0,
    errors: [] as string[],
  };

  for (const row of rows) {
    try {
      let recordId = row.recordId;

      // Create new record if needed
      if (row.status === 'new') {
        const newRecord = await db.insert(entityRecords).values({
          schoolId,
          entityTypeId,
          isDeleted: false,
        }).returning();
        recordId = newRecord[0].id;
        results.created++;
      } else if (row.status === 'updated' && recordId) {
        results.updated++;
      }

      // Insert/update field values
      if (recordId) {
        for (const [header, value] of Object.entries(row.data)) {
          // Find matching field definition
          let field = fields.find(f => f.internalName === header.toLowerCase().replace(/[_\s]+/g, ''));
          if (!field) {
            field = fields.find(f => f.name.toLowerCase() === header.toLowerCase());
          }

          if (field && value !== null && value !== undefined && value !== '') {
            // Check if value already exists
            const existingValue = await db.query.fieldValues.findFirst({
              where: and(
                eq(fieldValues.schoolId, schoolId),
                eq(fieldValues.entityRecordId, recordId),
                eq(fieldValues.fieldDefinitionId, field.id)
              ),
            });

            const updateData: any = {
              schoolId,
              entityRecordId: recordId,
              fieldDefinitionId: field.id,
            };

            // Set appropriate typed column
            switch (field.dataType) {
              case 'text':
              case 'select':
                updateData.textValue = String(value);
                break;
              case 'number':
                updateData.numericValue = Number(value);
                break;
              case 'datetime':
                updateData.dateValue = String(value);
                break;
              case 'boolean':
                updateData.booleanValue = Boolean(value);
                break;
              case 'file':
                updateData.fileValue = { url: value, key: '', name: '', type: '', size: 0 };
                break;
            }

            if (existingValue) {
              await db.update(fieldValues)
                .set(updateData)
                .where(eq(fieldValues.id, existingValue.id));
            } else {
              await db.insert(fieldValues).values(updateData);
            }
          }
        }
      }
    } catch (error) {
      results.errors.push(`Row ${row.row}: ${error}`);
    }
  }

  return c.json(results);
});

/**
 * Create new fields from unmatched columns
 */
uploadImport.post('/create-fields', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { entityTypeId, columns } = body;

  if (!entityTypeId || !columns || !Array.isArray(columns)) {
    return c.json({ error: 'Invalid data' }, 400);
  }

  const createdFields = [];

  for (const column of columns) {
    // Generate internal name
    const internalName = column.header.toLowerCase().replace(/[_\s]+/g, '');

    // Check if field already exists
    const existing = await db.query.fieldDefinitions.findFirst({
      where: and(
        eq(fieldDefinitions.schoolId, schoolId),
        eq(fieldDefinitions.entityTypeId, entityTypeId),
        eq(fieldDefinitions.internalName, internalName)
      ),
    });

    if (!existing) {
      // Determine data type based on sample values
      let dataType = 'text';
      if (column.values && column.values.length > 0) {
        const sampleValues = column.values.slice(0, 10).filter((v: any) => v !== null && v !== '');
        const allNumbers = sampleValues.every((v: any) => !isNaN(Number(v)));
        const allDates = sampleValues.every((v: any) => !isNaN(Date.parse(v)));

        if (allNumbers) dataType = 'number';
        else if (allDates) dataType = 'datetime';
      }

      const field = await db.insert(fieldDefinitions).values({
        schoolId,
        entityTypeId,
        name: column.header,
        internalName,
        dataType,
        isRequired: false,
        isUnique: false,
        isIdentifier: false,
        displayOrder: 0,
      }).returning();

      createdFields.push(field[0]);
    }
  }

  return c.json({ created: createdFields.length, fields: createdFields });
});

export default uploadImport;
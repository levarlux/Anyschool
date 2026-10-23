// Bulk Operations API Routes
// Doc 03 §10 — Bulk document generation, global search, export, bulk edit, audit trail

import { Hono } from 'hono';
import { db } from '../db';
import {
  entityTypes,
  entityRecords,
  fieldValues,
  fieldDefinitions,
} from '../../../drizzle/schema';
import { eq, and, like, or, SQL } from 'drizzle-orm';

const bulkOperations = new Hono();

// Audit trail table (to be created in migration)
interface AuditEntry {
  id: string;
  schoolId: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  field?: string;
  oldValue?: any;
  newValue?: any;
  userId: string;
  timestamp: Date;
}

// In-memory audit log (replace with database table in production)
const auditLog: AuditEntry[] = [];

/**
 * Global Search - Searches dynamically across all fields for a school
 */
bulkOperations.get('/search', async (c) => {
  const schoolId = c.get('schoolId');
  const query = c.req.query('q');

  if (!query || query.length < 2) {
    return c.json({ error: 'Search query must be at least 2 characters' }, 400);
  }

  const results: any[] = [];

  // Get all entity types
  const types = await db.query.entityTypes.findMany({
    where: eq(entityTypes.schoolId, schoolId),
  });

  for (const entityType of types) {
    // Get all field definitions for this entity type
    const fields = await db.query.fieldDefinitions.findMany({
      where: and(
        eq(fieldDefinitions.schoolId, schoolId),
        eq(fieldDefinitions.entityTypeId, entityType.id)
      ),
    });

    // Search in text fields
    const textFields = fields.filter(f => f.dataType === 'text' || f.dataType === 'select');

    for (const field of textFields) {
      const matchingValues = await db.query.fieldValues.findMany({
        where: and(
          eq(fieldValues.schoolId, schoolId),
          eq(fieldValues.fieldDefinitionId, field.id),
          like(fieldValues.textValue, `%${query}%`)
        ),
      });

      for (const value of matchingValues) {
        // Get the entity record
        const record = await db.query.entityRecords.findFirst({
          where: eq(entityRecords.id, value.entityRecordId),
        });

        if (record && !record.isDeleted) {
          results.push({
            entityType: entityType.name,
            entityId: record.id,
            fieldName: field.name,
            fieldValue: value.textValue,
            matchType: 'text',
          });
        }
      }
    }

    // Search in numeric fields (if query is a number)
    if (!isNaN(Number(query))) {
      const numberFields = fields.filter(f => f.dataType === 'number');
      for (const field of numberFields) {
        const matchingValues = await db.query.fieldValues.findMany({
          where: and(
            eq(fieldValues.schoolId, schoolId),
            eq(fieldValues.fieldDefinitionId, field.id),
            eq(fieldValues.numericValue, Number(query))
          ),
        });

        for (const value of matchingValues) {
          const record = await db.query.entityRecords.findFirst({
            where: eq(entityRecords.id, value.entityRecordId),
          });

          if (record && !record.isDeleted) {
            results.push({
              entityType: entityType.name,
              entityId: record.id,
              fieldName: field.name,
              fieldValue: value.numericValue,
              matchType: 'number',
            });
          }
        }
      }
    }
  }

  return c.json({
    query,
    totalResults: results.length,
    results: results.slice(0, 50), // Limit to 50 results
  });
});

/**
 * Export - Download data as Excel/CSV
 */
bulkOperations.get('/export/:entityTypeId', async (c) => {
  const schoolId = c.get('schoolId');
  const entityTypeId = c.req.param('entityTypeId');
  const format = c.req.query('format') || 'csv';

  // Get entity type
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, entityTypeId)
    ),
  });

  if (!entityType) {
    return c.json({ error: 'Entity type not found' }, 404);
  }

  // Get all fields
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
  });

  // Get all records
  const records = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, entityTypeId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get all field values
  const allValues = await db.query.fieldValues.findMany({
    where: eq(fieldValues.schoolId, schoolId),
  });

  // Build export data
  const exportData = records.map(record => {
    const rowData: Record<string, any> = {};
    for (const field of fields) {
      const value = allValues.find(
        v => v.entityRecordId === record.id && v.fieldDefinitionId === field.id
      );
      rowData[field.name] = value?.textValue || value?.numericValue || value?.dateValue || '';
    }
    return rowData;
  });

  // Generate CSV
  if (format === 'csv') {
    const headers = fields.map(f => f.name);
    const csvRows = [headers.join(',')];

    for (const row of exportData) {
      const values = headers.map(h => {
        const val = row[h];
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      });
      csvRows.push(values.join(','));
    }

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="${entityType.name}.csv"`);
    return c.body(csvRows.join('\n'));
  }

  // Return JSON for other formats
  return c.json({
    entityType: entityType.name,
    totalRecords: exportData.length,
    data: exportData,
  });
});

/**
 * Bulk Edit - Apply change to one field across multiple records
 */
bulkOperations.post('/bulk-edit', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { entityTypeId, fieldDefinitionId, recordIds, value } = body;

  if (!entityTypeId || !fieldDefinitionId || !recordIds || !Array.isArray(recordIds)) {
    return c.json({ error: 'Invalid bulk edit data' }, 400);
  }

  // Get field definition
  const field = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.id, fieldDefinitionId)
    ),
  });

  if (!field) {
    return c.json({ error: 'Field not found' }, 404);
  }

  let updatedCount = 0;

  for (const recordId of recordIds) {
    // Check if record exists
    const record = await db.query.entityRecords.findFirst({
      where: and(
        eq(entityRecords.schoolId, schoolId),
        eq(entityRecords.id, recordId),
        eq(entityRecords.entityTypeId, entityTypeId)
      ),
    });

    if (!record) continue;

    // Get existing value
    const existingValue = await db.query.fieldValues.findFirst({
      where: and(
        eq(fieldValues.schoolId, schoolId),
        eq(fieldValues.entityRecordId, recordId),
        eq(fieldValues.fieldDefinitionId, fieldDefinitionId)
      ),
    });

    const updateData: any = {
      schoolId,
      entityRecordId: recordId,
      fieldDefinitionId,
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
    }

    if (existingValue) {
      await db.update(fieldValues)
        .set(updateData)
        .where(eq(fieldValues.id, existingValue.id));
    } else {
      await db.insert(fieldValues).values(updateData);
    }

    // Log to audit trail
    auditLog.push({
      id: crypto.randomUUID(),
      schoolId,
      entityType: entityTypeId,
      entityId: recordId,
      action: 'update',
      field: field.internalName,
      oldValue: existingValue?.textValue || existingValue?.numericValue,
      newValue: value,
      userId: c.get('userId') || 'system',
      timestamp: new Date(),
    });

    updatedCount++;
  }

  return c.json({ updated: updatedCount });
});

/**
 * Audit Trail - Get audit history
 */
bulkOperations.get('/audit-trail', async (c) => {
  const schoolId = c.get('schoolId');
  const entityType = c.req.query('entityType');
  const entityId = c.req.query('entityId');
  const limit = parseInt(c.req.query('limit') || '100');

  let filteredLog = auditLog.filter(entry => entry.schoolId === schoolId);

  if (entityType) {
    filteredLog = filteredLog.filter(entry => entry.entityType === entityType);
  }

  if (entityId) {
    filteredLog = filteredLog.filter(entry => entry.entityId === entityId);
  }

  // Sort by timestamp (newest first)
  filteredLog.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return c.json({
    total: filteredLog.length,
    entries: filteredLog.slice(0, limit),
  });
});

/**
 * Bulk Document Generation
 * A school designs one template using their own fields; the system generates one document per record
 */
bulkOperations.post('/generate-documents', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { entityTypeId, template, recordIds } = body;

  if (!entityTypeId || !template) {
    return c.json({ error: 'Invalid document generation data' }, 400);
  }

  // Get entity type
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, entityTypeId)
    ),
  });

  if (!entityType) {
    return c.json({ error: 'Entity type not found' }, 404);
  }

  // Get records to process
  let records;
  if (recordIds && recordIds.length > 0) {
    records = await db.query.entityRecords.findMany({
      where: and(
        eq(entityRecords.schoolId, schoolId),
        eq(entityRecords.entityTypeId, entityTypeId),
        eq(entityRecords.isDeleted, false)
      ),
    });
    records = records.filter(r => recordIds.includes(r.id));
  } else {
    records = await db.query.entityRecords.findMany({
      where: and(
        eq(entityRecords.schoolId, schoolId),
        eq(entityRecords.entityTypeId, entityTypeId),
        eq(entityRecords.isDeleted, false)
      ),
    });
  }

  // Get all field definitions
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
  });

  // Get all field values
  const allValues = await db.query.fieldValues.findMany({
    where: eq(fieldValues.schoolId, schoolId),
  });

  // Generate documents
  const documents = records.map(record => {
    let documentContent = template;

    // Replace merge fields with actual values
    for (const field of fields) {
      const value = allValues.find(
        v => v.entityRecordId === record.id && v.fieldDefinitionId === field.id
      );

      const fieldValue = value?.textValue || value?.numericValue || value?.dateValue || '';
      const mergeField = `{${field.internalName}}`;
      documentContent = documentContent.replace(new RegExp(mergeField, 'g'), String(fieldValue));
    }

    return {
      recordId: record.id,
      content: documentContent,
    };
  });

  return c.json({
    entityType: entityType.name,
    totalDocuments: documents.length,
    documents,
  });
});

export default bulkOperations;
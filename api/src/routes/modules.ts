// Modules API Routes
// Doc 06 — Finance, Library, HR, Health, Communication, Custom modules

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import {
  entityTypes,
  relationshipDefinitions,
  entityRecords,
  fieldValues,
  fieldDefinitions,
  schools,
} from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

const modules = new Hono();

// Suggested module types with default relationships
const SUGGESTED_MODULES = [
  {
    name: 'Finance',
    internalName: 'finance',
    icon: 'dollar-sign',
    color: '#10B981',
    defaultRelationships: [
      { target: 'learner', cardinality: 'many-many', description: 'Track financial records per learner' },
      { target: 'term', cardinality: 'many-many', description: 'Link fees to specific terms' },
      { target: 'class', cardinality: 'many-many', description: 'Class-based fee structures' },
    ],
  },
  {
    name: 'Library',
    internalName: 'library',
    icon: 'book-open',
    color: '#8B5CF6',
    defaultRelationships: [
      { target: 'learner', cardinality: 'many-many', description: 'Track book borrowing by learners' },
      { target: 'teacher', cardinality: 'many-many', description: 'Track book borrowing by teachers' },
    ],
  },
  {
    name: 'HR',
    internalName: 'hr',
    icon: 'users',
    color: '#F59E0B',
    defaultRelationships: [
      { target: 'teacher', cardinality: 'many-many', description: 'Staff records and management' },
    ],
  },
  {
    name: 'Health',
    internalName: 'health',
    icon: 'heart',
    color: '#EF4444',
    defaultRelationships: [
      { target: 'learner', cardinality: 'many-many', description: 'Health records for learners' },
      { target: 'teacher', cardinality: 'many-many', description: 'Health records for teachers' },
    ],
  },
  {
    name: 'Communication',
    internalName: 'communication',
    icon: 'message-square',
    color: '#06B6D4',
    defaultRelationships: [
      { target: 'learner', cardinality: 'many-many', description: 'Communications with learners' },
      { target: 'teacher', cardinality: 'many-many', description: 'Communications with teachers' },
    ],
  },
];

// Get suggested module types
modules.get('/suggested', async (c) => {
  const schoolId = c.get('schoolId');

  // Get existing modules for this school
  const existingModules = await db.query.entityTypes.findMany({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.isCore, false)
    ),
  });

  const existingInternalNames = existingModules.map(m => m.internalName);

  // Mark which modules are already installed
  const suggestedWithStatus = SUGGESTED_MODULES.map(module => ({
    ...module,
    installed: existingInternalNames.includes(module.internalName),
  }));

  return c.json(suggestedWithStatus);
});

// Get all modules for a school (core + custom)
modules.get('/', async (c) => {
  const schoolId = c.get('schoolId');

  const allModules = await db.query.entityTypes.findMany({
    where: eq(entityTypes.schoolId, schoolId),
  });

  return c.json(allModules);
});

// Install a suggested module
modules.post('/install', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { moduleInternalName } = body;

  const moduleConfig = SUGGESTED_MODULES.find(m => m.internalName === moduleInternalName);
  if (!moduleConfig) {
    return c.json({ error: 'Unknown module type' }, 400);
  }

  // Check if already installed
  const existing = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, moduleInternalName)
    ),
  });

  if (existing) {
    return c.json({ error: 'Module already installed' }, 400);
  }

  // Create entity type for this module
  const entityType = await db.insert(entityTypes).values({
    schoolId,
    name: moduleConfig.name,
    internalName: moduleConfig.internalName,
    isCore: false,
    isDeletable: true,
    icon: moduleConfig.icon,
    color: moduleConfig.color,
  }).returning();

  // Create default relationships
  const allEntityTypes = await db.query.entityTypes.findMany({
    where: eq(entityTypes.schoolId, schoolId),
  });

  for (const rel of moduleConfig.defaultRelationships) {
    const targetEntityType = allEntityTypes.find(
      et => et.internalName === rel.target
    );

    if (targetEntityType) {
      // Check if relationship already exists
      const existingRel = await db.query.relationshipDefinitions.findFirst({
        where: and(
          eq(relationshipDefinitions.schoolId, schoolId),
          eq(relationshipDefinitions.fromEntityTypeId, entityType[0].id),
          eq(relationshipDefinitions.toEntityTypeId, targetEntityType.id)
        ),
      });

      if (!existingRel) {
        await db.insert(relationshipDefinitions).values({
          schoolId,
          fromEntityTypeId: entityType[0].id,
          toEntityTypeId: targetEntityType.id,
          cardinality: rel.cardinality,
          isDefault: true,
          isActive: true,
        });
      }
    }
  }

  return c.json({
    success: true,
    module: entityType[0],
    relationshipsCreated: moduleConfig.defaultRelationships.length,
  });
});

// Uninstall a module (soft delete)
modules.delete('/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const moduleId = c.req.param('id');

  const module = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, moduleId)
    ),
  });

  if (!module) {
    return c.json({ error: 'Module not found' }, 404);
  }

  if (module.isCore) {
    return c.json({ error: 'Cannot uninstall core modules' }, 400);
  }

  // Soft delete - mark as deleted
  await db.update(entityTypes)
    .set({ isDeletable: false }) // Prevent further modifications
    .where(and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, moduleId)
    ));

  return c.json({ success: true });
});

// Finance-specific endpoints

// Get finance summary for a learner
modules.get('/finance/learner/:learnerId/summary', async (c) => {
  const schoolId = c.get('schoolId');
  const learnerId = c.req.param('learnerId');

  // Get finance entity type
  const financeType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, 'finance')
    ),
  });

  if (!financeType) {
    return c.json({ error: 'Finance module not installed' }, 400);
  }

  // Get all finance records for this learner
  const financeRecords = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, financeType.id),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get field definitions for amount due and amount paid
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, financeType.id)
    ),
  });

  const amountDueField = fields.find(f => f.internalName === 'amount_due');
  const amountPaidField = fields.find(f => f.internalName === 'amount_paid');

  if (!amountDueField || !amountPaidField) {
    return c.json({ error: 'Finance fields not configured' }, 400);
  }

  // Get field values
  const allValues = await db.query.fieldValues.findMany({
    where: eq(fieldValues.schoolId, schoolId),
  });

  // Calculate totals
  let totalDue = 0;
  let totalPaid = 0;

  for (const record of financeRecords) {
    const dueValue = allValues.find(
      v => v.entityRecordId === record.id && v.fieldDefinitionId === amountDueField.id
    );
    const paidValue = allValues.find(
      v => v.entityRecordId === record.id && v.fieldDefinitionId === amountPaidField.id
    );

    totalDue += dueValue?.numericValue || 0;
    totalPaid += paidValue?.numericValue || 0;
  }

  const balance = totalPaid - totalDue;
  const status = balance >= 0 ? 'paid' : 'overdue';

  return c.json({
    learnerId,
    totalDue,
    totalPaid,
    balance,
    status,
    message: balance > 0
      ? `Paid ${balance} more than expected`
      : balance < 0
        ? `Outstanding balance of ${Math.abs(balance)}`
        : 'Fully paid',
  });
});

// Check for overpayment and apply carry-over logic
modules.post('/finance/check-overpayment', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { learnerId, termId } = body;

  // Get school settings for carry-over behavior
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  const carryOverSetting = school?.settings?.finance?.carryOver || 'auto_credit';

  // Get finance summary
  const financeType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, 'finance')
    ),
  });

  if (!financeType) {
    return c.json({ error: 'Finance module not installed' }, 400);
  }

  // Get finance records for this learner and term
  const financeRecords = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, financeType.id),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Get field definitions
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, financeType.id)
    ),
  });

  const amountDueField = fields.find(f => f.internalName === 'amount_due');
  const amountPaidField = fields.find(f => f.internalName === 'amount_paid');

  if (!amountDueField || !amountPaidField) {
    return c.json({ error: 'Finance fields not configured' }, 400);
  }

  // Get field values
  const allValues = await db.query.fieldValues.findMany({
    where: eq(fieldValues.schoolId, schoolId),
  });

  // Calculate totals for this learner/term
  let totalDue = 0;
  let totalPaid = 0;

  for (const record of financeRecords) {
    // Check if this record is for the specified learner and term
    // (would need relationship queries in production)

    const dueValue = allValues.find(
      v => v.entityRecordId === record.id && v.fieldDefinitionId === amountDueField.id
    );
    const paidValue = allValues.find(
      v => v.entityRecordId === record.id && v.fieldDefinitionId === amountPaidField.id
    );

    totalDue += dueValue?.numericValue || 0;
    totalPaid += paidValue?.numericValue || 0;
  }

  const overpayment = totalPaid - totalDue;

  if (overpayment > 0) {
    return c.json({
      hasOverpayment: true,
      amount: overpayment,
      carryOverSetting,
      action: carryOverSetting === 'auto_credit'
        ? 'Auto-crediting to next term'
        : 'Flagged for manual review',
    });
  }

  return c.json({
    hasOverpayment: false,
    amount: 0,
  });
});

// Get module statistics
modules.get('/:id/stats', async (c) => {
  const schoolId = c.get('schoolId');
  const moduleId = c.req.param('id');

  const module = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, moduleId)
    ),
  });

  if (!module) {
    return c.json({ error: 'Module not found' }, 404);
  }

  // Count records
  const recordCount = await db.query.entityRecords.findMany({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.entityTypeId, moduleId),
      eq(entityRecords.isDeleted, false)
    ),
  });

  // Count fields
  const fieldCount = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, moduleId)
    ),
  });

  // Count relationships
  const relationshipCount = await db.query.relationshipDefinitions.findMany({
    where: and(
      eq(relationshipDefinitions.schoolId, schoolId),
      eq(relationshipDefinitions.fromEntityTypeId, moduleId)
    ),
  });

  return c.json({
    moduleId: module.id,
    name: module.name,
    recordCount: recordCount.length,
    fieldCount: fieldCount.length,
    relationshipCount: relationshipCount.length,
  });
});

export default modules;
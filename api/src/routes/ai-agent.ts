// AI Agent API Routes
// Doc 08 — Permission inheritance, confirmation flows, block composition

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import {
  entityTypes,
  entityRecords,
  fieldDefinitions,
  fieldValues,
  sections,
  relationshipDefinitions,
  rules,
  ruleActions,
  messageTemplates,
  workflows,
  workflowStages,
  userRoles,
  roles,
  permissionGrants,
} from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

const aiAgent = new Hono();

// Agent action types that require confirmation
const HIGH_IMPACT_ACTIONS = [
  'delete_record',
  'bulk_edit',
  'financial_edit',
  'delete_field',
  'delete_entity_type',
  'modify_permissions',
  'start_workflow',
];

// Validation schemas
const agentActionSchema = z.object({
  action: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  data: z.any().optional(),
  confirmationToken: z.string().optional(),
});

const composeBlockSchema = z.object({
  conversation: z.array(z.object({
    role: z.enum(['user', 'agent']),
    content: z.string(),
  })),
  intent: z.enum([
    'create_field',
    'create_relationship',
    'create_rule',
    'create_message',
    'create_workflow',
    'create_module',
    'modify_view',
  ]),
  config: z.any(),
});

// Middleware: Check if user has permission for an action
async function checkPermission(
  schoolId: string,
  userId: string,
  entityType: string,
  action: 'view' | 'create' | 'edit' | 'delete'
): Promise<boolean> {
  // Get user's roles
  const userRolesList = await db.query.userRoles.findMany({
    where: and(
      eq(userRoles.schoolId, schoolId),
      eq(userRoles.userId, userId)
    ),
  });

  if (userRolesList.length === 0) {
    return false;
  }

  // Get permissions for all user's roles
  const roleIds = userRolesList.map(ur => ur.roleId);
  const allPermissions = await db.query.permissionGrants.findMany({
    where: eq(permissionGrants.schoolId, schoolId),
  });

  const userPermissions = allPermissions.filter(p => roleIds.includes(p.roleId));

  // Get entity type
  const entityTypeRecord = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, entityType)
    ),
  });

  if (!entityTypeRecord) {
    return false;
  }

  // Filter permissions for this entity type
  const entityPermissions = userPermissions.filter(
    p => p.entityTypeId === entityTypeRecord.id
  );

  // Check if user has the required permission
  switch (action) {
    case 'view':
      return entityPermissions.some(p => p.canView);
    case 'create':
      return entityPermissions.some(p => p.canCreate);
    case 'edit':
      return entityPermissions.some(p => p.canEdit);
    case 'delete':
      return entityPermissions.some(p => p.canDelete);
    default:
      return false;
  }
}

// Generate confirmation token for high-impact actions
function generateConfirmationToken(action: string, data: any): string {
  const payload = JSON.stringify({ action, data, timestamp: Date.now() });
  return Buffer.from(payload).toString('base64');
}

// Validate confirmation token
function validateConfirmationToken(token: string, action: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    return payload.action === action && Date.now() - payload.timestamp < 300000; // 5 min expiry
  } catch {
    return false;
  }
}

// Execute an agent action with permission checks
aiAgent.post('/action', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.get('userId');
  const body = await c.req.json();
  const validated = agentActionSchema.parse(body);

  // Check if this is a high-impact action
  const isHighImpact = HIGH_IMPACT_ACTIONS.includes(validated.action);

  if (isHighImpact && !validated.confirmationToken) {
    // Generate confirmation token and return it
    const token = generateConfirmationToken(validated.action, validated.data);
    return c.json({
      requiresConfirmation: true,
      action: validated.action,
      confirmationToken: token,
      message: `This action (${validated.action}) requires confirmation. Please provide the confirmation token.`,
    });
  }

  // Validate confirmation token if provided
  if (isHighImpact && validated.confirmationToken) {
    if (!validateConfirmationToken(validated.confirmationToken, validated.action)) {
      return c.json({ error: 'Invalid or expired confirmation token' }, 400);
    }
  }

  // Check permissions
  const entityType = validated.entityType || 'general';
  const hasPermission = await checkPermission(
    schoolId,
    userId,
    entityType,
    validated.action.includes('delete') ? 'delete' : 'edit'
  );

  if (!hasPermission) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  // Execute the action
  let result: any;

  switch (validated.action) {
    case 'create_record':
      result = await createRecord(schoolId, validated.entityType!, validated.data);
      break;
    case 'update_record':
      result = await updateRecord(schoolId, validated.entityId!, validated.data);
      break;
    case 'delete_record':
      result = await deleteRecord(schoolId, validated.entityId!);
      break;
    case 'create_field':
      result = await createField(schoolId, validated.entityType!, validated.data);
      break;
    case 'create_relationship':
      result = await createRelationship(schoolId, validated.data);
      break;
    case 'create_rule':
      result = await createRule(schoolId, validated.data);
      break;
    case 'create_message_template':
      result = await createMessageTemplate(schoolId, validated.data);
      break;
    case 'create_workflow':
      result = await createWorkflow(schoolId, validated.data);
      break;
    default:
      return c.json({ error: `Unknown action: ${validated.action}` }, 400);
  }

  // Log the agent action (same audit trail as human actions)
  // In production, this would write to an audit_log table

  return c.json({
    success: true,
    action: validated.action,
    result,
  });
});

// Helper functions for agent actions

async function createRecord(schoolId: string, entityTypeInternalName: string, data: any) {
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, entityTypeInternalName)
    ),
  });

  if (!entityType) {
    throw new Error('Entity type not found');
  }

  const record = await db.insert(entityRecords).values({
    schoolId,
    entityTypeId: entityType.id,
    isDeleted: false,
  }).returning();

  return { recordId: record[0].id };
}

async function updateRecord(schoolId: string, recordId: string, data: any) {
  const record = await db.query.entityRecords.findFirst({
    where: and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId)
    ),
  });

  if (!record) {
    throw new Error('Record not found');
  }

  // Update field values
  for (const [fieldInternalName, value] of Object.entries(data)) {
    const field = await db.query.fieldDefinitions.findFirst({
      where: and(
        eq(fieldDefinitions.schoolId, schoolId),
        eq(fieldDefinitions.entityTypeId, record.entityTypeId),
        eq(fieldDefinitions.internalName, fieldInternalName)
      ),
    });

    if (field) {
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
    }
  }

  return { success: true };
}

async function deleteRecord(schoolId: string, recordId: string) {
  // Soft delete
  await db.update(entityRecords)
    .set({ isDeleted: true })
    .where(and(
      eq(entityRecords.schoolId, schoolId),
      eq(entityRecords.id, recordId)
    ));

  return { success: true };
}

async function createField(schoolId: string, entityTypeInternalName: string, data: any) {
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, entityTypeInternalName)
    ),
  });

  if (!entityType) {
    throw new Error('Entity type not found');
  }

  const field = await db.insert(fieldDefinitions).values({
    schoolId,
    entityTypeId: entityType.id,
    name: data.name,
    internalName: data.internalName,
    dataType: data.dataType,
    isRequired: data.isRequired || false,
    isUnique: data.isUnique || false,
    isIdentifier: data.isIdentifier || false,
    displayOrder: data.displayOrder || 0,
    options: data.options,
  }).returning();

  return { fieldId: field[0].id };
}

async function createRelationship(schoolId: string, data: any) {
  const fromType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, data.fromEntityType)
    ),
  });

  const toType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, data.toEntityType)
    ),
  });

  if (!fromType || !toType) {
    throw new Error('Entity type not found');
  }

  const relationship = await db.insert(relationshipDefinitions).values({
    schoolId,
    fromEntityTypeId: fromType.id,
    toEntityTypeId: toType.id,
    cardinality: data.cardinality,
    isDefault: false,
    isActive: true,
  }).returning();

  return { relationshipId: relationship[0].id };
}

async function createRule(schoolId: string, data: any) {
  const rule = await db.insert(rules).values({
    schoolId,
    name: data.name,
    entityTypeId: data.entityTypeId,
    triggerFieldId: data.triggerFieldId,
    triggerCondition: data.triggerCondition,
    triggerValue: data.triggerValue,
    isActive: true,
  }).returning();

  return { ruleId: rule[0].id };
}

async function createMessageTemplate(schoolId: string, data: any) {
  const template = await db.insert(messageTemplates).values({
    schoolId,
    name: data.name,
    subject: data.subject,
    body: data.body,
    channels: data.channels,
    mergeFields: data.mergeFields,
  }).returning();

  return { templateId: template[0].id };
}

async function createWorkflow(schoolId: string, data: any) {
  const workflow = await db.insert(workflows).values({
    schoolId,
    name: data.name,
    entityTypeId: data.entityTypeId,
    isActive: true,
  }).returning();

  // Create stages
  for (const stage of data.stages || []) {
    await db.insert(workflowStages).values({
      schoolId,
      workflowId: workflow[0].id,
      name: stage.name,
      stageOrder: stage.stageOrder,
      approverRoleId: stage.approverRoleId,
      actionOnApprove: stage.actionOnApprove,
      actionOnReject: stage.actionOnReject,
    });
  }

  return { workflowId: workflow[0].id };
}

// Block Composition Endpoint (Version B)
aiAgent.post('/compose', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.get('userId');
  const body = await c.req.json();
  const validated = composeBlockSchema.parse(body);

  // Check permissions for the intent
  const hasPermission = await checkPermission(
    schoolId,
    userId,
    validated.config.entityType || 'general',
    'create'
  );

  if (!hasPermission) {
    return c.json({ error: 'Insufficient permissions to perform this action' }, 403);
  }

  // Map conversation to block configuration
  let result: any;

  switch (validated.intent) {
    case 'create_field':
      result = await composeField(schoolId, validated.config);
      break;
    case 'create_relationship':
      result = await composeRelationship(schoolId, validated.config);
      break;
    case 'create_rule':
      result = await composeRule(schoolId, validated.config);
      break;
    case 'create_message':
      result = await composeMessage(schoolId, validated.config);
      break;
    case 'create_workflow':
      result = await composeWorkflow(schoolId, validated.config);
      break;
    case 'create_module':
      result = await composeModule(schoolId, validated.config);
      break;
    case 'modify_view':
      result = await composeView(schoolId, validated.config);
      break;
    default:
      return c.json({ error: `Unknown intent: ${validated.intent}` }, 400);
  }

  return c.json({
    success: true,
    intent: validated.intent,
    result,
    message: `Successfully ${validated.intent.replace('_', ' ')}`,
  });
});

// Block composition helpers

async function composeField(schoolId: string, config: any) {
  return createField(schoolId, config.entityType, config.field);
}

async function composeRelationship(schoolId: string, config: any) {
  return createRelationship(schoolId, config);
}

async function composeRule(schoolId: string, config: any) {
  return createRule(schoolId, config.rule);
}

async function composeMessage(schoolId: string, config: any) {
  return createMessageTemplate(schoolId, config.template);
}

async function composeWorkflow(schoolId: string, config: any) {
  return createWorkflow(schoolId, config.workflow);
}

async function composeModule(schoolId: string, config: any) {
  // Create entity type for the module
  const entityType = await db.insert(entityTypes).values({
    schoolId,
    name: config.name,
    internalName: config.internalName,
    isCore: false,
    isDeletable: true,
    icon: config.icon,
    color: config.color,
  }).returning();

  // Create fields
  for (const field of config.fields || []) {
    await createField(schoolId, config.internalName, field);
  }

  // Create relationships
  for (const rel of config.relationships || []) {
    await createRelationship(schoolId, {
      fromEntityType: config.internalName,
      toEntityType: rel.target,
      cardinality: rel.cardinality,
    });
  }

  return { moduleId: entityType[0].id };
}

async function composeView(schoolId: string, config: any) {
  // View composition would configure layout/sections
  // For now, return success
  return { success: true, viewConfig: config };
}

// Get agent capabilities
aiAgent.get('/capabilities', async (c) => {
  return c.json({
    actions: [
      'create_record',
      'update_record',
      'delete_record',
      'create_field',
      'create_relationship',
      'create_rule',
      'create_message_template',
      'create_workflow',
    ],
    intents: [
      'create_field',
      'create_relationship',
      'create_rule',
      'create_message',
      'create_workflow',
      'create_module',
      'modify_view',
    ],
    highImpactActions: HIGH_IMPACT_ACTIONS,
    permissionModel: 'inherit_user',
  });
});

// Get agent audit log
aiAgent.get('/audit', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.req.query('userId');
  const limit = parseInt(c.req.query('limit') || '100');

  // In production, this would query an audit_log table
  // For now, return mock data
  return c.json({
    entries: [],
    total: 0,
  });
});

export default aiAgent;
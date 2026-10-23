// Rules, Messages & Workflows API Routes
// Doc 04 — Rule engine, Message/Template, Workflow/Approval

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import {
  rules,
  ruleActions,
  messageTemplates,
  messageLogs,
  workflows,
  workflowStages,
  workflowInstances,
  workflowApprovals,
  entityTypes,
  fieldDefinitions,
  entityRecords,
  fieldValues,
  roles,
} from '../../../drizzle/schema';
import { eq, and, asc } from 'drizzle-orm';

const automation = new Hono();

// Validation schemas
const createRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entityTypeId: z.string().uuid(),
  triggerFieldId: z.string().uuid(),
  triggerCondition: z.enum(['equals', 'changed', 'above', 'below', 'contains']),
  triggerValue: z.string().optional(),
});

const createRuleActionSchema = z.object({
  ruleId: z.string().uuid(),
  actionType: z.enum(['send_message', 'set_field', 'flag_record', 'start_workflow']),
  actionConfig: z.any(),
  displayOrder: z.number().optional(),
});

const createMessageTemplateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1),
  channels: z.array(z.enum(['sms', 'email', 'in_app'])),
  mergeFields: z.array(z.object({
    fieldId: z.string().uuid(),
    placeholder: z.string(),
  })),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entityTypeId: z.string().uuid(),
});

const createWorkflowStageSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string().min(1),
  stageOrder: z.number(),
  approverRoleId: z.string().uuid(),
  actionOnApprove: z.any(),
  actionOnReject: z.any().optional(),
});

// Rule CRUD Operations

// List all rules for a school
automation.get('/rules', async (c) => {
  const schoolId = c.get('schoolId');
  const allRules = await db.query.rules.findMany({
    where: eq(rules.schoolId, schoolId),
  });
  return c.json(allRules);
});

// Get rule by ID with actions
automation.get('/rules/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const ruleId = c.req.param('id');

  const rule = await db.query.rules.findFirst({
    where: and(
      eq(rules.schoolId, schoolId),
      eq(rules.id, ruleId)
    ),
  });

  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const actions = await db.query.ruleActions.findMany({
    where: and(
      eq(ruleActions.schoolId, schoolId),
      eq(ruleActions.ruleId, ruleId)
    ),
    orderBy: [asc(ruleActions.displayOrder)],
  });

  return c.json({ ...rule, actions });
});

// Create a rule
automation.post('/rules', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createRuleSchema.parse(body);

  // Verify entity type exists
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, validated.entityTypeId)
    ),
  });

  if (!entityType) {
    return c.json({ error: 'Entity type not found' }, 404);
  }

  // Verify trigger field exists
  const field = await db.query.fieldDefinitions.findFirst({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.id, validated.triggerFieldId)
    ),
  });

  if (!field) {
    return c.json({ error: 'Field not found' }, 404);
  }

  const rule = await db.insert(rules).values({
    schoolId,
    name: validated.name,
    description: validated.description,
    entityTypeId: validated.entityTypeId,
    triggerFieldId: validated.triggerFieldId,
    triggerCondition: validated.triggerCondition,
    triggerValue: validated.triggerValue,
    isActive: true,
  }).returning();

  return c.json(rule[0], 201);
});

// Update a rule
automation.put('/rules/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const ruleId = c.req.param('id');
  const body = await c.req.json();

  const rule = await db.query.rules.findFirst({
    where: and(
      eq(rules.schoolId, schoolId),
      eq(rules.id, ruleId)
    ),
  });

  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const updated = await db.update(rules)
    .set({
      name: body.name || rule.name,
      description: body.description ?? rule.description,
      isActive: body.isActive ?? rule.isActive,
    })
    .where(and(
      eq(rules.schoolId, schoolId),
      eq(rules.id, ruleId)
    ))
    .returning();

  return c.json(updated[0]);
});

// Delete a rule
automation.delete('/rules/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const ruleId = c.req.param('id');

  const rule = await db.query.rules.findFirst({
    where: and(
      eq(rules.schoolId, schoolId),
      eq(rules.id, ruleId)
    ),
  });

  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  // Delete actions first
  await db.delete(ruleActions).where(and(
    eq(ruleActions.schoolId, schoolId),
    eq(ruleActions.ruleId, ruleId)
  ));

  // Delete rule
  await db.delete(rules).where(and(
    eq(rules.schoolId, schoolId),
    eq(rules.id, ruleId)
  ));

  return c.json({ success: true });
});

// Rule Actions

// Add action to a rule
automation.post('/rules/:ruleId/actions', async (c) => {
  const schoolId = c.get('schoolId');
  const ruleId = c.req.param('ruleId');
  const body = await c.req.json();
  const validated = createRuleActionSchema.parse(body);

  // Verify rule exists
  const rule = await db.query.rules.findFirst({
    where: and(
      eq(rules.schoolId, schoolId),
      eq(rules.id, ruleId)
    ),
  });

  if (!rule) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const action = await db.insert(ruleActions).values({
    schoolId,
    ruleId,
    actionType: validated.actionType,
    actionConfig: validated.actionConfig,
    displayOrder: validated.displayOrder || 0,
  }).returning();

  return c.json(action[0], 201);
});

// Delete a rule action
automation.delete('/rules/:ruleId/actions/:actionId', async (c) => {
  const schoolId = c.get('schoolId');
  const ruleId = c.req.param('ruleId');
  const actionId = c.req.param('actionId');

  const action = await db.query.ruleActions.findFirst({
    where: and(
      eq(ruleActions.schoolId, schoolId),
      eq(ruleActions.ruleId, ruleId),
      eq(ruleActions.id, actionId)
    ),
  });

  if (!action) {
    return c.json({ error: 'Action not found' }, 404);
  }

  await db.delete(ruleActions).where(and(
    eq(ruleActions.schoolId, schoolId),
    eq(ruleActions.id, actionId)
  ));

  return c.json({ success: true });
});

// Evaluate rules for a field change
automation.post('/rules/evaluate', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { entityTypeId, entityRecordId, fieldId, newValue } = body;

  // Get all active rules for this entity type and field
  const activeRules = await db.query.rules.findMany({
    where: and(
      eq(rules.schoolId, schoolId),
      eq(rules.entityTypeId, entityTypeId),
      eq(rules.triggerFieldId, fieldId),
      eq(rules.isActive, true)
    ),
  });

  const triggeredActions = [];

  for (const rule of activeRules) {
    let conditionMet = false;

    switch (rule.triggerCondition) {
      case 'equals':
        conditionMet = String(newValue) === rule.triggerValue;
        break;
      case 'changed':
        conditionMet = true; // Any change triggers
        break;
      case 'above':
        conditionMet = typeof newValue === 'number' && newValue > Number(rule.triggerValue);
        break;
      case 'below':
        conditionMet = typeof newValue === 'number' && newValue < Number(rule.triggerValue);
        break;
      case 'contains':
        conditionMet = typeof newValue === 'string' && newValue.includes(rule.triggerValue || '');
        break;
    }

    if (conditionMet) {
      // Get actions for this rule
      const actions = await db.query.ruleActions.findMany({
        where: and(
          eq(ruleActions.schoolId, schoolId),
          eq(ruleActions.ruleId, rule.id)
        ),
        orderBy: [asc(ruleActions.displayOrder)],
      });

      triggeredActions.push({
        ruleId: rule.id,
        ruleName: rule.name,
        actions,
      });
    }
  }

  return c.json({
    triggered: triggeredActions.length > 0,
    rules: triggeredActions,
  });
});

// Message Templates

// List all message templates
automation.get('/messages', async (c) => {
  const schoolId = c.get('schoolId');
  const templates = await db.query.messageTemplates.findMany({
    where: eq(messageTemplates.schoolId, schoolId),
  });
  return c.json(templates);
});

// Get message template by ID
automation.get('/messages/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const templateId = c.req.param('id');

  const template = await db.query.messageTemplates.findFirst({
    where: and(
      eq(messageTemplates.schoolId, schoolId),
      eq(messageTemplates.id, templateId)
    ),
  });

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  return c.json(template);
});

// Create a message template
automation.post('/messages', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createMessageTemplateSchema.parse(body);

  const template = await db.insert(messageTemplates).values({
    schoolId,
    name: validated.name,
    subject: validated.subject,
    body: validated.body,
    channels: validated.channels,
    mergeFields: validated.mergeFields,
  }).returning();

  return c.json(template[0], 201);
});

// Update a message template
automation.put('/messages/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const templateId = c.req.param('id');
  const body = await c.req.json();

  const template = await db.query.messageTemplates.findFirst({
    where: and(
      eq(messageTemplates.schoolId, schoolId),
      eq(messageTemplates.id, templateId)
    ),
  });

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  const updated = await db.update(messageTemplates)
    .set({
      name: body.name || template.name,
      subject: body.subject ?? template.subject,
      body: body.body || template.body,
      channels: body.channels || template.channels,
      mergeFields: body.mergeFields || template.mergeFields,
    })
    .where(and(
      eq(messageTemplates.schoolId, schoolId),
      eq(messageTemplates.id, templateId)
    ))
    .returning();

  return c.json(updated[0]);
});

// Delete a message template
automation.delete('/messages/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const templateId = c.req.param('id');

  const template = await db.query.messageTemplates.findFirst({
    where: and(
      eq(messageTemplates.schoolId, schoolId),
      eq(messageTemplates.id, templateId)
    ),
  });

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  await db.delete(messageTemplates).where(and(
    eq(messageTemplates.schoolId, schoolId),
    eq(messageTemplates.id, templateId)
  ));

  return c.json({ success: true });
});

// Send a message
automation.post('/messages/send', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const { templateId, channel, recipientId, mergeValues } = body;

  // Get template
  const template = await db.query.messageTemplates.findFirst({
    where: and(
      eq(messageTemplates.schoolId, schoolId),
      eq(messageTemplates.id, templateId)
    ),
  });

  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }

  // Process merge fields
  let messageBody = template.body;
  let messageSubject = template.subject;

  if (mergeValues) {
    for (const [placeholder, value] of Object.entries(mergeValues)) {
      const regex = new RegExp(`\\{${placeholder}\\}`, 'g');
      messageBody = messageBody.replace(regex, String(value));
      if (messageSubject) {
        messageSubject = messageSubject.replace(regex, String(value));
      }
    }
  }

  // Log the message (actual sending would integrate with providers)
  const log = await db.insert(messageLogs).values({
    schoolId,
    templateId,
    channel,
    recipientId,
    subject: messageSubject,
    body: messageBody,
    status: 'sent',
    sentAt: new Date(),
  }).returning();

  return c.json({
    success: true,
    messageId: log[0].id,
    channel,
    recipientId,
  });
});

// Get message logs
automation.get('/messages/logs', async (c) => {
  const schoolId = c.get('schoolId');
  const limit = parseInt(c.req.query('limit') || '100');

  const logs = await db.query.messageLogs.findMany({
    where: eq(messageLogs.schoolId, schoolId),
    orderBy: [asc(messageLogs.createdAt)],
    limit,
  });

  return c.json(logs);
});

// Workflows

// List all workflows
automation.get('/workflows', async (c) => {
  const schoolId = c.get('schoolId');
  const allWorkflows = await db.query.workflows.findMany({
    where: eq(workflows.schoolId, schoolId),
  });
  return c.json(allWorkflows);
});

// Get workflow by ID with stages
automation.get('/workflows/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const workflowId = c.req.param('id');

  const workflow = await db.query.workflows.findFirst({
    where: and(
      eq(workflows.schoolId, schoolId),
      eq(workflows.id, workflowId)
    ),
  });

  if (!workflow) {
    return c.json({ error: 'Workflow not found' }, 404);
  }

  const stages = await db.query.workflowStages.findMany({
    where: and(
      eq(workflowStages.schoolId, schoolId),
      eq(workflowStages.workflowId, workflowId)
    ),
    orderBy: [asc(workflowStages.stageOrder)],
  });

  return c.json({ ...workflow, stages });
});

// Create a workflow
automation.post('/workflows', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createWorkflowSchema.parse(body);

  // Verify entity type exists
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, validated.entityTypeId)
    ),
  });

  if (!entityType) {
    return c.json({ error: 'Entity type not found' }, 404);
  }

  const workflow = await db.insert(workflows).values({
    schoolId,
    name: validated.name,
    description: validated.description,
    entityTypeId: validated.entityTypeId,
    isActive: true,
  }).returning();

  return c.json(workflow[0], 201);
});

// Add stage to workflow
automation.post('/workflows/:workflowId/stages', async (c) => {
  const schoolId = c.get('schoolId');
  const workflowId = c.req.param('workflowId');
  const body = await c.req.json();
  const validated = createWorkflowStageSchema.parse(body);

  // Verify workflow exists
  const workflow = await db.query.workflows.findFirst({
    where: and(
      eq(workflows.schoolId, schoolId),
      eq(workflows.id, workflowId)
    ),
  });

  if (!workflow) {
    return c.json({ error: 'Workflow not found' }, 404);
  }

  // Verify role exists
  const role = await db.query.roles.findFirst({
    where: and(
      eq(roles.schoolId, schoolId),
      eq(roles.id, validated.approverRoleId)
    ),
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  const stage = await db.insert(workflowStages).values({
    schoolId,
    workflowId,
    name: validated.name,
    stageOrder: validated.stageOrder,
    approverRoleId: validated.approverRoleId,
    actionOnApprove: validated.actionOnApprove,
    actionOnReject: validated.actionOnReject,
  }).returning();

  return c.json(stage[0], 201);
});

// Start a workflow instance
automation.post('/workflows/:workflowId/start', async (c) => {
  const schoolId = c.get('schoolId');
  const workflowId = c.req.param('workflowId');
  const body = await c.req.json();
  const { entityRecordId, initiatedBy } = body;

  // Verify workflow exists
  const workflow = await db.query.workflows.findFirst({
    where: and(
      eq(workflows.schoolId, schoolId),
      eq(workflows.id, workflowId)
    ),
  });

  if (!workflow) {
    return c.json({ error: 'Workflow not found' }, 404);
  }

  // Get first stage
  const stages = await db.query.workflowStages.findMany({
    where: and(
      eq(workflowStages.schoolId, schoolId),
      eq(workflowStages.workflowId, workflowId)
    ),
    orderBy: [asc(workflowStages.stageOrder)],
  });

  if (stages.length === 0) {
    return c.json({ error: 'Workflow has no stages' }, 400);
  }

  // Create workflow instance
  const instance = await db.insert(workflowInstances).values({
    schoolId,
    workflowId,
    entityRecordId,
    currentStageId: stages[0].id,
    status: 'in_progress',
    initiatedBy,
  }).returning();

  // Create approval record for first stage
  await db.insert(workflowApprovals).values({
    schoolId,
    instanceId: instance[0].id,
    stageId: stages[0].id,
    approverUserId: '', // Would be populated from role assignment
  });

  return c.json(instance[0], 201);
});

// Approve/reject a workflow stage
automation.post('/workflows/approve/:approvalId', async (c) => {
  const schoolId = c.get('schoolId');
  const approvalId = c.req.param('approvalId');
  const body = await c.req.json();
  const { decision, comment, approverUserId } = body;

  if (!['approved', 'rejected'].includes(decision)) {
    return c.json({ error: 'Decision must be approved or rejected' }, 400);
  }

  // Get approval record
  const approval = await db.query.workflowApprovals.findFirst({
    where: and(
      eq(workflowApprovals.schoolId, schoolId),
      eq(workflowApprovals.id, approvalId)
    ),
  });

  if (!approval) {
    return c.json({ error: 'Approval not found' }, 404);
  }

  // Update approval
  await db.update(workflowApprovals)
    .set({
      decision,
      comment,
      approverUserId,
      decidedAt: new Date(),
    })
    .where(and(
      eq(workflowApprovals.schoolId, schoolId),
      eq(workflowApprovals.id, approvalId)
    ));

  // Get workflow instance
  const instance = await db.query.workflowInstances.findFirst({
    where: and(
      eq(workflowInstances.schoolId, schoolId),
      eq(workflowInstances.id, approval.instanceId)
    ),
  });

  if (!instance) {
    return c.json({ error: 'Workflow instance not found' }, 404);
  }

  if (decision === 'approved') {
    // Get current stage
    const currentStage = await db.query.workflowStages.findFirst({
      where: and(
        eq(workflowStages.schoolId, schoolId),
        eq(workflowStages.id, instance.currentStageId)
      ),
    });

    if (!currentStage) {
      return c.json({ error: 'Stage not found' }, 404);
    }

    // Get next stage
    const nextStage = await db.query.workflowStages.findFirst({
      where: and(
        eq(workflowStages.schoolId, schoolId),
        eq(workflowStages.workflowId, instance.workflowId),
        eq(workflowStages.stageOrder, currentStage.stageOrder + 1)
      ),
    });

    if (nextStage) {
      // Advance to next stage
      await db.update(workflowInstances)
        .set({ currentStageId: nextStage.id })
        .where(and(
          eq(workflowInstances.schoolId, schoolId),
          eq(workflowInstances.id, instance.id)
        ));

      // Create approval for next stage
      await db.insert(workflowApprovals).values({
        schoolId,
        instanceId: instance.id,
        stageId: nextStage.id,
        approverUserId: '',
      });
    } else {
      // Workflow complete
      await db.update(workflowInstances)
        .set({ status: 'completed' })
        .where(and(
          eq(workflowInstances.schoolId, schoolId),
          eq(workflowInstances.id, instance.id)
        ));
    }
  } else {
    // Rejected
    await db.update(workflowInstances)
      .set({ status: 'rejected' })
      .where(and(
        eq(workflowInstances.schoolId, schoolId),
        eq(workflowInstances.id, instance.id)
      ));
  }

  return c.json({ success: true, decision });
});

// Get workflow instances
automation.get('/workflows/instances', async (c) => {
  const schoolId = c.get('schoolId');
  const workflowId = c.req.query('workflowId');

  let query = eq(workflowInstances.schoolId, schoolId);
  if (workflowId) {
    query = and(
      eq(workflowInstances.schoolId, schoolId),
      eq(workflowInstances.workflowId, workflowId)
    ) as any;
  }

  const instances = await db.query.workflowInstances.findMany({
    where: query,
  });

  return c.json(instances);
});

export default automation;
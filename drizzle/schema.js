import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, real, date } from 'drizzle-orm/pg-core';
// Layer 1: Fixed Structural Tables
export const schools = pgTable('schools', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    settings: jsonb('settings').default({}),
    branding: jsonb('branding').default({}),
    tier: text('tier').default('starter'),
    // Onboarding fields
    onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
    onboardingStep: text('onboarding_step').default('welcome'),
    onboardingData: jsonb('onboarding_data').default({}),
    // Tier classification signals
    tierSignals: jsonb('tier_signals').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const entityTypes = pgTable('entity_types', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    name: text('name').notNull(),
    internalName: text('internal_name').notNull(),
    isCore: boolean('is_core').default(false).notNull(),
    isDeletable: boolean('is_deletable').default(true).notNull(),
    icon: text('icon'),
    color: text('color'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const sections = pgTable('sections', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    entityTypeId: uuid('entity_type_id').references(() => entityTypes.id).notNull(),
    name: text('name').notNull(),
    internalName: text('internal_name').notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const fieldDefinitions = pgTable('field_definitions', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    entityTypeId: uuid('entity_type_id').references(() => entityTypes.id).notNull(),
    sectionId: uuid('section_id').references(() => sections.id),
    name: text('name').notNull(),
    internalName: text('internal_name').notNull(),
    dataType: text('data_type').notNull(), // text, number, date, boolean, file, select, multi-select
    unit: text('unit'),
    isRequired: boolean('is_required').default(false).notNull(),
    isUnique: boolean('is_unique').default(false).notNull(),
    isIdentifier: boolean('is_identifier').default(false).notNull(),
    isMultiple: boolean('is_multiple').default(false).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    validationRules: jsonb('validation_rules').default({}),
    options: jsonb('options'), // for select/multi-select fields
    defaultValue: text('default_value'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const relationshipDefinitions = pgTable('relationship_definitions', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    fromEntityTypeId: uuid('from_entity_type_id').references(() => entityTypes.id).notNull(),
    toEntityTypeId: uuid('to_entity_type_id').references(() => entityTypes.id).notNull(),
    cardinality: text('cardinality').notNull(), // 1-1, 1-many, many-many
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Layer 2: Entity Records
export const entityRecords = pgTable('entity_records', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    entityTypeId: uuid('entity_type_id').references(() => entityTypes.id).notNull(),
    parentRecordId: uuid('parent_record_id').references(() => entityRecords.id),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    metadata: jsonb('metadata'), // { avatarUrl, ... }
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Layer 3: Field Values
export const fieldValues = pgTable('field_values', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    entityRecordId: uuid('entity_record_id').references(() => entityRecords.id).notNull(),
    fieldDefinitionId: uuid('field_definition_id').references(() => fieldDefinitions.id).notNull(),
    // Typed columns per broad type
    textValue: text('text_value'),
    numericValue: real('numeric_value'),
    dateValue: date('date_value'),
    booleanValue: boolean('boolean_value'),
    fileValue: jsonb('file_value'), // { url, key, name, type, size }
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const relationshipRecords = pgTable('relationship_records', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    relationshipDefinitionId: uuid('relationship_definition_id').references(() => relationshipDefinitions.id).notNull(),
    fromEntityRecordId: uuid('from_entity_record_id').references(() => entityRecords.id).notNull(),
    toEntityRecordId: uuid('to_entity_record_id').references(() => entityRecords.id).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Permissions & Roles Tables
export const roles = pgTable('roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    name: text('name').notNull(), // School-defined role name (never system-suggested)
    description: text('description'),
    isSystem: boolean('is_system').default(false).notNull(), // System roles like "Owner" cannot be deleted
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const permissionGrants = pgTable('permission_grants', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    roleId: uuid('role_id').references(() => roles.id).notNull(),
    entityTypeId: uuid('entity_type_id').references(() => entityTypes.id).notNull(),
    sectionId: uuid('section_id').references(() => sections.id), // Null = full entity type access
    canView: boolean('can_view').default(false).notNull(),
    canCreate: boolean('can_create').default(false).notNull(),
    canEdit: boolean('can_edit').default(false).notNull(),
    canDelete: boolean('can_delete').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const userRoles = pgTable('user_roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    userId: text('user_id').notNull(), // Clerk user ID
    roleId: uuid('role_id').references(() => roles.id).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Rules, Messages & Workflows Tables
export const rules = pgTable('rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    entityTypeId: uuid('entity_type_id').references(() => entityTypes.id).notNull(),
    triggerFieldId: uuid('trigger_field_id').references(() => fieldDefinitions.id).notNull(),
    triggerCondition: text('trigger_condition').notNull(), // 'equals', 'changed', 'above', 'below', 'contains'
    triggerValue: text('trigger_value'), // The value to compare against
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const ruleActions = pgTable('rule_actions', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    ruleId: uuid('rule_id').references(() => rules.id).notNull(),
    actionType: text('action_type').notNull(), // 'send_message', 'set_field', 'flag_record', 'start_workflow'
    actionConfig: jsonb('action_config').notNull(), // Type-specific configuration
    displayOrder: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const messageTemplates = pgTable('message_templates', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    name: text('name').notNull(),
    subject: text('subject'), // For email
    body: text('body').notNull(),
    channels: jsonb('channels').notNull(), // ['sms', 'email', 'in_app']
    mergeFields: jsonb('merge_fields').notNull(), // Array of {fieldId, placeholder}
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const messageLogs = pgTable('message_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    templateId: uuid('template_id').references(() => messageTemplates.id),
    channel: text('channel').notNull(), // 'sms', 'email', 'in_app'
    recipientId: text('recipient_id'), // User ID or phone/email
    subject: text('subject'),
    body: text('body').notNull(),
    status: text('status').notNull(), // 'pending', 'sent', 'delivered', 'failed'
    sentAt: timestamp('sent_at'),
    deliveredAt: timestamp('delivered_at'),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const workflows = pgTable('workflows', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    entityTypeId: uuid('entity_type_id').references(() => entityTypes.id).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const workflowStages = pgTable('workflow_stages', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    workflowId: uuid('workflow_id').references(() => workflows.id).notNull(),
    name: text('name').notNull(),
    stageOrder: integer('stage_order').notNull(),
    approverRoleId: uuid('approver_role_id').references(() => roles.id).notNull(),
    actionOnApprove: jsonb('action_on_approve').notNull(), // { type: 'advance', 'set_field', 'send_message', 'complete', config: {} }
    actionOnReject: jsonb('action_on_reject'), // Optional reject action
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const workflowInstances = pgTable('workflow_instances', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    workflowId: uuid('workflow_id').references(() => workflows.id).notNull(),
    entityRecordId: uuid('entity_record_id').references(() => entityRecords.id).notNull(),
    currentStageId: uuid('current_stage_id').references(() => workflowStages.id),
    status: text('status').notNull(), // 'pending', 'in_progress', 'completed', 'rejected'
    initiatedBy: text('initiated_by').notNull(), // User ID
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const workflowApprovals = pgTable('workflow_approvals', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    instanceId: uuid('instance_id').references(() => workflowInstances.id).notNull(),
    stageId: uuid('stage_id').references(() => workflowStages.id).notNull(),
    approverUserId: text('approver_user_id').notNull(),
    decision: text('decision'), // 'approved', 'rejected', null (pending)
    comment: text('comment'),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Document Generation & File Processing Tables (Doc 13)
export const documentTemplates = pgTable('document_templates', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    entityTypeId: uuid('entity_type_id').references(() => entityTypes.id).notNull(),
    // Canvas layout: blocks arranged on a page
    layout: jsonb('layout').notNull().default({
        pageSize: 'A4',
        orientation: 'portrait',
        margins: { top: 40, right: 40, bottom: 40, left: 40 },
        header: null,
        footer: null,
        blocks: [],
    }),
    // Document theme: colors, typography, spacing
    theme: jsonb('theme').default({
        primaryColor: '#1a1a2e',
        secondaryColor: '#16213e',
        accentColor: '#e94560',
        fontFamily: 'Inter',
        fontSize: 11,
        lineHeight: 1.5,
    }),
    // Merge field mappings: which fields from the entity type appear on the canvas
    mergeFields: jsonb('merge_fields').default([]),
    // Currency for this template (inherits school default if null)
    currency: text('currency'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const documentJobs = pgTable('document_jobs', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    templateId: uuid('template_id').references(() => documentTemplates.id).notNull(),
    // For bulk generation: which records to generate for
    entityRecordIds: jsonb('entity_record_ids'), // null = single record from targetRecordId
    targetRecordId: uuid('target_record_id').references(() => entityRecords.id),
    status: text('status').notNull().default('pending'), // pending, processing, completed, failed
    outputUrl: text('output_url'), // R2 URL of generated PDF
    error: text('error'),
    // Batch tracking for bulk generation
    totalRecords: integer('total_records').default(1),
    processedRecords: integer('processed_records').default(0),
    requestedBy: text('requested_by').notNull(), // Clerk user ID
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const uploadJobs = pgTable('upload_jobs', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull(),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(), // csv, xlsx, xls, pdf, image
    fileUrl: text('file_url'), // R2 URL
    // Parsed data before commit
    parsedHeaders: jsonb('parsed_headers'), // Column names detected
    parsedRows: jsonb('parsed_rows'), // First N rows for preview
    totalRows: integer('total_rows'),
    // Mapping: which columns map to which fields
    columnMapping: jsonb('column_mapping'), // { columnIndex: fieldDefinitionId }
    // Target entity type
    targetEntityTypeId: uuid('target_entity_type_id').references(() => entityTypes.id),
    status: text('status').notNull().default('uploaded'), // uploaded, parsed, mapped, previewing, importing, completed, failed
    importedCount: integer('imported_count').default(0),
    error: text('error'),
    requestedBy: text('requested_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Currency settings per school
export const currencySettings = pgTable('currency_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id').references(() => schools.id).notNull().unique(),
    code: text('code').notNull().default('KES'), // ISO 4217
    symbol: text('symbol').notNull().default('KSh'),
    name: text('name').notNull().default('Kenyan Shilling'),
    decimalPlaces: integer('decimal_places').default(2).notNull(),
    thousandsSeparator: text('thousands_separator').default(','),
    decimalSeparator: text('decimal_separator').default('.'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
//# sourceMappingURL=schema.js.map
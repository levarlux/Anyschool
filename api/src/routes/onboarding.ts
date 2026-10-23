// Onboarding Flow API Routes
// Doc 10 — Progressive, Typeform-style onboarding

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import {
  schools,
  entityTypes,
  sections,
  fieldDefinitions,
  relationshipDefinitions,
  roles,
  permissionGrants,
  userRoles,
} from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

const onboarding = new Hono();

// Onboarding steps configuration
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to AnySchool',
    description: 'Let\'s set up your school in a few simple steps',
    required: true,
  },
  {
    id: 'school_info',
    title: 'School Information',
    description: 'Tell us about your school',
    required: true,
  },
  {
    id: 'modules',
    title: 'Module Selection',
    description: 'Choose which modules to activate',
    required: true,
  },
  {
    id: 'schema_setup',
    title: 'Schema Setup',
    description: 'Create fields for your core pillars',
    required: true,
  },
  {
    id: 'roles',
    title: 'Role Setup',
    description: 'Create roles and permissions',
    required: true,
  },
  {
    id: 'branding',
    title: 'Branding',
    description: 'Customize your school\'s appearance',
    required: false,
  },
  {
    id: 'import',
    title: 'Import Data',
    description: 'Import existing data from spreadsheets',
    required: false,
  },
  {
    id: 'complete',
    title: 'Setup Complete',
    description: 'You\'re ready to start using AnySchool',
    required: true,
  },
];

// Validation schemas
const updateOnboardingStepSchema = z.object({
  step: z.string(),
  data: z.any().optional(),
});

const completeOnboardingSchema = z.object({
  schoolName: z.string().min(1),
  schoolSlug: z.string().min(1),
  modules: z.array(z.string()),
  schema: z.object({
    learner: z.object({
      sections: z.array(z.object({
        name: z.string(),
        fields: z.array(z.object({
          name: z.string(),
          dataType: z.string(),
          isRequired: z.boolean().optional(),
        })),
      })),
    }).optional(),
    teacher: z.object({
      sections: z.array(z.object({
        name: z.string(),
        fields: z.array(z.object({
          name: z.string(),
          dataType: z.string(),
          isRequired: z.boolean().optional(),
        })),
      })),
    }).optional(),
  }),
  roles: z.array(z.object({
    name: z.string(),
    permissions: z.any(),
  })),
  branding: z.object({
    logo: z.string().optional(),
    primaryColor: z.string().optional(),
  }).optional(),
  tierSignals: z.object({
    studentCount: z.number().optional(),
    staffCount: z.number().optional(),
    campusCount: z.number().optional(),
    institutionType: z.string().optional(),
    establishedYear: z.number().optional(),
  }).optional(),
});

// Get onboarding steps
onboarding.get('/steps', async (c) => {
  return c.json(ONBOARDING_STEPS);
});

// Get current onboarding status for a school
onboarding.get('/status', async (c) => {
  const schoolId = c.get('schoolId');

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  return c.json({
    completed: school.onboardingCompleted,
    currentStep: school.onboardingStep,
    data: school.onboardingData,
    tierSignals: school.tierSignals,
  });
});

// Update onboarding step
onboarding.post('/step', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = updateOnboardingStepSchema.parse(body);

  // Validate step exists
  const step = ONBOARDING_STEPS.find(s => s.id === validated.step);
  if (!step) {
    return c.json({ error: 'Invalid onboarding step' }, 400);
  }

  // Get current school data
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  // Merge step data with existing onboarding data
  const currentData = (school.onboardingData as any) || {};
  const updatedData = {
    ...currentData,
    [validated.step]: validated.data,
  };

  // Update school
  await db.update(schools)
    .set({
      onboardingStep: validated.step,
      onboardingData: updatedData,
    })
    .where(eq(schools.id, schoolId));

  return c.json({
    success: true,
    currentStep: validated.step,
    data: updatedData,
  });
});

// Complete onboarding
onboarding.post('/complete', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = completeOnboardingSchema.parse(body);

  // Get school
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  // Update school name and slug
  await db.update(schools)
    .set({
      name: validated.schoolName,
      slug: validated.schoolSlug,
      branding: validated.branding || {},
      tierSignals: validated.tierSignals || {},
      onboardingCompleted: true,
      onboardingStep: 'complete',
    })
    .where(eq(schools.id, schoolId));

  // Create modules
  for (const moduleInternalName of validated.modules) {
    // Get module config from suggested modules
    const moduleConfig = getSuggestedModuleConfig(moduleInternalName);
    if (moduleConfig) {
      await db.insert(entityTypes).values({
        schoolId,
        name: moduleConfig.name,
        internalName: moduleConfig.internalName,
        isCore: false,
        isDeletable: true,
        icon: moduleConfig.icon,
        color: moduleConfig.color,
      });
    }
  }

  // Create schema (sections and fields)
  if (validated.schema.learner) {
    await createSchemaForEntityType(schoolId, 'learner', validated.schema.learner);
  }
  if (validated.schema.teacher) {
    await createSchemaForEntityType(schoolId, 'teacher', validated.schema.teacher);
  }

  // Create roles
  for (const roleData of validated.roles) {
    const role = await db.insert(roles).values({
      schoolId,
      name: roleData.name,
      isSystem: roleData.name === 'Owner',
    }).returning();

    // Create permission grants
    if (roleData.permissions) {
      for (const [entityTypeInternalName, permissions] of Object.entries(roleData.permissions as any)) {
        const entityType = await db.query.entityTypes.findFirst({
          where: and(
            eq(entityTypes.schoolId, schoolId),
            eq(entityTypes.internalName, entityTypeInternalName)
          ),
        });

        if (entityType) {
          await db.insert(permissionGrants).values({
            schoolId,
            roleId: role[0].id,
            entityTypeId: entityType.id,
            sectionId: null, // Full access
            canView: permissions.view || false,
            canCreate: permissions.create || false,
            canEdit: permissions.edit || false,
            canDelete: permissions.delete || false,
          });
        }
      }
    }
  }

  return c.json({
    success: true,
    message: 'Onboarding completed successfully',
  });
});

// Get tier classification signals
onboarding.get('/tier-signals', async (c) => {
  const schoolId = c.get('schoolId');

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) {
    return c.json({ error: 'School not found' }, 404);
  }

  return c.json({
    signals: school.tierSignals,
    currentTier: school.tier,
  });
});

// Helper function to get suggested module config
function getSuggestedModuleConfig(internalName: string) {
  const modules: Record<string, any> = {
    finance: {
      name: 'Finance',
      internalName: 'finance',
      icon: 'dollar-sign',
      color: '#10b981',
    },
    library: {
      name: 'Library',
      internalName: 'library',
      icon: 'book-open',
      color: '#8b5cf6',
    },
    hr: {
      name: 'HR',
      internalName: 'hr',
      icon: 'users',
      color: '#f59e0b',
    },
    health: {
      name: 'Health',
      internalName: 'health',
      icon: 'heart',
      color: '#ef4444',
    },
    communication: {
      name: 'Communication',
      internalName: 'communication',
      icon: 'message-square',
      color: '#06b6d4',
    },
  };

  return modules[internalName];
}

// Helper function to create schema for an entity type
async function createSchemaForEntityType(
  schoolId: string,
  entityTypeInternalName: string,
  schema: any
) {
  // Get entity type
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, entityTypeInternalName)
    ),
  });

  if (!entityType) {
    return;
  }

  // Create sections and fields
  let sectionOrder = 0;
  for (const sectionData of schema.sections) {
    const section = await db.insert(sections).values({
      schoolId,
      entityTypeId: entityType.id,
      name: sectionData.name,
      internalName: sectionData.name.toLowerCase().replace(/\s+/g, '_'),
      displayOrder: sectionOrder++,
    }).returning();

    // Create fields
    let fieldOrder = 0;
    for (const fieldData of sectionData.fields) {
      await db.insert(fieldDefinitions).values({
        schoolId,
        entityTypeId: entityType.id,
        sectionId: section[0].id,
        name: fieldData.name,
        internalName: fieldData.name.toLowerCase().replace(/\s+/g, '_'),
        dataType: fieldData.dataType,
        isRequired: fieldData.isRequired || false,
        isUnique: false,
        isIdentifier: false,
        displayOrder: fieldOrder++,
      });
    }
  }
}

export default onboarding;
// Permissions & Roles API Routes
// Doc 07 — Section-level access, role CRUD, automatic dashboard composition

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import {
  roles,
  permissionGrants,
  userRoles,
  entityTypes,
  sections,
} from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

const permissions = new Hono();

// Validation schemas
const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const createPermissionSchema = z.object({
  roleId: z.string().uuid(),
  entityTypeId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

const assignRoleSchema = z.object({
  userId: z.string(),
  roleId: z.string().uuid(),
});

// Role CRUD Operations

// List all roles for a school
permissions.get('/roles', async (c) => {
  const schoolId = c.get('schoolId');
  const allRoles = await db.query.roles.findMany({
    where: eq(roles.schoolId, schoolId),
  });
  return c.json(allRoles);
});

// Get role by ID with permissions
permissions.get('/roles/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const roleId = c.req.param('id');

  const role = await db.query.roles.findFirst({
    where: and(
      eq(roles.schoolId, schoolId),
      eq(roles.id, roleId)
    ),
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  // Get permissions for this role
  const permissionsList = await db.query.permissionGrants.findMany({
    where: and(
      eq(permissionGrants.schoolId, schoolId),
      eq(permissionGrants.roleId, roleId)
    ),
  });

  // Get users with this role
  const usersWithRole = await db.query.userRoles.findMany({
    where: and(
      eq(userRoles.schoolId, schoolId),
      eq(userRoles.roleId, roleId)
    ),
  });

  return c.json({
    ...role,
    permissions: permissionsList,
    userCount: usersWithRole.length,
  });
});

// Create a role
permissions.post('/roles', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createRoleSchema.parse(body);

  // Check for duplicate role name
  const existing = await db.query.roles.findFirst({
    where: and(
      eq(roles.schoolId, schoolId),
      eq(roles.name, validated.name)
    ),
  });

  if (existing) {
    return c.json({ error: 'A role with this name already exists' }, 400);
  }

  const role = await db.insert(roles).values({
    schoolId,
    name: validated.name,
    description: validated.description,
    isSystem: false,
  }).returning();

  return c.json(role[0], 201);
});

// Update a role
permissions.put('/roles/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const roleId = c.req.param('id');
  const body = await c.req.json();
  const validated = updateRoleSchema.parse(body);

  const role = await db.query.roles.findFirst({
    where: and(
      eq(roles.schoolId, schoolId),
      eq(roles.id, roleId)
    ),
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  if (role.isSystem) {
    return c.json({ error: 'Cannot modify system roles' }, 400);
  }

  // Check for duplicate name if updating
  if (validated.name) {
    const existing = await db.query.roles.findFirst({
      where: and(
        eq(roles.schoolId, schoolId),
        eq(roles.name, validated.name),
        eq(roles.id, roleId) // Exclude current role
      ),
    });

    if (existing) {
      return c.json({ error: 'A role with this name already exists' }, 400);
    }
  }

  const updated = await db.update(roles)
    .set({
      name: validated.name || role.name,
      description: validated.description ?? role.description,
    })
    .where(and(
      eq(roles.schoolId, schoolId),
      eq(roles.id, roleId)
    ))
    .returning();

  return c.json(updated[0]);
});

// Delete a role
permissions.delete('/roles/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const roleId = c.req.param('id');

  const role = await db.query.roles.findFirst({
    where: and(
      eq(roles.schoolId, schoolId),
      eq(roles.id, roleId)
    ),
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  if (role.isSystem) {
    return c.json({ error: 'Cannot delete system roles' }, 400);
  }

  // Remove all permission grants for this role
  await db.delete(permissionGrants).where(and(
    eq(permissionGrants.schoolId, schoolId),
    eq(permissionGrants.roleId, roleId)
  ));

  // Remove all user role assignments
  await db.delete(userRoles).where(and(
    eq(userRoles.schoolId, schoolId),
    eq(userRoles.roleId, roleId)
  ));

  // Delete the role
  await db.delete(roles).where(and(
    eq(roles.schoolId, schoolId),
    eq(roles.id, roleId)
  ));

  return c.json({ success: true });
});

// Permission Management

// Get all permissions for a role
permissions.get('/roles/:roleId/permissions', async (c) => {
  const schoolId = c.get('schoolId');
  const roleId = c.req.param('roleId');

  const permissionsList = await db.query.permissionGrants.findMany({
    where: and(
      eq(permissionGrants.schoolId, schoolId),
      eq(permissionGrants.roleId, roleId)
    ),
  });

  return c.json(permissionsList);
});

// Set permission for a role on an entity type/section
permissions.post('/permissions', async (c) => {
  const schoolId = c.get('schoolId');
  const body = await c.req.json();
  const validated = createPermissionSchema.parse(body);

  // Check if role exists
  const role = await db.query.roles.findFirst({
    where: and(
      eq(roles.schoolId, schoolId),
      eq(roles.id, validated.roleId)
    ),
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  // Check if entity type exists
  const entityType = await db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.id, validated.entityTypeId)
    ),
  });

  if (!entityType) {
    return c.json({ error: 'Entity type not found' }, 404);
  }

  // If section specified, check it exists
  if (validated.sectionId) {
    const section = await db.query.sections.findFirst({
      where: and(
        eq(sections.schoolId, schoolId),
        eq(sections.id, validated.sectionId),
        eq(sections.entityTypeId, validated.entityTypeId)
      ),
    });

    if (!section) {
      return c.json({ error: 'Section not found' }, 404);
    }
  }

  // Check for existing permission
  const existing = await db.query.permissionGrants.findFirst({
    where: and(
      eq(permissionGrants.schoolId, schoolId),
      eq(permissionGrants.roleId, validated.roleId),
      eq(permissionGrants.entityTypeId, validated.entityTypeId),
      validated.sectionId
        ? eq(permissionGrants.sectionId, validated.sectionId)
        : undefined
    ),
  });

  if (existing) {
    // Update existing permission
    const updated = await db.update(permissionGrants)
      .set({
        canView: validated.canView,
        canCreate: validated.canCreate,
        canEdit: validated.canEdit,
        canDelete: validated.canDelete,
      })
      .where(and(
        eq(permissionGrants.schoolId, schoolId),
        eq(permissionGrants.id, existing.id)
      ))
      .returning();

    return c.json(updated[0]);
  }

  // Create new permission
  const permission = await db.insert(permissionGrants).values({
    schoolId,
    roleId: validated.roleId,
    entityTypeId: validated.entityTypeId,
    sectionId: validated.sectionId,
    canView: validated.canView,
    canCreate: validated.canCreate,
    canEdit: validated.canEdit,
    canDelete: validated.canDelete,
  }).returning();

  return c.json(permission[0], 201);
});

// Delete a permission
permissions.delete('/permissions/:id', async (c) => {
  const schoolId = c.get('schoolId');
  const permissionId = c.req.param('id');

  const permission = await db.query.permissionGrants.findFirst({
    where: and(
      eq(permissionGrants.schoolId, schoolId),
      eq(permissionGrants.id, permissionId)
    ),
  });

  if (!permission) {
    return c.json({ error: 'Permission not found' }, 404);
  }

  await db.delete(permissionGrants).where(and(
    eq(permissionGrants.schoolId, schoolId),
    eq(permissionGrants.id, permissionId)
  ));

  return c.json({ success: true });
});

// User Role Assignment

// Get roles for a user
permissions.get('/users/:userId/roles', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.req.param('userId');

  const userRolesList = await db.query.userRoles.findMany({
    where: and(
      eq(userRoles.schoolId, schoolId),
      eq(userRoles.userId, userId)
    ),
  });

  // Get role details
  const roleIds = userRolesList.map(ur => ur.roleId);
  const rolesList = await db.query.roles.findMany({
    where: and(
      eq(roles.schoolId, schoolId)
    ),
  });

  const assignedRoles = rolesList.filter(r => roleIds.includes(r.id));

  return c.json(assignedRoles);
});

// Assign role to user
permissions.post('/users/:userId/roles', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.req.param('userId');
  const body = await c.req.json();
  const validated = assignRoleSchema.parse(body);

  // Check if role exists
  const role = await db.query.roles.findFirst({
    where: and(
      eq(roles.schoolId, schoolId),
      eq(roles.id, validated.roleId)
    ),
  });

  if (!role) {
    return c.json({ error: 'Role not found' }, 404);
  }

  // Check if already assigned
  const existing = await db.query.userRoles.findFirst({
    where: and(
      eq(userRoles.schoolId, schoolId),
      eq(userRoles.userId, userId),
      eq(userRoles.roleId, validated.roleId)
    ),
  });

  if (existing) {
    return c.json({ error: 'User already has this role' }, 400);
  }

  const userRole = await db.insert(userRoles).values({
    schoolId,
    userId,
    roleId: validated.roleId,
  }).returning();

  return c.json(userRole[0], 201);
});

// Remove role from user
permissions.delete('/users/:userId/roles/:roleId', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.req.param('userId');
  const roleId = c.req.param('roleId');

  const userRole = await db.query.userRoles.findFirst({
    where: and(
      eq(userRoles.schoolId, schoolId),
      eq(userRoles.userId, userId),
      eq(userRoles.roleId, roleId)
    ),
  });

  if (!userRole) {
    return c.json({ error: 'User role assignment not found' }, 404);
  }

  await db.delete(userRoles).where(and(
    eq(userRoles.schoolId, schoolId),
    eq(userRoles.userId, userId),
    eq(userRoles.roleId, roleId)
  ));

  return c.json({ success: true });
});

// Check user permissions
permissions.get('/users/:userId/check', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.req.param('userId');
  const entityTypeId = c.req.query('entityTypeId');
  const sectionId = c.req.query('sectionId');

  // Get user's roles
  const userRolesList = await db.query.userRoles.findMany({
    where: and(
      eq(userRoles.schoolId, schoolId),
      eq(userRoles.userId, userId)
    ),
  });

  if (userRolesList.length === 0) {
    return c.json({ hasAccess: false, permissions: {} });
  }

  // Get permissions for all user's roles
  const roleIds = userRolesList.map(ur => ur.roleId);
  const allPermissions = await db.query.permissionGrants.findMany({
    where: and(
      eq(permissionGrants.schoolId, schoolId)
    ),
  });

  // Filter to user's roles
  const userPermissions = allPermissions.filter(p => roleIds.includes(p.roleId));

  // If entity type specified, filter further
  let relevantPermissions = userPermissions;
  if (entityTypeId) {
    relevantPermissions = userPermissions.filter(
      p => p.entityTypeId === entityTypeId
    );
  }

  if (sectionId) {
    relevantPermissions = relevantPermissions.filter(
      p => p.sectionId === sectionId || p.sectionId === null
    );
  }

  // Combine permissions (OR logic - if any role grants access, user has access)
  const combinedPermissions = {
    canView: relevantPermissions.some(p => p.canView),
    canCreate: relevantPermissions.some(p => p.canCreate),
    canEdit: relevantPermissions.some(p => p.canEdit),
    canDelete: relevantPermissions.some(p => p.canDelete),
  };

  return c.json({
    hasAccess: combinedPermissions.canView,
    permissions: combinedPermissions,
  });
});

// Automatic Dashboard Composition
// Returns widgets/modules the user has access to
permissions.get('/users/:userId/dashboard', async (c) => {
  const schoolId = c.get('schoolId');
  const userId = c.req.param('userId');

  // Get user's roles
  const userRolesList = await db.query.userRoles.findMany({
    where: and(
      eq(userRoles.schoolId, schoolId),
      eq(userRoles.userId, userId)
    ),
  });

  if (userRolesList.length === 0) {
    return c.json({ modules: [], widgets: [] });
  }

  // Get permissions for all user's roles
  const roleIds = userRolesList.map(ur => ur.roleId);
  const allPermissions = await db.query.permissionGrants.findMany({
    where: and(
      eq(permissionGrants.schoolId, schoolId)
    ),
  });

  const userPermissions = allPermissions.filter(p => roleIds.includes(p.roleId));

  // Get entity types user has access to
  const accessibleEntityTypeIds = [...new Set(userPermissions.map(p => p.entityTypeId))];

  // Get entity type details
  const allEntityTypes = await db.query.entityTypes.findMany({
    where: eq(entityTypes.schoolId, schoolId),
  });

  const accessibleEntityTypes = allEntityTypes.filter(
    et => accessibleEntityTypeIds.includes(et.id)
  );

  // Build dashboard modules
  const modules = accessibleEntityTypes.map(entityType => {
    const entityPermissions = userPermissions.filter(
      p => p.entityTypeId === entityType.id
    );

    // Determine what sections user can access
    const accessibleSections = entityPermissions
      .filter(p => p.sectionId !== null)
      .map(p => p.sectionId);

    // If user has full entity type access (sectionId = null)
    const hasFullAccess = entityPermissions.some(p => p.sectionId === null);

    return {
      entityTypeId: entityType.id,
      name: entityType.name,
      icon: entityType.icon,
      color: entityType.color,
      hasFullAccess,
      accessibleSectionCount: accessibleSections.length,
      canCreate: entityPermissions.some(p => p.canCreate),
      canEdit: entityPermissions.some(p => p.canEdit),
      canDelete: entityPermissions.some(p => p.canDelete),
    };
  });

  return c.json({
    modules,
    totalModules: modules.length,
  });
});

export default permissions;
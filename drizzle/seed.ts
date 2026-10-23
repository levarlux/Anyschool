// Phase 2: Six Core Pillars + Enrollment
// Seeds entity_types with core pillars and default relationships

import { db } from '../api/src/db';
import { entityTypes, relationshipDefinitions } from './schema';
import { eq, and } from 'drizzle-orm';

// Core Pillars + Enrollment (7 total)
const CORE_PILLARS = [
  { name: 'Learner', internalName: 'learner', icon: 'user', color: '#3B82F6' },
  { name: 'Class', internalName: 'class', icon: 'users', color: '#10B981' },
  { name: 'Subject', internalName: 'subject', icon: 'book', color: '#8B5CF6' },
  { name: 'Teacher', internalName: 'teacher', icon: 'briefcase', color: '#F59E0B' },
  { name: 'Term', internalName: 'term', icon: 'calendar', color: '#EF4444' },
  { name: 'Assessment', internalName: 'assessment', icon: 'clipboard', color: '#EC4899' },
  { name: 'Enrollment', internalName: 'enrollment', icon: 'user-plus', color: '#06B6D4' },
];

// Default relationships from Doc 01 §5
const DEFAULT_RELATIONSHIPS = [
  // Subject ↔ Teacher (required, many-to-many)
  { from: 'subject', to: 'teacher', cardinality: 'many-many', isDefault: true },
  // Subject ↔ Learner (required, many-to-many)
  { from: 'subject', to: 'learner', cardinality: 'many-many', isDefault: true },
  // Subject ↔ Class (optional, many-to-many)
  { from: 'subject', to: 'class', cardinality: 'many-many', isDefault: true },
  // Teacher ↔ Class (optional, many-to-many)
  { from: 'teacher', to: 'class', cardinality: 'many-many', isDefault: true },
  // Teacher ↔ Learner (optional, many-to-many)
  { from: 'teacher', to: 'learner', cardinality: 'many-many', isDefault: true },
  // Enrollment ↔ Learner (required, many-to-one)
  { from: 'enrollment', to: 'learner', cardinality: 'many-one', isDefault: true },
  // Enrollment ↔ Term (required, many-to-one)
  { from: 'enrollment', to: 'term', cardinality: 'many-one', isDefault: true },
];

/**
 * Seed core pillars for a new school
 */
export async function seedCorePillars(schoolId: string): Promise<void> {
  console.log(`Seeding core pillars for school: ${schoolId}`);

  // Insert core pillars
  for (const pillar of CORE_PILLARS) {
    const existing = await db.query.entityTypes.findFirst({
      where: and(
        eq(entityTypes.schoolId, schoolId),
        eq(entityTypes.internalName, pillar.internalName)
      ),
    });

    if (!existing) {
      await db.insert(entityTypes).values({
        schoolId,
        name: pillar.name,
        internalName: pillar.internalName,
        isCore: true,
        isDeletable: false,
        icon: pillar.icon,
        color: pillar.color,
      });
      console.log(`  Created pillar: ${pillar.name}`);
    }
  }

  // Get created entity types for relationship mapping
  const allEntityTypes = await db.query.entityTypes.findMany({
    where: eq(entityTypes.schoolId, schoolId),
  });

  const typeMap = new Map(allEntityTypes.map(t => [t.internalName, t.id]));

  // Insert default relationships
  for (const rel of DEFAULT_RELATIONSHIPS) {
    const fromId = typeMap.get(rel.from);
    const toId = typeMap.get(rel.to);

    if (!fromId || !toId) {
      console.warn(`  Skipping relationship: ${rel.from} ↔ ${rel.to} (entity type not found)`);
      continue;
    }

    const existing = await db.query.relationshipDefinitions.findFirst({
      where: and(
        eq(relationshipDefinitions.schoolId, schoolId),
        eq(relationshipDefinitions.fromEntityTypeId, fromId),
        eq(relationshipDefinitions.toEntityTypeId, toId)
      ),
    });

    if (!existing) {
      await db.insert(relationshipDefinitions).values({
        schoolId,
        fromEntityTypeId: fromId,
        toEntityTypeId: toId,
        cardinality: rel.cardinality,
        isDefault: true,
        isActive: true,
      });
      console.log(`  Created relationship: ${rel.from} ↔ ${rel.to}`);
    }
  }

  console.log('Core pillars seeding complete');
}

/**
 * Get a core pillar by internal name
 */
export async function getCorePillar(schoolId: string, internalName: string) {
  return db.query.entityTypes.findFirst({
    where: and(
      eq(entityTypes.schoolId, schoolId),
      eq(entityTypes.internalName, internalName),
      eq(entityTypes.isCore, true)
    ),
  });
}
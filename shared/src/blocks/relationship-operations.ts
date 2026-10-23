// Relationship Operations — Shared link/unlink/link-bulk logic
// Used by all entity route files (subjects, teachers, learners, classes)

import { db } from '../../../api/src/db';
import { relationshipRecords } from '../../../drizzle/schema';
import { eq, and, or } from 'drizzle-orm';

// ─── Single Link ──────────────────────────────────────────────

export async function linkRecord(params: {
  schoolId: string;
  fromRecordId: string;
  toRecordId: string;
  relationshipDefinitionId: string;
}): Promise<{ id: string; success: true } | { error: string }> {
  const { schoolId, fromRecordId, toRecordId, relationshipDefinitionId } = params;

  const existing = await db.query.relationshipRecords.findFirst({
    where: (rr, { and: a, or: o }) => a(
      eq(rr.relationshipDefinitionId, relationshipDefinitionId),
      o(
        a(eq(rr.fromEntityRecordId, fromRecordId), eq(rr.toEntityRecordId, toRecordId)),
        a(eq(rr.fromEntityRecordId, toRecordId), eq(rr.toEntityRecordId, fromRecordId)),
      ),
    ),
  });
  if (existing) return { error: 'Link already exists' };

  const [link] = await db.insert(relationshipRecords).values({
    schoolId, relationshipDefinitionId, fromEntityRecordId: fromRecordId, toEntityRecordId: toRecordId,
  }).returning();

  return { id: link.id, success: true };
}

// ─── Bulk Link ────────────────────────────────────────────────

export async function linkRecordsBulk(params: {
  schoolId: string;
  fromRecordId: string;
  toRecordIds: string[];
  relationshipDefinitionId: string;
}): Promise<{ linked: number; skipped: number; ids: string[] }> {
  const { schoolId, fromRecordId, toRecordIds, relationshipDefinitionId } = params;

  if (!Array.isArray(toRecordIds) || toRecordIds.length === 0) {
    return { linked: 0, skipped: 0, ids: [] };
  }

  const existingLinks = await db.query.relationshipRecords.findMany({
    where: (rr, { and: a, inArray: i }) => a(
      eq(rr.relationshipDefinitionId, relationshipDefinitionId),
      i(rr.fromEntityRecordId, [fromRecordId, ...toRecordIds]),
    ),
  });

  const existingPairs = new Set(
    existingLinks.map(rr =>
      [rr.fromEntityRecordId, rr.toEntityRecordId].sort().join(':')
    )
  );

  const newIds = toRecordIds.filter(id =>
    !existingPairs.has([fromRecordId, id].sort().join(':'))
  );

  if (newIds.length === 0) {
    return { linked: 0, skipped: toRecordIds.length, ids: [] };
  }

  const inserted = await db.insert(relationshipRecords).values(
    newIds.map(toRecordId => ({
      schoolId,
      relationshipDefinitionId,
      fromEntityRecordId: fromRecordId,
      toEntityRecordId: toRecordId,
    }))
  ).returning();

  return {
    linked: inserted.length,
    skipped: toRecordIds.length - inserted.length,
    ids: inserted.map(r => r.id),
  };
}

// ─── Unlink ───────────────────────────────────────────────────

export async function unlinkRecord(params: {
  schoolId: string;
  linkId: string;
}): Promise<{ success: true }> {
  const { schoolId, linkId } = params;

  await db.delete(relationshipRecords).where(
    and(eq(relationshipRecords.schoolId, schoolId), eq(relationshipRecords.id, linkId)),
  );

  return { success: true };
}

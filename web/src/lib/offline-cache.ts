// Offline-Safe Editing Cache (Doc 13 §5)
// Local draft buffer for in-progress work during connection drops.
// Designed for the Tauri desktop shell — falls back to localStorage in browser.

export interface DraftEntry {
  id: string;
  entityType: string;
  entityId?: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
}

const STORAGE_KEY = 'anyschool_draft_cache';

/**
 * Save a draft to local cache.
 */
export function saveDraft(entry: Omit<DraftEntry, 'createdAt' | 'updatedAt' | 'synced'>): DraftEntry {
  const drafts = getAllDrafts();
  const now = new Date().toISOString();
  const existing = drafts.findIndex(d => d.id === entry.id);

  const full: DraftEntry = {
    ...entry,
    createdAt: existing >= 0 ? drafts[existing].createdAt : now,
    updatedAt: now,
    synced: false,
  };

  if (existing >= 0) {
    drafts[existing] = full;
  } else {
    drafts.push(full);
  }

  persistDrafts(drafts);
  return full;
}

/**
 * Get all cached drafts.
 */
export function getAllDrafts(): DraftEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get unsynced drafts (pending sync).
 */
export function getUnsyncedDrafts(): DraftEntry[] {
  return getAllDrafts().filter(d => !d.synced);
}

/**
 * Mark drafts as synced after successful server push.
 */
export function markDraftsSynced(ids: string[]): void {
  const drafts = getAllDrafts();
  for (const draft of drafts) {
    if (ids.includes(draft.id)) {
      draft.synced = true;
    }
  }
  persistDrafts(drafts);
}

/**
 * Delete synced drafts (cleanup after sync confirmed).
 */
export function clearSyncedDrafts(): void {
  const drafts = getAllDrafts().filter(d => !d.synced);
  persistDrafts(drafts);
}

/**
 * Delete a specific draft.
 */
export function deleteDraft(id: string): void {
  const drafts = getAllDrafts().filter(d => d.id !== id);
  persistDrafts(drafts);
}

/**
 * Clear all drafts (nuclear option).
 */
export function clearAllDrafts(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get draft count.
 */
export function getDraftCount(): number {
  return getAllDrafts().length;
}

/**
 * Check if there are unsynced changes.
 */
export function hasUnsyncedChanges(): boolean {
  return getUnsyncedDrafts().length > 0;
}

function persistDrafts(drafts: DraftEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error('Failed to persist drafts:', e);
  }
}

// Auto-sync hook: periodically attempt to sync unsynced drafts
export function startAutoSync(
  syncFn: (entries: DraftEntry[]) => Promise<string[]>
): ReturnType<typeof setInterval> | null {
  if (typeof localStorage === 'undefined') return null;

  return setInterval(async () => {
    const unsynced = getUnsyncedDrafts();
    if (unsynced.length === 0) return;

    try {
      const syncedIds = await syncFn(unsynced);
      markDraftsSynced(syncedIds);
      // Clean up fully synced drafts after 5 minutes
      setTimeout(clearSyncedDrafts, 5 * 60 * 1000);
    } catch (e) {
      // Will retry on next interval — connection may be down
    }
  }, 30000); // Every 30 seconds
}

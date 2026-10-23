// useBulkLink — Shared multi-select + bulk link hook
// Extracted from SubjectDetail, usable by any detail page

import { useState, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const FALLBACK_SCHOOL_ID = '88374870-9175-4565-a876-f17c2e295519';

function currentSchoolId(): string {
  return localStorage.getItem('anyschool_current_school') || FALLBACK_SCHOOL_ID;
}

export function useBulkLink() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((allIds: string[]) => {
    setSelectedIds(prev => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const bulkLink = useCallback(async (
    apiPrefix: string,
    fromRecordId: string,
    toRecordIds: string[],
    relationshipDefinitionId: string,
  ): Promise<{ linked: number; skipped: number } | null> => {
    if (toRecordIds.length === 0) return null;
    setLinking(true);
    try {
      const res = await fetch(`${API}/${apiPrefix}/link-bulk/${currentSchoolId()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromRecordId, toRecordIds, relationshipDefinitionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedIds(new Set());
        return data;
      }
    } catch {}
    setLinking(false);
    return null;
  }, []);

  return {
    selectedIds,
    linking,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    bulkLink,
    setLinking,
  };
}

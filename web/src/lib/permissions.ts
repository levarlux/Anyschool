// usePermissions — Frontend permission gating hook
// Calls GET /api/permissions/users/:userId/check to determine access.
// Falls back to full access when no auth is configured (dev mode).

import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export interface Permissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface UsePermissionsOptions {
  entityTypeId?: string;
  sectionId?: string;
  /** Skip the API call and return full permissions (for components that need to render regardless) */
  skip?: boolean;
}

/**
 * Check permissions for the current user on a given entity type.
 *
 * Usage:
 *   const { permissions, loading } = usePermissions({ entityTypeId: '...' });
 *   if (!permissions.canCreate) return <DisabledButton />;
 *
 * When no auth is configured (no userId in localStorage), returns full permissions.
 * When auth is wired up, calls the check endpoint.
 */
export function usePermissions({ entityTypeId, sectionId, skip = false }: UsePermissionsOptions = {}) {
  const [permissions, setPermissions] = useState<Permissions>({
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
  });
  const [loading, setLoading] = useState(!skip);

  const checkPermissions = useCallback(async () => {
    if (skip || !entityTypeId) {
      setPermissions({ canView: true, canCreate: true, canEdit: true, canDelete: true });
      setLoading(false);
      return;
    }

    const userId = localStorage.getItem('anyschool_user_id');
    if (!userId) {
      // No auth configured — default to full access
      setPermissions({ canView: true, canCreate: true, canEdit: true, canDelete: true });
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ entityTypeId });
      if (sectionId) params.set('sectionId', sectionId);
      const res = await fetch(`${API}/permissions/users/${userId}/check?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions || { canView: true, canCreate: true, canEdit: true, canDelete: true });
      }
    } catch {
      // On error, default to full access (fail-open for dev)
      setPermissions({ canView: true, canCreate: true, canEdit: true, canDelete: true });
    }
    setLoading(false);
  }, [entityTypeId, sectionId, skip]);

  useEffect(() => { checkPermissions(); }, [checkPermissions]);

  return { permissions, loading, refresh: checkPermissions };
}

/**
 * Check a single permission verb. Convenience wrapper.
 *
 * Usage:
 *   const canEdit = useCanEdit(entityTypeId);
 *   if (!canEdit) return <ReadOnlyView />;
 */
export function useCanEdit(entityTypeId?: string): boolean {
  const { permissions } = usePermissions({ entityTypeId, skip: !entityTypeId });
  return permissions.canEdit;
}

export function useCanDelete(entityTypeId?: string): boolean {
  const { permissions } = usePermissions({ entityTypeId, skip: !entityTypeId });
  return permissions.canDelete;
}

export function useCanCreate(entityTypeId?: string): boolean {
  const { permissions } = usePermissions({ entityTypeId, skip: !entityTypeId });
  return permissions.canCreate;
}

// useEntityFields — Single source of truth for entity field management
// Handles: fetching fields, optimistic updates on create/rename/delete, order persistence,
// cache invalidation. Used by LearnersPage, TeachersPage, ClassesPage, and any other
// page that has a FieldManager.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { sortFieldsByOrder, sortFieldsByOrderOnly, getFieldOrder } from './fieldOrder';
import { loadCache, saveCache, fetchVersions } from './cache';

const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

function getCacheKey(entityType: string): string {
  return `anyschool_${entityType}s_${SCHOOL_ID}`;
}

export interface EntityRecord {
  id: string;
  values: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  parentRecordId?: string | null;
}

export interface UseEntityFieldsReturn {
  fields: any[];
  records: EntityRecord[];
  loading: boolean;
  /** Fields sorted and filtered by visibility - for table display. */
  orderedFields: any[];
  /** Fields sorted by order only, no visibility filter - for FieldManager. */
  orderedFieldsOnly: any[];
  /** Call when a field is created/renamed/deleted to refresh from the server. */
  onFieldsChanged: () => Promise<void>;
  /** Optimistically update fields (called by FieldManager for instant UI). */
  onLocalFieldsChange: (newFields: any[]) => void;
  /** Force a full refetch (e.g. after bulk import). */
  refresh: () => Promise<void>;
  /** Call after toggling field visibility to force table re-render */
  onVisibilityChanged: () => void;
}

export function useEntityFields(
  entityType: string,
  fetchListFn: () => Promise<{ records: EntityRecord[]; fields: any[] }>
): UseEntityFieldsReturn {
  const [fields, setFields] = useState<any[]>([]);
  const [records, setRecords] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibilityCounter, setVisibilityCounter] = useState(0);
  // Use ref to avoid stale closure in load() — fields changes but load captures old value
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const cacheKey = getCacheKey(entityType);

  const load = useCallback(async (force = false) => {
    // No hardcoded timeout — let the API respond at its own pace.
    // The loading state persists until data arrives or the fetch fails.
    try {
      if (force) {
        setLoading(true);
        const data = await fetchListFn();
        setRecords(data.records || []);
        // Preserve locally-added fields that might not be in API yet
        const apiFieldIds = new Set(data.fields?.map((f: any) => f.id) || []);
        const newFields = fieldsRef.current.filter(f => !apiFieldIds.has(f.id));
        const mergedFields = newFields.length > 0 ? [...data.fields, ...newFields] : data.fields;
        setFields(mergedFields || []);
        const versions = await fetchVersions(SCHOOL_ID);
        saveCache(cacheKey, { records: data.records || [], fields: mergedFields || [] }, versions || {});
      } else {
        const cached = loadCache<{ records: EntityRecord[]; fields: any[] }>(cacheKey);
        if (cached) {
          setRecords(cached.data.records || []);
          setFields(cached.data.fields || []);
          setLoading(false);
          // Check staleness in background
          fetchVersions(SCHOOL_ID).then(versions => {
            const cachedVersion = cached.version?.[entityType];
            const serverVersion = versions?.[entityType];
            const stale = !serverVersion || !cachedVersion ||
              cachedVersion.lastUpdatedAt !== serverVersion.lastUpdatedAt ||
              cachedVersion.count !== serverVersion.count;
            if (stale) {
              fetchListFn().then(data => {
                setRecords(data.records || []);
                const hasCustomOrder = getFieldOrder(entityType, SCHOOL_ID) !== null;
                if (!hasCustomOrder) {
                  setFields(data.fields || []);
                }
                saveCache(cacheKey, { records: data.records || [], fields: data.fields || [] }, versions || {});
              }).catch(() => {});
            }
          }).catch(() => {});
        } else {
          setLoading(true);
          let data;
          let fetchError = null;
          try {
            data = await fetchListFn();
          } catch (e) {
            fetchError = e;
          }
          if (fetchError || !data || data.records?.length === 0) {
            // If fetch fails or returns empty, retry once after a short delay
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
              data = await fetchListFn();
            } catch (e2) {
              console.error(`useEntityFields(${entityType}) retry failed:`, e2);
            }
          }
          setRecords(data?.records || []);
          setFields(data?.fields || []);
          const versions = await fetchVersions(SCHOOL_ID);
          saveCache(cacheKey, { records: data?.records || [], fields: data?.fields || [] }, versions || {});
        }
      }
    } catch (e) {
      console.error(`useEntityFields(${entityType}) load error:`, e);
    } finally {
      setLoading(false);
    }
  }, [entityType, fetchListFn, cacheKey]);

  useEffect(() => {
    load();
  }, [load]);

  const onFieldsChanged = useCallback(async () => {
    localStorage.removeItem(cacheKey);
    await load(true);
  }, [cacheKey, load]);

  const onLocalFieldsChange = useCallback((newFields: any[]) => {
    // Preserve relationship fields that aren't in the new array (FieldManager filters them out
    // since they're rendered as extraColumns and can't be reordered in the table).
    const relFields = fieldsRef.current.filter((f: any) => f.dataType === 'relationship');
    const realFields = newFields.filter((f: any) => f.dataType !== 'relationship');
    setFields([...realFields, ...relFields]);
  }, []);

  const onVisibilityChanged = useCallback(() => {
    setVisibilityCounter(v => v + 1);
  }, []);

  const orderedFields = useMemo(
    () => sortFieldsByOrder(fields, entityType, SCHOOL_ID),
    [fields, entityType, visibilityCounter]
  );

  const orderedFieldsOnly = useMemo(
    () => sortFieldsByOrderOnly(fields, entityType, SCHOOL_ID),
    [fields, entityType, visibilityCounter]
  );

  return {
    fields,
    records,
    loading,
    orderedFields,
    orderedFieldsOnly,
    onFieldsChanged,
    onLocalFieldsChange,
    refresh: () => load(true),
    onVisibilityChanged,
  };
}

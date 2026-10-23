// useOrderedFields — Small helper hook for forms that manage fields directly
// (not via useEntityFields). Returns:
//   - orderedFieldsOnly: fields sorted by localStorage order, NOT filtered by visibility
//                          (use this for FieldManager so hidden fields remain visible)
//   - orderedFields: fields sorted by localStorage order, filtered by visibility
//                    (use this for DataTable or anywhere you want only visible fields)
//   - onLocalFieldsChange: pass to FieldManager to update local fields
//   - onVisibilityChanged: pass to FieldManager to trigger re-render after visibility toggle

import { useState, useCallback, useMemo } from 'react';
import { sortFieldsByOrder, sortFieldsByOrderOnly } from './fieldOrder';

const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

export function useOrderedFields(entityType: string) {
  const [fields, setFields] = useState<any[]>([]);
  const [visibilityCounter, setVisibilityCounter] = useState(0);

  const onLocalFieldsChange = useCallback((newFields: any[]) => {
    setFields(newFields);
  }, []);

  const onVisibilityChanged = useCallback(() => {
    setVisibilityCounter(v => v + 1);
  }, []);

  const orderedFieldsOnly = useMemo(
    () => sortFieldsByOrderOnly(fields, entityType, SCHOOL_ID),
    [fields, entityType, visibilityCounter]
  );

  const orderedFields = useMemo(
    () => sortFieldsByOrder(fields, entityType, SCHOOL_ID),
    [fields, entityType, visibilityCounter]
  );

  return {
    fields,
    setFields,
    orderedFields,
    orderedFieldsOnly,
    onLocalFieldsChange,
    onVisibilityChanged,
  };
}

# Bug Fix Report: Multi-Value Fields Table Display

**Date Fixed:** September 4, 2026
**Bug ID:** Fix #7 (see `verified-fixes-ledger.md`)
**Status:** FROZEN

---

## Problem Statement

Multi-value input (using comma to separate multiple values in a single field like phone numbers or email addresses) had TWO bugs:

### Bug A: Raw String Display in Tables
**Symptom:** When a field contained multiple values (e.g., `+254711222333,+254722333444`), the table showed the raw comma-separated string instead of a dropdown.

**Root Cause:** The `parseMultiValue` function only handled JSON arrays (`["a", "b"]`) but the actual stored format was plain comma-separated strings. Additionally, the multi-value dropdown logic was only applied to `dataType === 'relationship'` fields.

### Bug B: Stale Data After Save
**Symptom:** After editing a record in detail view (e.g., removing extra phone numbers) and saving, returning to the list still showed the old deleted values.

**Root Cause:** When saving from `LearnerDetail`/`TeacherDetail`/`ClassDetail`:
1. Only the single-record cache (`anyschool_record_${SCHOOL_ID}_${recordId}`) was invalidated
2. The list cache (`anyschool_${entityType}s_${SCHOOL_ID}`) was NOT invalidated
3. The detail component had no way to tell the parent list to refresh

---

## Technical Details

### Part A: Data Format Discovery

The user confirmed the actual storage format via CLI question:
- **Storage format:** Plain comma-separated string (e.g., `+254711222333,+254722333444`)
- **NOT** JSON array strings

### Part B: Cache Architecture

```
List View (LearnersPage)
  └── useEntityFields hook
       ├── localStorage: anyschool_learners_${SCHOOL_ID}
       └── calls fetchListFn() to get records

Detail View (LearnerDetail)
  └── localStorage: anyschool_record_${SCHOOL_ID}_${recordId}
  └── calls fetchRecord() to get single record
```

On save, `LearnerDetail` called `refreshData()` which only updated its own cache - not the list cache.

---

## Solution Implementation

### Fix A1: Enhanced parseMultiValue Function

**File:** `web/src/components/DataTable.tsx` (lines ~195-214)

```typescript
export function parseMultiValue(value: any): string[] | null {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map(v => String(v ?? ''));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Try JSON array first
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(v => String(v ?? ''));
      } catch { /* fall through */ }
    }
    // Handle plain comma-separated string
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }
  }
  return null;
}
```

**Key:** Now handles BOTH formats - JSON arrays and comma-separated strings.

### Fix A2: Universal Multi-Value Rendering in renderCell

**File:** `web/src/components/DataTable.tsx`

Added BEFORE the relationship check in `renderCell` (line ~217):

```typescript
// Handle multi-value arrays for ANY non-boolean field type
if (field.dataType !== 'relationship' && field.dataType !== 'boolean' && field.dataType !== 'file') {
  const parsed = parseMultiValue(value);
  if (parsed && parsed.length > 0) {
    if (parsed.length === 1) {
      return <span>{parsed[0]}</span>;
    }
    return <MultiValueDropdown names={parsed} label={String(value)} />;
  }
}
```

**Key:** Applied to ALL field types, not just `relationship`.

### Fix A3: Same Pattern in FieldValueDisplay

**File:** `web/src/components/FieldValueDisplay.tsx` - Added same `parseMultiValue` function and multi-value dropdown rendering for detail views.

### Fix A4: Same Pattern in EntityList

**File:** `web/src/components/EntityList.tsx` - Added `getDisplayValue` helper using `parseMultiValue` for the generic entity list component.

---

### Fix B1: Added onSaved Callback to Detail Components

**Files:** `LearnerDetail.tsx`, `TeacherDetail.tsx`, `ClassDetail.tsx`

Props interface change:
```typescript
interface Props {
  recordId: string;
  initialData: { id: string; values: Record<string, any> } | null;
  onBack: () => void;
  onDeleted: () => void;
  onSaved?: () => void;  // NEW
}
```

In `handleSave` after successful save:
```typescript
if (res.ok) {
  localStorage.removeItem(CACHE_KEY);
  await refreshData();
  setEditing(false);
  setSaveStatus('success');
  onSaved?.();  // NEW - tells parent to refresh
  setTimeout(() => setSaveStatus('idle'), 2500);
}
```

### Fix B2: Wire onSaved to Parent's onFieldsChanged

**Files:** `LearnersPage.tsx`, `TeachersPage.tsx`, `ClassesPage.tsx`

```typescript
return <LearnerDetail
  recordId={selectedId}
  initialData={clickedRecord || null}
  onBack={() => { setView('list'); setSelectedId(null); }}
  onDeleted={handleRecordDeleted}
  onSaved={onFieldsChanged}  // NEW - refreshes list cache
/>;
```

**Effect:** After save, `onFieldsChanged()` calls `load(true)` which:
1. Sets loading state
2. Fetches fresh data from API
3. Updates `setRecords` state
4. Saves new data to cache

---

## Files Modified Summary

| File | Change |
|------|--------|
| `web/src/components/DataTable.tsx` | `parseMultiValue` (exported), multi-value branch in `renderCell` |
| `web/src/components/FieldValueDisplay.tsx` | `parseMultiValue`, multi-value rendering |
| `web/src/components/EntityList.tsx` | `getDisplayValue` helper using `parseMultiValue` |
| `web/src/components/LearnerDetail.tsx` | Added `onSaved` prop, calls after save |
| `web/src/components/TeacherDetail.tsx` | Added `onSaved` prop, calls after save |
| `web/src/components/ClassDetail.tsx` | Added `onSaved` prop, calls after save |
| `web/src/components/LearnersPage.tsx` | Passes `onFieldsChanged` as `onSaved` |
| `web/src/components/TeachersPage.tsx` | Passes `onFieldsChanged` as `onSaved` |
| `web/src/components/ClassesPage.tsx` | Passes `onFieldsChanged` as `onSaved` |

---

## Testing Checklist

- [ ] Add multiple phone numbers to a learner using comma input
- [ ] Verify table shows first number + "+N" dropdown
- [ ] Click dropdown to see all numbers
- [ ] Edit record, delete a phone number, save
- [ ] Return to list - deleted number should NOT appear
- [ ] New values added should appear with dropdown
- [ ] Same tests for email fields
- [ ] Same tests for address fields
- [ ] Detail view should also show dropdown for multi-value fields

---

## How to Identify This Bug Pattern

**Symptom Pattern 1:** "Values saved but list doesn't update"
- Check if detail component calls parent's refresh callback
- Check if list cache is being invalidated on save

**Symptom Pattern 2:** "Raw array string showing in table"
- Check if `parseMultiValue` handles the actual stored format
- Check if table rendering applies dropdown logic to field type

---

## Related Protocol Sections

- **GOVERNANCE_PROTOCOL.md Section 2:** Code Freeze - components in this fix are now FROZEN
- **EXECUTION_PROTOCOL.md Phase 5:** User must confirm fix before ledger entry
- **verified-fixes-ledger.md:** Contains official ledger entry for this fix

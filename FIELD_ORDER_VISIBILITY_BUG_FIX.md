# Bug Fix Report: Field Order & Visibility Persistence

**Date Fixed:** September 4, 2026
**Bug IDs:** Fix #8 (reorder), Fix #9 (visibility)
**Status:** FROZEN

---

## Bug #8 — Field Reordering Not Persisting

### Problem Statement

When a user reordered fields in the FieldManager, the new order would:
1. Work correctly within the same session
2. Persist correctly in the TABLE after navigation
3. BUT revert to original position in the FieldManager after navigation
4. When reordering a SECOND field, the FIRST field would also revert

### Root Cause

**Two issues combined:**

1. **FieldManager received wrong prop:** FieldManager received `fields` (raw server order from API) instead of `orderedFields` (sorted by localStorage). The table correctly received `orderedFields` which read from localStorage.

2. **Background staleness check overwrote custom order:** In `useEntityFields.ts`, when the background staleness check detected stale data, it would call `setFields(data.fields)` which replaced the user's custom-ordered fields with server-order fields.

### Data Flow Analysis

```
LocalStorage: anyschool_field_order_${schoolId}_${entityType}
  └── { order: [id1, id2, id3, ...], visible: { id2: false, ... } }

useEntityFields hook:
  ├── fields (raw server order) → used by FieldManager
  ├── orderedFields = sortFieldsByOrder(fields, ...) → used by TABLE
  └── orderedFieldsOnly = sortFieldsByOrderOnly(fields, ...) → used by FieldManager (FIX)

sortFieldsByOrder():
  └── Reads localStorage config, sorts AND filters by visibility

sortFieldsByOrderOnly():  ← NEW
  └── Reads localStorage config, sorts ONLY (no visibility filter)
```

### Solution

1. **Created `sortFieldsByOrderOnly()`** in `fieldOrder.ts`:
   - Same sorting logic as `sortFieldsByOrder()`
   - Does NOT filter hidden fields
   - Purpose: FieldManager needs to show ALL fields (including hidden) so users can un-hide them

2. **Created `useOrderedFields()` hook** in `useOrderedFields.ts`:
   - For forms that manage fields directly (not via useEntityFields)
   - Returns: `fields`, `setFields`, `orderedFields`, `orderedFieldsOnly`, `onLocalFieldsChange`, `onVisibilityChanged`
   - Same logic as useEntityFields but without the API fetching

3. **Added `orderedFieldsOnly`** to `useEntityFields` hook:
   - Returns fields sorted by saved order only
   - Does not filter hidden fields

4. **Updated ALL places using FieldManager** to pass correct props:
   - Table: `orderedFields` (sorted + filtered by visibility)
   - FieldManager: `orderedFieldsOnly` (sorted only, no visibility filter)
   - All locations:
     - `TeachersPage.tsx` (uses useEntityFields)
     - `LearnersPage.tsx` (uses useEntityFields)
     - `ClassesPage.tsx` (uses useEntityFields)
     - `AddTeacherForm.tsx` (uses useOrderedFields hook)
     - `AddLearnerForm.tsx` (uses useOrderedFields hook)
     - `AddClassForm.tsx` (uses useOrderedFields hook)

5. **Fixed background staleness check** in `useEntityFields.ts`:
   - Added check: `if (!hasCustomOrder) setFields(data.fields)`
   - Only overwrites fields from server if user has NOT set custom order
   - Preserves custom order when user has set one

### Files Modified

| File | Change |
|------|--------|
| `web/src/lib/fieldOrder.ts` | Added `sortFieldsByOrderOnly()` function |
| `web/src/lib/useOrderedFields.ts` | NEW file - hook for forms that don't use useEntityFields |
| `web/src/lib/useEntityFields.ts` | Added `orderedFieldsOnly` useMemo; fixed staleness check |
| `web/src/components/TeachersPage.tsx` | Pass `orderedFieldsOnly` to FieldManager |
| `web/src/components/LearnersPage.tsx` | Pass `orderedFieldsOnly` to FieldManager |
| `web/src/components/ClassesPage.tsx` | Pass `orderedFieldsOnly` to FieldManager |
| `web/src/components/AddTeacherForm.tsx` | Use `useOrderedFields` hook; pass `orderedFieldsOnly` to FieldManager |
| `web/src/components/AddLearnerForm.tsx` | Use `useOrderedFields` hook; pass `orderedFieldsOnly` to FieldManager |
| `web/src/components/AddClassForm.tsx` | Use `useOrderedFields` hook; pass `orderedFieldsOnly` to FieldManager |

---

## Bug #9 — Field Visibility Toggle Not Hiding Columns

### Problem Statement

When toggling field visibility (eye icon):
1. Field would disappear from BOTH the table AND FieldManager
2. User could not see the hidden field to un-hide it
3. Or field would not disappear at all

### Root Cause

**Incorrect prop passed to FieldManager:** FieldManager was receiving `orderedFields` (which filters hidden fields) instead of receiving fields sorted without visibility filtering.

When FieldManager receives `orderedFields`:
- Hidden fields are already filtered out
- The eye icon toggle would toggle localStorage but the field wouldn't appear in the list
- User couldn't un-hide fields because they couldn't see them

### Solution

FieldManager receives `orderedFieldsOnly` (sorted by localStorage, no visibility filter):
- ALL fields are shown including hidden ones
- User can see hidden fields with their eye icon
- Clicking eye icon to un-hide immediately shows field in table

**Critical distinction:**
- `orderedFields` → for TABLE (filters hidden, user can't see them anyway)
- `orderedFieldsOnly` → for FieldManager (shows all, user needs to see hidden fields to un-hide)

### Files Modified

| File | Change |
|------|--------|
| `web/src/lib/fieldOrder.ts` | Added `sortFieldsByOrderOnly()` function |
| `web/src/lib/useEntityFields.ts` | Added `orderedFieldsOnly` and `onVisibilityChanged` |
| `web/src/components/FieldManager.tsx` | `toggleVisibility` calls `onVisibilityChanged` instead of `onFieldsChanged` |
| `web/src/components/TeachersPage.tsx` | Pass `orderedFieldsOnly` to FieldManager |
| `web/src/components/LearnersPage.tsx` | Pass `orderedFieldsOnly` to FieldManager |
| `web/src/components/ClassesPage.tsx` | Pass `orderedFieldsOnly` to FieldManager |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│ useEntityFields Hook                                             │
│                                                                  │
│  fields ──────────► orderedFieldsOnly ──────► FieldManager      │
│  (raw server)      (sorted, no filter)        (shows ALL fields)│
│                                                                  │
│                    orderedFields ────────────► DataTable         │
│                    (sorted + filtered)          (shows visible)   │
│                                                                  │
│  visibilityCounter ──► triggers orderedFields recalculation      │
│  onVisibilityChanged() → increments counter                      │
│                                                                  │
│  localStorage: anyschool_field_order_${schoolId}_${entityType}   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## How to Identify These Bug Patterns

### Pattern: Reorder works but reverts after navigation
- Check if FieldManager receives `fields` (raw) instead of `orderedFieldsOnly`
- Check if background staleness check overwrites custom order

### Pattern: Hidden fields disappear from FieldManager
- FieldManager must receive `orderedFieldsOnly`, NOT `orderedFields`
- `orderedFields` filters hidden fields - wrong for FieldManager

### Pattern: Visibility toggle doesn't update table
- `toggleVisibility` in FieldManager must call `onVisibilityChanged()` not `onFieldsChanged()`
- `onFieldsChanged()` triggers expensive API refetch (unnecessary for visibility)
- `onVisibilityChanged()` simply increments a counter to trigger useMemo recalc

---

## What NOT to Change

### DO NOT change these:
1. **FieldManager props:** `fields` should ALWAYS be `orderedFieldsOnly` (sorted, unfiltered) in ALL locations
2. **Table props:** `fields` should ALWAYS be `orderedFields` (sorted + filtered)
3. **toggleVisibility:** Should call `onVisibilityChanged()` not `onFieldsChanged()`
4. **sortFieldsByOrderOnly:** Must remain as-is (sorting without visibility filter)
5. **Staleness check:** Must check `hasCustomOrder` before calling `setFields()`
6. **All FieldManager wiring** in these files must follow the pattern:
   - `TeachersPage.tsx` (useEntityFields → orderedFieldsOnly)
   - `LearnersPage.tsx` (useEntityFields → orderedFieldsOnly)
   - `ClassesPage.tsx` (useEntityFields → orderedFieldsOnly)
   - `AddTeacherForm.tsx` (useOrderedFields → orderedFieldsOnly)
   - `AddLearnerForm.tsx` (useOrderedFields → orderedFieldsOnly)
   - `AddClassForm.tsx` (useOrderedFields → orderedFieldsOnly)
7. **Future pages** that use FieldManager MUST follow the same pattern - get orderedFieldsOnly from appropriate source

### If you need to modify field order/visibility logic:
1. Read this document fully
2. Understand that `orderedFields` and `orderedFieldsOnly` serve DIFFERENT purposes
3. Table needs filtered (visibility), FieldManager needs unfiltered
4. Test both reorder AND visibility toggle after any change

---

## Freeze Status

**FROZEN** — All components and functions listed in this document are protected under GOVERNANCE_PROTOCOL.md.

- `sortFieldsByOrderOnly()` function in `fieldOrder.ts`
- `orderedFieldsOnly` in `useEntityFields` hook
- `orderedFields` in `useEntityFields` hook (for table)
- `onVisibilityChanged` callback and `visibilityCounter` state
- FieldManager `toggleVisibility` implementation
- Staleness check logic in `useEntityFields.ts`

---

## Related Protocol Sections

- **GOVERNANCE_PROTOCOL.md Section 2:** Code Freeze - components in this fix are now FROZEN
- **EXECUTION_PROTOCOL.md Phase 5:** User must confirm fix before ledger entry
- **verified-fixes-ledger.md:** Contains official ledger entries for Fix #8 and Fix #9

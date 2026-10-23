# Verified Fixes Ledger

## Fix #1 — MultiValueDropdown single-item rendering
**Resolved:** When a relationship/array field had exactly 1 item, the table cell rendered a hardcoded count string (e.g., "— 1 class") instead of the actual item name.
**Target Components:**
- `web/src/components/DataTable.tsx` — `renderCell` relationship branch (lines ~228-246): added `names.length === 1` branch rendering `names[0]` as plain text
- `web/src/components/TeachersPage.tsx` — extraColumns Subjects (line ~417) and Classes (line ~441): same `names.length === 1` fix
**Architecture:** Three-way conditional: `length === 0` → em-dash, `length === 1` → `names[0]` plain text, `length > 1` → first name + dropdown trigger
**Freeze Status:** FROZEN — `renderCell` relationship branch and TeachersPage extraColumns render functions are protected.

---

## Fix #2 — Save handler silent failure (all entity detail pages)
**Resolved:** `handleSave` silently failed on API error or network failure — no user feedback, button stuck in "Saving..." state. Also no success indication on save.
**Target Components:**
- `web/src/components/TeacherDetail.tsx` — added `saveStatus` state (`'idle' | 'success' | 'error'`); `handleSave` now sets error/success with auto-reset via `setTimeout`; Save button turns green (success) or red (error) with `✓ Saved!` / `✗ Failed` text
- `web/src/components/LearnerDetail.tsx` — same pattern
- `web/src/components/ClassDetail.tsx` — same pattern
**Architecture:** `saveStatus` state drives button style/color/text. `setTimeout` auto-resets after 2500ms (success) or 3000ms (error). Errors logged to console for debugging.
**Freeze Status:** FROZEN — `handleSave` functions and save button render logic in all three Detail components are protected.

---

## Fix #3 — DynamicField isMultiple for all field types
**Resolved:** No reusable mechanism existed to allow multi-value inputs (e.g., multiple phone numbers, multiple addresses) on arbitrary field types. Only hardcoded relationship fields supported multi-value UI.
**Target Components:**
- `web/src/components/DynamicField.tsx` — `FieldSchema` interface: added `isMultiple?: boolean`; `renderMultiValueControls` helper renders + Add another / × remove buttons; `isMultiple` branch covers all scalar field types: `text`, `number`, `date`, `time`, `currency`, `measurement`, `select` (pill UI), `boolean`, `file`
- `drizzle/schema.ts` — `fieldDefinitions` table: added `isMultiple: boolean('is_multiple').default(false).notNull()`
- `drizzle/migrations/003_add_is_multiple_to_field_definitions.sql` — migration to add column
- `api/src/routes/seed.ts` — shorthand notation extended to `{ n, i, d, o?, m? }`; `m: true` set on `phone` and `email` (teacher), `parent_phone` and `address` (learner)
**Architecture:** `isMultiple` is a property on the field definition. `DynamicField` checks `field.isMultiple` at render time and wraps any scalar field type with multi-value controls. Arrays serialized as JSON strings in storage.
**Freeze Status:** FROZEN — `FieldSchema.isMultiple`, `renderMultiValueControls`, and all `isMultiple` branches in `DynamicField` are protected.

---

## Fix #4 — select + isMultiple renders pill/tag UI (not stacked dropdowns)
**Resolved:** `dataType: 'select'` with `isMultiple: true` was rendering stacked `<select>` inputs — not a proper multi-select pill/tag interface.
**Target Components:**
- `web/src/components/DynamicField.tsx` — `select` + `isMultiple` branch: replaced stacked dropdowns with pill/tag multi-select UI (purple pills with × remove, dropdown at end to add more), with JSON array parsing for stored values
**Architecture:** Same pill UI as `dataType: 'multi-select'`. Reads stored JSON arrays back via `JSON.parse` with try/catch fallback to empty array.
**Freeze Status:** FROZEN — `select` + `isMultiple` branch in `DynamicField` is protected.

---

## Fix #5 — upsertFieldValues broken onConflictDoUpdate (teachers.ts)
**Resolved:** `upsertFieldValues` in `teachers.ts` used `onConflictDoUpdate({ target: [entityRecordId, fieldDefinitionId], ... })` but no unique constraint existed on `(entity_record_id, field_definition_id)` in the `field_values` table — causing every save to throw a 500 error silently.
**Target Components:**
- `api/src/routes/teachers.ts` — removed broken `onConflictDoUpdate`; changed to plain `db.insert(fieldValues).values(...)` (delete-first strategy already prevents duplicates)
**Architecture:** `partial: false` always deletes all existing field values before inserting new ones — no need for conflict resolution. Plain inserts used throughout.
**Freeze Status:** FROZEN — `teachers.ts upsertFieldValues` function is protected.

---

## Fix #6 — Array values (isMultiple) not serialized in upsertFieldValues
**Resolved:** `isMultiple` fields send arrays (e.g., `["Kenya", "Uganda"]`) but all three `upsertFieldValues` fell through to `String(val)` producing `"Kenya,Uganda"` — corrupting multi-value data.
**Target Components:**
- `api/src/routes/teachers.ts` — added `Array.isArray(val)` check serializing as `JSON.stringify(val)`
- `api/src/routes/learners.ts` — same fix
- `api/src/routes/classes.ts` — same fix
**Architecture:** `Array.isArray(val) ? JSON.stringify(val) : String(val)` in the default branch of all three upsertFieldValues switch statements.
**Freeze Status:** FROZEN — all three `upsertFieldValues` functions are protected.

---

## Fix #7 — Multi-value display in tables (comma-separated + cache invalidation)
**Resolved:** Two related bugs: (1) Multi-value fields (phone, email, etc.) stored as plain comma-separated strings showed raw strings like `"+254...,+254..."` in tables instead of dropdown UI. (2) Saving from detail view did not invalidate the list cache, so returning to list showed stale data with deleted values still present.
**Target Components:**
- `web/src/components/DataTable.tsx` — `parseMultiValue` function (lines ~195-214): extended to handle both JSON arrays (`["a","b"]`) and plain comma-separated strings (`"a,b"`); `renderCell` now calls `parseMultiValue` for ALL non-boolean, non-file, non-relationship field types and renders `MultiValueDropdown` when length > 1
- `web/src/components/FieldValueDisplay.tsx` — added same `parseMultiValue` logic with `MultiValueDropdown` for detail views
- `web/src/components/EntityList.tsx` — added `getDisplayValue` helper using `parseMultiValue`; phone field rendering uses this helper
- `web/src/components/LearnerDetail.tsx` — added `onSaved?: () => void` prop; calls `onSaved?.()` after successful save to refresh parent list cache
- `web/src/components/TeacherDetail.tsx` — same `onSaved` prop and callback pattern
- `web/src/components/ClassDetail.tsx` — same `onSaved` prop and callback pattern
- `web/src/components/LearnersPage.tsx` — passes `onFieldsChanged` as `onSaved` to `LearnerDetail`
- `web/src/components/TeachersPage.tsx` — passes `onFieldsChanged` as `onSaved` to `TeacherDetail`
- `web/src/components/ClassesPage.tsx` — passes `onFieldsChanged` as `onSaved` to `ClassDetail`
**Architecture:** `parseMultiValue` returns `string[] | null`: tries JSON.parse first if string starts with `[`, otherwise splits by comma. `renderCell` / `getDisplayValue` use this to detect multi-value fields and render `MultiValueDropdown` (first item + "+N" button) instead of raw string. Detail components now call parent's `onFieldsChanged` after save, which calls `load(true)` to force-refresh and re-save cache.
**Freeze Status:** FROZEN — `parseMultiValue` function, all `renderCell` multi-value branches, `onSaved` callback pattern in all three Detail components, and `onSaved={onFieldsChanged}` wiring in all three Page components are protected.

---

## Fix #8 — Field Reordering Not Persisting After Navigation

**Resolved:** Field reorder worked in the same session but reverted after navigating away and back. When reordering a second field, the first field would also revert to original position. Affected ALL pages using FieldManager: Teachers, Learners, Classes, AddTeacherForm, AddLearnerForm, AddClassForm.

**Root Cause:**
1. FieldManager received `fields` (raw server order) instead of `orderedFieldsOnly` (sorted by localStorage)
2. Background staleness check in `useEntityFields` overwrote `fields` with server data, losing custom order

**Target Components:**
- `web/src/lib/fieldOrder.ts` — added `sortFieldsByOrderOnly()` function (sorts without visibility filter)
- `web/src/lib/useEntityFields.ts` — added `orderedFieldsOnly` useMemo; fixed background staleness check to preserve custom order
- `web/src/lib/useOrderedFields.ts` — NEW hook for forms that don't use useEntityFields (AddLearnerForm, AddTeacherForm, AddClassForm)
- `web/src/components/TeachersPage.tsx` — passes `orderedFieldsOnly` to FieldManager
- `web/src/components/LearnersPage.tsx` — passes `orderedFieldsOnly` to FieldManager
- `web/src/components/ClassesPage.tsx` — passes `orderedFieldsOnly` to FieldManager
- `web/src/components/AddTeacherForm.tsx` — uses `useOrderedFields` hook; passes `orderedFieldsOnly` to FieldManager
- `web/src/components/AddLearnerForm.tsx` — uses `useOrderedFields` hook; passes `orderedFieldsOnly` to FieldManager
- `web/src/components/AddClassForm.tsx` — uses `useOrderedFields` hook; passes `orderedFieldsOnly` to FieldManager

**Architecture:** Two separate sorted outputs from same source:
- `orderedFields` = `sortFieldsByOrder()` → filtered by visibility → for DataTable
- `orderedFieldsOnly` = `sortFieldsByOrderOnly()` → NOT filtered → for FieldManager
- Background staleness check now checks `getFieldOrder() !== null` before overwriting fields

**Freeze Status:** FROZEN — `sortFieldsByOrderOnly()` function, `orderedFieldsOnly` in useEntityFields hook, `useOrderedFields` hook, and ALL FieldManager prop wiring in all 6 files are protected.

---

## Fix #9 — Field Visibility Toggle Not Hiding Columns Correctly

**Resolved:** When toggling field visibility (eye icon), field would disappear from BOTH table AND FieldManager, making it impossible to un-hide. Or field wouldn't disappear at all. Affected ALL pages using FieldManager.

**Root Cause:** FieldManager was receiving `orderedFields` (which filters hidden fields) instead of `orderedFieldsOnly` (sorted but showing all fields including hidden). This meant hidden fields were already filtered out before the visibility toggle could even render them.

**Target Components:**
- `web/src/lib/fieldOrder.ts` — `sortFieldsByOrderOnly()` provides unsorted-unfiltered fields
- `web/src/lib/useEntityFields.ts` — `orderedFieldsOnly` useMemo with `visibilityCounter` dependency; `onVisibilityChanged()` callback increments counter
- `web/src/lib/useOrderedFields.ts` — NEW hook with same pattern for forms
- `web/src/components/FieldManager.tsx` — `toggleVisibility` calls `onVisibilityChanged()` (not `onFieldsChanged()`)
- `web/src/components/TeachersPage.tsx` — passes `orderedFieldsOnly` + `onVisibilityChanged` to FieldManager
- `web/src/components/LearnersPage.tsx` — passes `orderedFieldsOnly` + `onVisibilityChanged` to FieldManager
- `web/src/components/ClassesPage.tsx` — passes `orderedFieldsOnly` + `onVisibilityChanged` to FieldManager
- `web/src/components/AddTeacherForm.tsx` — uses `useOrderedFields`; passes `orderedFieldsOnly` + `onVisibilityChanged`
- `web/src/components/AddLearnerForm.tsx` — uses `useOrderedFields`; passes `orderedFieldsOnly` + `onVisibilityChanged`
- `web/src/components/AddClassForm.tsx` — uses `useOrderedFields`; passes `orderedFieldsOnly` + `onVisibilityChanged`

**Architecture:** Visibility toggle is purely localStorage-based (no API call needed). `onVisibilityChanged()` increments counter → `orderedFields` useMemo recalculates → table re-renders with new visibility filter. FieldManager receives `orderedFieldsOnly` which is NOT filtered, so hidden fields still appear with their eye icon.

**Critical Rule:** FieldManager must ALWAYS receive `orderedFieldsOnly` (unsorted-unfiltered), never `orderedFields`. This applies to ALL pages and forms using FieldManager.

**Freeze Status:** FROZEN — `sortFieldsByOrderOnly()`, `orderedFieldsOnly`, `onVisibilityChanged()`, `useOrderedFields` hook, `toggleVisibility` in FieldManager, and all FieldManager prop wiring in all 6 files are protected.

---

## Fix #10 — Ghost Fields: Relationship Columns Duplicating in DataTable

**Resolved:** Relationship fields (`dataType: 'relationship'`) from the API were merged into the `fields` response array. DataTable rendered them as extra columns, duplicating the relationship data already shown by `extraColumns` (Teachers/Learners/Classes badges with icons).

**Root Cause:** `api/src/routes/subjects.ts` line 251: `const allFields = [...fields, ...relFields]` merged virtual relationship fields into the fields response. `sortFieldsByOrder` in `fieldOrder.ts` did not filter by `dataType`, so relationship fields passed through to DataTable.

**Target Components:**
- `web/src/components/SubjectsPage.tsx` — `displayFields` now filters: `orderedFields.filter((f: any) => f.dataType !== 'relationship')`, wrapped in `useMemo([orderedFields])`
- `web/src/components/LearnersPage.tsx` — same filter + memoize
- `web/src/components/TeachersPage.tsx` — same filter + memoize
- `web/src/components/SubjectsPage.tsx` — FieldManager receives `orderedFieldsOnly.filter(f => f.dataType !== 'relationship')`
- `web/src/components/TeachersPage.tsx` — same FieldManager filter
- `web/src/components/LearnersPage.tsx` — same FieldManager filter
- `web/src/components/ClassesPage.tsx` — same FieldManager filter
- `web/src/lib/useEntityFields.ts` — `onLocalFieldsChange` now preserves relationship fields: merges reordered real fields with existing relationship fields from `fieldsRef.current`

**Architecture:** Relationship fields are rendered as hardcoded `extraColumns` in the DataTable (with icons, count badges, MultiValueDropdown). They cannot be reordered via the FieldManager since their position is fixed at the end of the table. Filtering them from both `displayFields` (DataTable) and FieldManager props eliminates ghost columns and prevents misleading reorder controls.

**Freeze Status:** FROZEN — `displayFields` filter in all three Page components, FieldManager filter in all four Page components, and `onLocalFieldsChange` merge logic in `useEntityFields` are protected.

---

## Fix #11 — Detail Page Link/Unlink Not Refreshing List Counts

**Resolved:** When linking or unlinking teachers/learners/classes on SubjectDetail, the parent SubjectsPage list didn't update — counts and names stayed stale until a full page reload.

**Root Cause:** The 6 link/unlink handlers in SubjectDetail called `loadTeachers()`/`loadLearners()`/`loadClasses()` + `refreshData()` but never called `onSaved?.()`, so the parent's `onFieldsChanged` (which triggers `load(true)` to refresh the list) was never invoked.

**Target Components:**
- `web/src/components/SubjectDetail.tsx` — added `onSaved?.()` to `handleLinkTeacher`, `handleUnlinkTeacher`, `handleLinkLearner`, `handleUnlinkLearner`, `handleLinkClass`, `handleUnlinkClass`

**Architecture:** `onSaved` prop (inherited from SubjectsPage's `onFieldsChanged`) triggers a full refetch of the list data. Each link/unlink handler now calls `onSaved?.()` after a successful API response, ensuring the parent list refreshes.

**Freeze Status:** FROZEN — all 6 link/unlink handlers in SubjectDetail are protected.

---

## Fix #12 — Bulk Relationship Linking (Multi-Select + Add Entire Class)

**Resolved:** Users could only link one teacher/learner/class at a time. No way to add an entire class's learners to a subject in one action.

**Target Components:**
- `api/src/routes/subjects.ts` — new `POST /link-bulk/:schoolId` endpoint: accepts `{ fromRecordId, toRecordIds[], relationshipDefinitionId }`, deduplicates against existing links, bulk inserts. New `GET /class-learners/:schoolId/:classId` endpoint: returns all learners linked to a class.
- `web/src/components/SubjectDetail.tsx` — new state: `selectedAvailable`, `linkingBulk`, `classLearners`, `selectedClassId`, `loadingClassLearners`, `classesForBulkLink`. New handlers: `handleBulkLink`, `loadClassLearners`, `handleLinkEntireClass`, `handleConfirmLinkEntireClass`, `loadClassesForBulkLink`. `renderRelationshipPanel` rewritten with: checkboxes + "Select all" on available items, "Link N" bulk button, "Add Entire Class" section (Load Classes → pick class → show count → Confirm), empty-class error message.

**Architecture:** Multi-select uses a `Set<string>` of selected IDs. Bulk link calls `POST /link-bulk` once instead of N individual calls. "Add Entire Class" loads available classes via `GET /available`, then for each class calls `GET /class-learners` to get learner IDs, then bulk-links them via `POST /link-bulk` with `learnersRelDefId`. displayName fixed to include `vals.class_name` for classes.

**Freeze Status:** FROZEN — bulk link endpoint, class-learners endpoint, all new state/handlers in SubjectDetail, and rewritten `renderRelationshipPanel` are protected.

---

## Fix #13 — TermsPage Blank Screen (Widget Argument Order)

**Resolved:** Terms page showed blank white screen on load. KPI and chart widgets crashed the entire component tree because `computeKPI` and `computeChartData` were called with wrong argument order.

**Root Cause:** TermsPage called `computeKPI(w, records)` and `computeChartData(w, records)` — passing the widget config as first argument. Every other page (Subjects, Learners, Teachers, Classes) calls `computeKPI(records, w.dataField, w.aggregation, w.prefix, w.dataFields, fieldMap)`. Additionally, KPICard and ChartWidget received spread individual props (`title`, `value`, `color`) instead of the required `config` object.

**Target Components:**
- `web/src/components/TermsPage.tsx` — Fixed widget rendering to pass correct arguments and `config={w}` prop

**Freeze Status:** FROZEN — widget rendering pattern in TermsPage is protected.

---

## Fix #14 — FieldManager Fields Button Not Working (Terms)

**Resolved:** Clicking "Fields" button in Terms header did nothing. FieldManager panel never appeared.

**Root Cause:** TermsPage conditionally mounted FieldManager with `{showFieldManager && <FieldManager ... />}`. But FieldManager manages its own visibility internally via `useState(false)`. When mounted, it initialized with `show=false`, so the panel was hidden. Other pages (Subjects, Teachers, etc.) render FieldManager unconditionally.

**Target Components:**
- `web/src/components/TermsPage.tsx` — Removed conditional wrapper, removed `showFieldManager` state, removed "Fields" button from header. FieldManager now renders unconditionally (matches all other pages).

**Freeze Status:** FROZEN — unconditional FieldManager rendering in TermsPage is protected.

---

## Fix #15 — Field Deletion 500 Error (Teachers + Subjects)

**Resolved:** Deleting fields that had existing data (e.g., "last name" on teachers) returned 500 error. Fields with no data deleted fine.

**Root Cause:** `teachers.ts` and `subjects.ts` field deletion endpoints deleted `fieldDefinitions` directly without first deleting associated `fieldValues` rows. The `fieldValues` table has a foreign key referencing `fieldDefinitions.id` with no `ON DELETE CASCADE`. PostgreSQL rejected the delete with a foreign key violation. Learners, classes, and terms routes already had the correct pattern.

**Target Components:**
- `api/src/routes/teachers.ts` — Field deletion now: (1) lookup field, (2) 404 if not found, (3) delete fieldValues, (4) delete fieldDefinitions
- `api/src/routes/subjects.ts` — Same fix

**Freeze Status:** FROZEN — field deletion pattern (fieldValues cleanup before fieldDefinitions) in teachers.ts and subjects.ts is protected.

---

## Fix #16 — Terms Field Manager 404 / Not Working

**Resolved:** All FieldManager operations (create, rename, delete, visibility, reorder) failed on Terms page with 404 errors.

**Root Cause:** `ENTITY_API_MAP` in FieldManager.tsx mapped `term` → `'schema'` instead of `'terms'`. FieldManager constructed URLs like `/api/schema/fields/${SCHOOL_ID}/${fieldId}`, but schema-builder routes use `/api/schema/fields/:id` (no schoolId segment). Route mismatch = 404.

**Target Components:**
- `web/src/components/FieldManager.tsx` — Changed `ENTITY_API_MAP`: `term: 'schema'` → `term: 'terms'`

**Freeze Status:** FROZEN — `ENTITY_API_MAP` mapping for `term` is protected.

---

## Fix #17 — Terms Tree View Ignoring FieldManager (Visibility + Reorder)

**Resolved:** Eye toggle and field reordering in FieldManager had no effect on the Terms tree list. Fields appeared/disappeared/reordered in FieldManager but tree view was unchanged.

**Root Cause:** TermsPage tree row renderer hardcoded which fields to show (term_name, academic_year, start_date, end_date, status). It never read `orderedFields` from the hook, so FieldManager's localStorage changes were ignored.

**Target Components:**
- `web/src/components/TermsPage.tsx` — Added `displayFields` useMemo (filtered from `orderedFields`). Tree row now dynamically renders all visible fields: first field = name, rest as metadata with type-appropriate styling (badges for status/select/boolean, labels for text/number/date).

**Freeze Status:** FROZEN — `displayFields` useMemo and dynamic tree row rendering in TermsPage are protected.

---

## Fix #18 — TermDetail Blank Screen (Rules of Hooks Violation)

**Resolved:** Clicking a term to view its detail page showed blank white screen.

**Root Cause:** `displayFields` useMemo was defined after the early return `if (view === 'detail' && selectedId)`. React calls hooks in order every render — skipping a hook on some renders causes a hook count mismatch crash.

**Target Components:**
- `web/src/components/TermsPage.tsx` — Moved `displayFields` useMemo before the early returns

**Freeze Status:** FROZEN — hook ordering in TermsPage (useMemo before early returns) is protected.

---

## Fix #19 — TermDetail Missing Fields (Edit Section Empty)

**Resolved:** Term detail page showed no editable fields when clicking "Edit". The "Additional Information" section was empty.

**Root Cause:** TermsPage passed `initialData={clickedRecord}` (the list record) to TermDetail. List records have `id`, `values`, `parentClassId`, `createdAt`, `updatedAt` but NOT `fields`, `sections`, `parent`, `children`. TermDetail rendered with `data.fields = []` → no field sections.

**Target Components:**
- `web/src/components/TermsPage.tsx` — Changed to pass `initialData={null}` so TermDetail always fetches the full record from `/api/terms/record/:schoolId/:recordId` (which includes `fields`, `sections`, `parent`, `children`)

**Freeze Status:** FROZEN — `initialData={null}` pattern in TermsPage is protected.

---

## Fix #20 — Terms Field Creation Missing Properties + 500 Error

**Resolved:** Two issues: (1) Custom fields created via FieldManager were missing options, unit, min/max, color, fileSubtype. Select fields had no dropdown options. (2) Field creation returned 500 error.

**Root Cause:** (1) Terms field creation endpoint only destructured `name`, `dataType`, `isRequired` from request body. All other properties (options, unit, maxLength, min, max, color, fileSubtype) were silently dropped. (2) The endpoint tried to set `fileSubtype` as a direct database column, but the `field_definitions` table has no `fileSubtype` column — it's stored inside the `validationRules` JSONB field.

**Target Components:**
- `api/src/routes/terms.ts` — POST endpoint now destructures and stores all properties (options, unit, maxLength, min, max, color, fileSubtype in validationRules). Added duplicate name check and auto-incrementing displayOrder. PUT endpoint also updated to handle options, unit, fileSubtype (in validationRules).

**Freeze Status:** FROZEN — terms field creation/update endpoints with full property handling are protected.

---

## Fix #21 — Tree Row Showing Only 3 Custom Fields

**Resolved:** Custom fields beyond the first 3 were invisible in the tree list.

**Root Cause:** Tree row renderer limited metadata to `metaFields.slice(0, 2)` (2 fields) plus the name field = 3 total. Additional fields were truncated.

**Target Components:**
- `web/src/components/TermsPage.tsx` — Tree row now renders ALL `metaFields` with type-appropriate styling: status → colored badge, boolean → Yes/No badge, select/multi-select → blue badge, other → `Name: value` label.

**Freeze Status:** FROZEN — full field rendering in tree row is protected.

---

*Last updated: Wed Sep 16 2026*

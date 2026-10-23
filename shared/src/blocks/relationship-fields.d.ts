/**
 * Result returned by resolveAllRelationshipData — everything the list endpoints need.
 */
export interface RelationshipDataResult {
    /** Virtual field definitions for the field list / widget picker / column picker */
    relFields: Array<Record<string, any>>;
    /** Map: recordId → { __rel_<defId>: displayName } for each relationship */
    relValues: Map<string, Record<string, string>>;
    /** Map: recordId → { [targetEntityName]: count } for quick count lookups */
    relCounts: Map<string, Record<string, number>>;
}
/**
 * Unified batch resolver — fetches everything in 5 shared queries:
 *   1. relationshipDefinitions involving this entity type (shared by fields + counts + values)
 *   2. entityTypes for all targets (shared by fields + counts + values)
 *   3. fieldDefinitions for target types (for display-name resolution)
 *   4. ALL relationshipRecords for all rel defs + recordIds (shared by counts + values)
 *   5. ALL fieldValues for display-name resolution
 *
 * This replaces the previous getRelationshipFields() + batchGetRelationshipCounts() +
 * resolveRelationshipValues() trio which ran 9+ queries with redundant fetches.
 */
export declare function resolveAllRelationshipData(schoolId: string, recordIds: string[], entityTypeId: string, countTargetNames?: string[]): Promise<RelationshipDataResult>;
/**
 * Batch-compute roster counts for multiple class records.
 * Uses exactly 2 queries regardless of classRecordIds count.
 */
export declare function batchGetRosterCounts(classRecordIds: string[], schoolId: string): Promise<Map<string, number>>;
export declare function getRelationshipFields(schoolId: string, entityTypeId: string): Promise<{
    id: string;
    schoolId: string;
    entityTypeId: string;
    sectionId: null;
    name: string;
    internalName: string;
    dataType: "relationship";
    unit: null;
    isRequired: boolean;
    isUnique: boolean;
    isIdentifier: boolean;
    displayOrder: number;
    validationRules: {};
    options: null;
    defaultValue: null;
    createdAt: Date;
    updatedAt: Date;
    _relationshipDefinitionId: string;
    _targetEntityTypeId: string;
    _targetEntityName: string;
    _targetEntityDisplayName: string;
    _cardinality: string;
    _isFrom: boolean;
}[]>;
//# sourceMappingURL=relationship-fields.d.ts.map
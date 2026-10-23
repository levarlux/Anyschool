export declare function linkRecord(params: {
    schoolId: string;
    fromRecordId: string;
    toRecordId: string;
    relationshipDefinitionId: string;
}): Promise<{
    id: string;
    success: true;
} | {
    error: string;
}>;
export declare function linkRecordsBulk(params: {
    schoolId: string;
    fromRecordId: string;
    toRecordIds: string[];
    relationshipDefinitionId: string;
}): Promise<{
    linked: number;
    skipped: number;
    ids: string[];
}>;
export declare function unlinkRecord(params: {
    schoolId: string;
    linkId: string;
}): Promise<{
    success: true;
}>;
//# sourceMappingURL=relationship-operations.d.ts.map
// Shared types for AnySchool

export interface School {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, any>;
  branding: Record<string, any>;
  tier: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntityType {
  id: string;
  schoolId: string;
  name: string;
  internalName: string;
  isCore: boolean;
  isDeletable: boolean;
  icon?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: string;
  schoolId: string;
  entityTypeId: string;
  name: string;
  internalName: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldDefinition {
  id: string;
  schoolId: string;
  entityTypeId: string;
  sectionId?: string;
  name: string;
  internalName: string;
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'file' | 'select' | 'multi-select';
  unit?: string;
  isRequired: boolean;
  isUnique: boolean;
  isIdentifier: boolean;
  displayOrder: number;
  validationRules: Record<string, any>;
  options?: any[];
  defaultValue?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelationshipDefinition {
  id: string;
  schoolId: string;
  fromEntityTypeId: string;
  toEntityTypeId: string;
  cardinality: '1-1' | '1-many' | 'many-many';
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntityRecord {
  id: string;
  schoolId: string;
  entityTypeId: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldValue {
  id: string;
  schoolId: string;
  entityRecordId: string;
  fieldDefinitionId: string;
  textValue?: string;
  numericValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
  fileValue?: {
    url: string;
    key: string;
    name: string;
    type: string;
    size: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface RelationshipRecord {
  id: string;
  schoolId: string;
  relationshipDefinitionId: string;
  fromEntityRecordId: string;
  toEntityRecordId: string;
  createdAt: Date;
  updatedAt: Date;
}
// generateRelationshipColumns — Dynamic extraColumns for DataTable from relFields
// Replaces hardcoded relationship columns in SubjectsPage, TeachersPage, etc.

import React from 'react';
import { MultiValueDropdown } from '../components/DataTable';

export interface RelationshipColumnConfig {
  icon: React.ComponentType<any>;
  /** Background when count > 0 */
  activeBg: string;
  /** Text color when count > 0 */
  activeColor: string;
  /** Plural label, e.g. "teachers" */
  label: string;
  /** Singular label, e.g. "teacher" */
  singular?: string;
  /** Override plural suffix — defaults to label + (count !== 1 ? 's' : '') */
  suffix?: (count: number) => string;
}

/**
 * Given relFields from resolveAllRelationshipData and a config map,
 * returns an extraColumns array for DataTable.
 *
 * Usage:
 *   const columns = generateRelationshipColumns(relFields, {
 *     teacher: { icon: GraduationCap, activeBg: '#fffbeb', activeColor: '#d97706', label: 'Teachers' },
 *     learner: { icon: Users, activeBg: '#eff6ff', activeColor: '#2563eb', label: 'Learners' },
 *     class:   { icon: School, activeBg: '#ecfdf5', activeColor: '#059669', label: 'Classes' },
 *   });
 */
export function generateRelationshipColumns(
  relFields: Array<Record<string, any>>,
  configMap: Record<string, RelationshipColumnConfig>,
) {
  return relFields.map(rel => {
    const target = rel._targetEntityName;
    const cfg = configMap[target];
    if (!cfg) return null;

    const Icon = cfg.icon;
    const label = cfg.label;
    const countKey = `__${target}_count`;
    const namesKey = `__${target}_names`;
    const pluralFn = cfg.suffix || ((c: number) => `${cfg.label.toLowerCase()}${c !== 1 ? 's' : ''}`);

    return {
      header: React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
        React.createElement(Icon, { size: 12 }), label
      ),
      render: (record: any) => {
        const count = record.values?.[countKey] ?? 0;
        const names = record.values?.[namesKey];
        if (Array.isArray(names) && names.length === 1) {
          return React.createElement('span', { style: { fontSize: '0.8rem', color: '#374151' } }, names[0]);
        }
        if (Array.isArray(names) && names.length > 1) {
          return React.createElement(MultiValueDropdown, {
            names,
            label: `${count} ${pluralFn(count)}`,
          });
        }
        return React.createElement('span', {
          className: 'badge',
          style: {
            background: count > 0 ? cfg.activeBg : '#f3f4f6',
            color: count > 0 ? cfg.activeColor : '#9ca3af',
            fontWeight: 600,
          },
        },
          React.createElement(Icon, { size: 11, style: { marginRight: 4 } }),
          count
        );
      },
      width: 120,
    };
  }).filter((col): col is NonNullable<typeof col> => col !== null);
}

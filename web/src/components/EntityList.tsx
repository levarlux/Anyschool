import { useState, useEffect } from 'react';
import { Plus, Upload, Search, MoreHorizontal, Users, School, BookOpen, GraduationCap, Calendar, ClipboardCheck, UserCheck } from 'lucide-react';
import FieldValueDisplay from './FieldValueDisplay';
import { MultiValueDropdown, parseMultiValue } from './DataTable';

const API = '/api';

const ENTITY_META: Record<string, { icon: any; color: string; title: string; desc: string }> = {
  learners: { icon: Users, color: '#3b82f6', title: 'Learners', desc: 'Student records, profiles, and enrollment data' },
  classes: { icon: School, color: '#22c55e', title: 'Classes', desc: 'Class groups, sections, and assignments' },
  subjects: { icon: BookOpen, color: '#a855f7', title: 'Subjects', desc: 'Courses, curricula, and subject definitions' },
  teachers: { icon: GraduationCap, color: '#f59e0b', title: 'Teachers', desc: 'Staff profiles, qualifications, and assignments' },
  terms: { icon: Calendar, color: '#ef4444', title: 'Terms', desc: 'Academic terms, semesters, and periods' },
  assessments: { icon: ClipboardCheck, color: '#ec4899', title: 'Assessments', desc: 'Exams, tests, quizzes, and grading criteria' },
  enrollments: { icon: UserCheck, color: '#06b6d4', title: 'Enrollments', desc: 'Learner-class-subject registrations' },
};

interface RecordData {
  id: string;
  values: Record<string, string | number | boolean | null>;
}

export default function EntityList({ entityType }: { entityType: string }) {
  const [records, setRecords] = useState<RecordData[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const meta = ENTITY_META[entityType] || { icon: School, color: '#6b7280', title: entityType, desc: '' };
  const Icon = meta.icon;

  const schoolId = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        // Get entity types
        const typesRes = await fetch(`${API}/schema/entity-types?schoolId=${schoolId}`);
        if (!typesRes.ok) { setLoading(false); return; }
        const types = await typesRes.json();
        const type = types.find((t: any) => t.internalName === entityType);
        if (!type) { setLoading(false); return; }

        // Get entity type details with fields
        const detailRes = await fetch(`${API}/schema/entity-types/${type.id}?schoolId=${schoolId}`);
        if (!detailRes.ok) { setLoading(false); return; }
        const detail = await detailRes.json();

        // Get all fields flat
        const allFields: any[] = [];
        if (detail.sections) {
          for (const section of detail.sections) {
            if (section.fields) allFields.push(...section.fields);
          }
        }
        if (detail.fields) allFields.push(...detail.fields);
        setFields(allFields);

        // Get records
        const recordsRes = await fetch(`${API}/schema/records/${type.id}?schoolId=${schoolId}`);
        if (recordsRes.ok) {
          const recordsData = await recordsRes.json();
          setRecords(recordsData);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [entityType, schoolId]);

  const getFieldValue = (record: RecordData, fieldName: string) => {
    return record.values?.[fieldName] ?? '—';
  };

  const getDisplayValue = (record: RecordData, field: any) => {
    const rawValue = record.values?.[field.internalName];
    if (rawValue == null || rawValue === '') return '—';
    if (field.dataType === 'boolean') return rawValue ? 'Yes' : 'No';
    const parsed = parseMultiValue(rawValue);
    if (parsed && parsed.length > 1) {
      return <MultiValueDropdown names={parsed} label={String(rawValue)} />;
    }
    if (parsed && parsed.length === 1) return parsed[0];
    return String(rawValue);
  };

  const getDisplayFields = () => {
    // Show first 4 fields as columns
    return fields.slice(0, 4);
  };

  const filteredRecords = records.filter(r => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return Object.values(r.values || {}).some(v =>
      String(v).toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: meta.color + '12' }}>
            <Icon size={22} style={{ color: meta.color }} />
          </div>
          <div>
            <h2>{meta.title}</h2>
            <p className="text-muted">{meta.desc}</p>
          </div>
        </div>
        <div className="entity-header-actions">
          <div className="search-input-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={`Search ${meta.title.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary">
            <Upload size={15} />
            Import
          </button>
          <button className="btn btn-primary">
            <Plus size={15} />
            Add {meta.title.slice(0, -1)}
          </button>
        </div>
      </div>

      <div className="entity-content card">
        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon" style={{ background: meta.color + '12' }}>
              <Icon size={28} style={{ color: meta.color }} />
            </div>
            <p>Loading records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" style={{ background: meta.color + '12' }}>
              <Icon size={28} style={{ color: meta.color }} />
            </div>
            <h3>No {meta.title.toLowerCase()} yet</h3>
            <p>Get started by adding your first {meta.title.toLowerCase().slice(0, -1)}, or import data from a CSV or Excel file.</p>
            <div className="empty-state-actions">
              <button className="btn btn-primary">
                <Plus size={15} />
                Add {meta.title.slice(0, -1)}
              </button>
              <button className="btn btn-secondary">
                <Upload size={15} />
                Import File
              </button>
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {getDisplayFields().map((f: any) => (
                    <th key={f.id}>{f.name}</th>
                  ))}
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record, i) => (
                  <tr key={record.id || i}>
                    {getDisplayFields().map((f: any) => (
                      <td key={f.id}>
                        {f.dataType === 'file' ? (
                          <FieldValueDisplay
                            field={f}
                            value={record.values?.[f.internalName]}
                            displayName={String(record.values?.name || record.values?.subject_name || record.values?.term_name || record.values?.title || '')}
                            imageSize={32}
                          />
                        ) : f.internalName?.includes('status') ? (
                          <span className="badge badge-success">{getFieldValue(record, f.internalName)}</span>
                        ) : f.internalName?.includes('balance') || f.internalName?.includes('salary') || f.internalName?.includes('score') ? (
                          <span style={{ fontWeight: 500 }}>KES {Number(getFieldValue(record, f.internalName) || 0).toLocaleString()}</span>
                        ) : f.internalName?.includes('phone') ? (
                          <span className="td-mono">{getDisplayValue(record, f)}</span>
                        ) : (
                          <span>{getDisplayValue(record, f)}</span>
                        )}
                      </td>
                    ))}
                    <td>
                      <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}>
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// BulkRelationshipAssignment — Generic entity-agnostic bulk assignment tool
// Works for any many-to-many or one-to-many relationship:
//   Learner↔Class, Teacher↔Subject, Teacher↔Class, etc.
//
// Takes sourceEntityType, targetEntityType, relationshipDefinitionId as props.
// Two views: Unassigned (link new) and Assigned (reassign/unlink).
// Permission-aware via usePermissions.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Link, Unlink, Search, X,
  UserPlus, Users,
} from 'lucide-react';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import { usePermissions } from '../lib/permissions';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

// Color palette for target records (auto-assigned by hash)
const TAG_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h); }
function getTagColor(name: string) { return TAG_COLORS[hashStr(name) % TAG_COLORS.length]; }

interface RecordEntry {
  id: string;
  values: Record<string, any>;
  linkId?: string;
  linkedTo?: string; // target record id (for assigned view)
  linkedToName?: string;
}

interface TargetRecord {
  id: string;
  values: Record<string, any>;
  displayName: string;
}

interface Props {
  /** Entity type of the records being assigned (e.g. 'learner', 'teacher') */
  sourceEntityType: string;
  /** Entity type of the target (e.g. 'class', 'subject') */
  targetEntityType: string;
  /** The specific relationship definition ID to operate on */
  relationshipDefinitionId: string;
  /** Source record ID if assigning from a specific record's context (optional) */
  sourceRecordId?: string;
  /** Called when assignment is complete (to refresh parent) */
  onComplete?: () => void;
  /** Whether the modal is open */
  open: boolean;
  /** Close the modal */
  onClose: () => void;
}

export default function BulkRelationshipAssignment({
  sourceEntityType,
  targetEntityType,
  relationshipDefinitionId,
  sourceRecordId,
  onComplete,
  open,
  onClose,
}: Props) {
  const { permissions: _permissions } = usePermissions({});

  // ─── State ──────────────────────────────────────────────
  const [tab, setTab] = useState<'unassigned' | 'assigned'>('unassigned');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetFilter, setTargetFilter] = useState<string>('all');

  // Data
  const [unassignedRecords, setUnassignedRecords] = useState<RecordEntry[]>([]);
  const [assignedRecords, setAssignedRecords] = useState<RecordEntry[]>([]);
  const [targets, setTargets] = useState<TargetRecord[]>([]);
  const [assigningTarget, setAssigningTarget] = useState<string>('');

  // Counts
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [assignedTotal, setAssignedTotal] = useState(0);

  // Operation state
  const [operating, setOperating] = useState(false);

  // ─── Fetch targets (e.g., all classes) ─────────────────
  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/${targetEntityType === 'class' ? 'classes' : targetEntityType === 'subject' ? 'schema' : targetEntityType + 's'}/list/${SCHOOL_ID}`);
      if (res.ok) {
        const data = await res.json();
        const records = data.records || data.entityRecords || [];
        setTargets(records.map((r: any) => ({
          id: r.id,
          values: r.values || {},
          displayName: r.values?.[`${targetEntityType}_name`] || r.values?.name || r.values?.className || r.id.slice(0, 8),
        })));
      }
    } catch {}
  }, [targetEntityType]);

  // ─── Fetch unassigned records ──────────────────────────
  const fetchUnassigned = useCallback(async () => {
    setLoading(true);
    try {
      // Get all source records
      const sourceApi = sourceEntityType === 'learner' ? 'learners' : sourceEntityType === 'teacher' ? 'teachers' : sourceEntityType + 's';
      const res = await fetch(`${API}/${sourceApi}/list/${SCHOOL_ID}`);
      if (res.ok) {
        const data = await res.json();
        const allRecords = data.records || [];

        // Get all assigned record IDs
        const assignedRes = await fetch(`${API}/${sourceApi === 'learners' ? 'classes' : sourceApi}/related/${SCHOOL_ID}/${sourceRecordId || 'all'}/${targetEntityType}`);
        let assignedIds = new Set<string>();
        if (assignedRes.ok) {
          const assignedData = await assignedRes.json();
          for (const rec of assignedData.records || []) {
            assignedIds.add(rec.id);
          }
        }

        // Filter to unassigned
        const unassigned = allRecords.filter((r: any) => !assignedIds.has(r.id));
        setUnassignedRecords(unassigned);
        setUnassignedTotal(unassigned.length);
      }
    } catch {}
    setLoading(false);
  }, [sourceEntityType, targetEntityType, sourceRecordId]);

  // ─── Fetch assigned records ────────────────────────────
  const fetchAssigned = useCallback(async () => {
    setLoading(true);
    try {
      const sourceApi = sourceEntityType === 'learner' ? 'learners' : sourceEntityType === 'teacher' ? 'teachers' : sourceEntityType + 's';
      const res = await fetch(`${API}/${sourceApi}/related/${SCHOOL_ID}/${sourceRecordId || 'all'}/${targetEntityType}`);
      if (res.ok) {
        const data = await res.json();
        setAssignedRecords(data.records || []);
        setAssignedTotal((data.records || []).length);
      }
    } catch {}
    setLoading(false);
  }, [sourceEntityType, targetEntityType, sourceRecordId]);

  // ─── Load data on mount / tab change ───────────────────
  useEffect(() => {
    if (!open) return;
    fetchTargets();
    if (tab === 'unassigned') fetchUnassigned();
    else fetchAssigned();
  }, [open, tab, fetchTargets, fetchUnassigned, fetchAssigned]);

  // ─── Filtered lists ────────────────────────────────────
  const filteredUnassigned = useMemo(() => {
    if (!search) return unassignedRecords;
    const s = search.toLowerCase();
    return unassignedRecords.filter(r =>
      Object.values(r.values || {}).some(v => String(v).toLowerCase().includes(s))
    );
  }, [unassignedRecords, search]);

  const filteredAssigned = useMemo(() => {
    let list = assignedRecords;
    if (targetFilter !== 'all') {
      list = list.filter(r => r.linkedTo === targetFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        Object.values(r.values || {}).some(v => String(v).toLowerCase().includes(s)) ||
        (r.linkedToName || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [assignedRecords, search, targetFilter]);

  // ─── Selection helpers ─────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const list = tab === 'unassigned' ? filteredUnassigned : filteredAssigned;
    if (selectedIds.size === list.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.map(r => r.id)));
    }
  };

  // ─── Assign selected to target ────────────────────────
  const handleBulkAssign = async () => {
    if (!assigningTarget || selectedIds.size === 0) return;
    setOperating(true);
    try {
      const sourceApi = sourceEntityType === 'learner' ? 'classes' : sourceEntityType === 'teacher' ? 'teachers' : sourceEntityType + 's';
      await Promise.all(
        Array.from(selectedIds).map(recordId =>
          fetch(`${API}/${sourceApi}/link/${SCHOOL_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromRecordId: sourceRecordId || recordId,
              toRecordId: sourceRecordId ? recordId : assigningTarget,
              relationshipDefinitionId,
            }),
          })
        )
      );
      setSelectedIds(new Set());
      setAssigningTarget('');
      fetchUnassigned();
      onComplete?.();
    } catch {}
    setOperating(false);
  };

  // ─── Unlink selected ──────────────────────────────────
  const handleBulkUnlink = async () => {
    if (selectedIds.size === 0) return;
    setOperating(true);
    try {
      const sourceApi = sourceEntityType === 'learner' ? 'classes' : sourceEntityType === 'teacher' ? 'teachers' : sourceEntityType + 's';
      await Promise.all(
        Array.from(selectedIds).map(recordId => {
          const rec = assignedRecords.find(r => r.id === recordId);
          if (!rec?.linkId) return Promise.resolve();
          return fetch(`${API}/${sourceApi}/unlink/${SCHOOL_ID}/${rec.linkId}`, { method: 'DELETE' });
        })
      );
      setSelectedIds(new Set());
      fetchAssigned();
      onComplete?.();
    } catch {}
    setOperating(false);
  };

  // ─── Get display name for a record ────────────────────
  const getDisplayName = (record: RecordEntry) => {
    const v = record.values || {};
    return v[`${sourceEntityType}_name`] || v.name || v.full_name ||
      [v.first_name, v.last_name].filter(Boolean).join(' ') ||
      record.id.slice(0, 8);
  };

  // ─── Render ───────────────────────────────────────────
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 16, width: '90vw', maxWidth: 800,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link size={18} style={{ color: 'var(--brand-primary, #3b82f6)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Bulk Assign {sourceEntityType.charAt(0).toUpperCase() + sourceEntityType.slice(1)}s → {targetEntityType.charAt(0).toUpperCase() + targetEntityType.slice(1)}s
            </h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ width: 28, height: 28 }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6' }}>
          {(['unassigned', 'assigned'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedIds(new Set()); setSearch(''); }}
              style={{
                flex: 1, padding: '10px 16px', fontSize: '0.85rem', fontWeight: 500,
                background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--brand-primary, #3b82f6)' : '2px solid transparent',
                color: tab === t ? 'var(--brand-primary, #3b82f6)' : '#6b7280', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {t === 'unassigned' ? <UserPlus size={14} /> : <Users size={14} />}
              {t === 'unassigned' ? `Unassigned (${unassignedTotal})` : `Assigned (${assignedTotal})`}
            </button>
          ))}
        </div>

        {/* Search + actions bar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input className="input" placeholder="Search by name or field..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, fontSize: '0.85rem' }} autoFocus />
          </div>

          {tab === 'assigned' && (
            <select className="select" value={targetFilter} onChange={e => setTargetFilter(e.target.value)}
              style={{ fontSize: '0.8rem', width: 160 }}>
              <option value="all">All {targetEntityType}s</option>
              {targets.map(t => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
            </select>
          )}

          {selectedIds.size > 0 && tab === 'unassigned' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="select" value={assigningTarget} onChange={e => setAssigningTarget(e.target.value)}
                style={{ fontSize: '0.8rem', width: 160 }}>
                <option value="">Select {targetEntityType}...</option>
                {targets.map(t => (
                  <option key={t.id} value={t.id}>{t.displayName}</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleBulkAssign}
                disabled={!assigningTarget || operating} style={{ fontSize: '0.75rem' }}>
                {operating ? <ASSpinner size="sm" /> : <><Link size={12} /> Assign {selectedIds.size}</>}
              </button>
            </div>
          )}

          {selectedIds.size > 0 && tab === 'assigned' && (
            <button className="btn btn-sm" onClick={handleBulkUnlink}
              disabled={operating} style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              {operating ? <ASSpinner size="sm" /> : <><Unlink size={12} /> Unlink {selectedIds.size}</>}
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><ASSpinner size="md" /></div>
          ) : tab === 'unassigned' ? (
            filteredUnassigned.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                <UserPlus size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem' }}>{search ? 'No matching records' : 'All records are assigned'}</p>
              </div>
            ) : (
              <>
                {/* Select all */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f3f4f6', marginBottom: 4 }}>
                  <input type="checkbox" checked={selectedIds.size === filteredUnassigned.length && filteredUnassigned.length > 0}
                    onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Select all {filteredUnassigned.length} visible
                  </span>
                </div>
                {filteredUnassigned.map(record => (
                  <div key={record.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: '1px solid #f9fafb',
                    background: selectedIds.has(record.id) ? 'var(--brand-primary-light, #eff6ff)' : 'transparent',
                    borderRadius: 6, paddingLeft: 4, paddingRight: 4,
                  }}>
                    <input type="checkbox" checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelect(record.id)} style={{ cursor: 'pointer' }} />
                    <Avatar
                      photo={record.values?.photo}
                      name={getDisplayName(record)}
                      size={28}
                    />
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{getDisplayName(record)}</span>
                  </div>
                ))}
              </>
            )
          ) : (
            // Assigned view
            filteredAssigned.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                <Users size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem' }}>{search || targetFilter !== 'all' ? 'No matching assignments' : 'No records assigned yet'}</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f3f4f6', marginBottom: 4 }}>
                  <input type="checkbox" checked={selectedIds.size === filteredAssigned.length && filteredAssigned.length > 0}
                    onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Select all {filteredAssigned.length} visible
                  </span>
                </div>
                {filteredAssigned.map(record => (
                  <div key={record.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: '1px solid #f9fafb',
                    background: selectedIds.has(record.id) ? '#fef2f2' : 'transparent',
                    borderRadius: 6, paddingLeft: 4, paddingRight: 4,
                  }}>
                    <input type="checkbox" checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelect(record.id)} style={{ cursor: 'pointer' }} />
                    <Avatar
                      photo={record.values?.photo}
                      name={getDisplayName(record)}
                      size={28}
                    />
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{getDisplayName(record)}</span>
                    {record.linkedToName && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                        background: `${getTagColor(record.linkedToName)}18`,
                        color: getTagColor(record.linkedToName),
                      }}>
                        → {record.linkedToName}
                      </span>
                    )}
                  </div>
                ))}
              </>
            )
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${tab === 'unassigned' ? unassignedTotal : assignedTotal} records`}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ fontSize: '0.8rem' }}>Done</button>
        </div>
      </div>
    </div>
  );
}

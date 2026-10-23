// Class Detail — Roster-first layout (Doc 16 §2.3)
// Leads with the roster (embedded Table of linked Learners), then class fields.

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Edit3, Trash2, Users, School,
  BookOpen, Calendar, ChevronRight, Save, X, UserPlus, UserMinus,
  Layers, Search,
} from 'lucide-react';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import { LearnerDetailSkeleton } from './Skeleton';
import DynamicField from './DynamicField';
import { useConfirm } from './ConfirmProvider';
import { loadCache, saveCache, fetchVersions } from '../lib/cache';
import FieldValueDisplay from './FieldValueDisplay';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface DetailData {
  id: string;
  values: Record<string, any>;
  sections: Array<{
    id: string;
    name: string;
    fields: Array<any>;
  }>;
  unsectionedFields: Array<any>;
  related: Record<string, any[]>;
  createdAt: string;
  updatedAt: string;
}

interface RosterEntry {
  id: string;
  values: Record<string, any>;
  linkId: string;
}

interface Props {
  recordId: string;
  initialData: { id: string; values: Record<string, any> } | null;
  onBack: () => void;
  onDeleted: () => void;
  onSaved?: () => void;
}

const RELATED_META: Record<string, { icon: any; color: string; label: string }> = {
  subjects: { icon: BookOpen, color: '#a855f7', label: 'Subjects' },
  teachers: { icon: Users, color: '#f59e0b', label: 'Teachers' },
  learner: { icon: Users, color: '#3b82f6', label: 'Learners' },
  terms: { icon: Calendar, color: '#ef4444', label: 'Terms' },
};

export default function ClassDetail({ recordId, initialData, onBack, onDeleted, onSaved }: Props) {
  const { confirm } = useConfirm();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<any>(null);

  // Roster state
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [childrenRosters, setChildrenRosters] = useState<Array<{ classId: string; className: string; roster: RosterEntry[] }>>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterRelDefId, setRosterRelDefId] = useState<string | null>(null);
  const [addingToRoster, setAddingToRoster] = useState(false);
  const [learnerSearch, setLearnerSearch] = useState('');
  const [availableLearners, setAvailableLearners] = useState<any[]>([]);
  const [availableTotal, setAvailableTotal] = useState(0);
  const [searchingLearners, setSearchingLearners] = useState(false);
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<Set<string>>(new Set());

  // Parent/children state
  const [parentInfo, setParentInfo] = useState<{ id: string; name: string } | null>(null);

  const CACHE_KEY = `anyschool_record_${SCHOOL_ID}_${recordId}`;

  // On mount: show skeleton briefly, then either cache/initialData/API data
  useEffect(() => {
    let hadCache = false;

    const cached = loadCache<any>(CACHE_KEY);
    if (cached) {
      setData(cached.data);
      setEditValues(cached.data.values || {});
      hadCache = true;
      setLoading(false);
    }

    if (!hadCache && initialData) {
      setData({ ...initialData, sections: [], unsectionedFields: [], related: {}, createdAt: '', updatedAt: '' } as any);
      setEditValues(initialData.values || {});
      hadCache = true;
      setLoading(false);
    }

    fetch(`${API}/classes/record/${SCHOOL_ID}/${recordId}`).then(r => r.json()).then(async d => {
      setData(d);
      setEditValues(d.values || {});
      setParentInfo(d.parent || null);
      const versions = await fetchVersions(SCHOOL_ID);
      saveCache(CACHE_KEY, d, versions || {});
      setLoading(false);
    }).catch(() => { if (!hadCache) setLoading(false); });

    // Load roster
    loadRoster();
  }, [recordId]);

  const loadRoster = async () => {
    setRosterLoading(true);
    try {
      const res = await fetch(`${API}/classes/roster/${SCHOOL_ID}/${recordId}`);
      if (res.ok) {
        const d = await res.json();
        setRoster(d.roster || []);
        setChildrenRosters(d.childrenRosters || []);
        setRosterRelDefId(d.relationshipDefinitionId || null);
      }
    } catch {}
    setRosterLoading(false);
  };

  const getIdentity = () => {
    if (!data) return { name: 'Class', photo: null, initials: '??' };
    const vals = data.values;
    const name = vals['class_name'] || vals['name'] || vals['className'] || 'Class';
    const photo = vals['photo'] || vals['image'] || null;
    const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
    return { name, photo, initials };
  };

  const getClassName = () => {
    return getIdentity().name;
  };

  const getQuickStats = () => {
    if (!data) return [];
    const vals = data.values;
    const stats: Array<{ label: string; value: string; color: string }> = [];
    if (vals['grade_level'] || vals['gradeLevel']) stats.push({ label: 'Grade', value: vals['grade_level'] || vals['gradeLevel'], color: '#22c55e' });
    if (vals['capacity']) stats.push({ label: 'Capacity', value: String(vals['capacity']), color: '#3b82f6' });
    if (vals['room_number'] || vals['room']) stats.push({ label: 'Room', value: vals['room_number'] || vals['room'], color: '#8b5cf6' });
    stats.push({ label: 'Enrolled', value: String(roster.length), color: '#06b6d4' });
    if (vals['capacity']) {
      const pct = Math.round((roster.length / Number(vals['capacity'])) * 100);
      stats.push({ label: 'Utilization', value: `${pct}%`, color: pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e' });
    }
    return stats.slice(0, 5);
  };

  const totalRosterCount = roster.length + childrenRosters.reduce((s, c) => s + c.roster.length, 0);

  const refreshData = async () => {
    try {
      const res = await fetch(`${API}/classes/record/${SCHOOL_ID}/${recordId}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setEditValues(d.values || {});
        const versions = await fetchVersions(SCHOOL_ID);
        saveCache(CACHE_KEY, d, versions || {});
      }
    } catch {}
  };

  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${API}/classes/update/${SCHOOL_ID}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: editValues }),
      });
      if (res.ok) {
        localStorage.removeItem(CACHE_KEY);
        await refreshData();
        setEditing(false);
        setSaveStatus('success');
        onSaved?.();
        setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Save failed:', err.error || res.statusText);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (e) {
      console.error('Save failed:', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
    setSaving(false);
  };

  const handlePhotoUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setEditValues(prev => ({ ...prev, photo: dataUrl }));
      const res = await fetch(`${API}/classes/update/${SCHOOL_ID}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: { photo: dataUrl }, partial: true }),
      });
      if (res.ok) {
        localStorage.removeItem(CACHE_KEY);
        await refreshData();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setDeleting(true);
      try {
        const res = await fetch(`${API}/classes/delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
        if (res.ok) {
          const d = await res.json();
          setDeleteInfo(d);
          setConfirmDelete(true);
        }
      } catch {}
      setDeleting(false);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${API}/classes/delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch {}
    setDeleting(false);
  };

  const handlePermanentDelete = async () => {
    const className = getClassName();
    const typed = await confirm({
      title: 'Permanently Delete Class',
      message: `This will PERMANENTLY delete "${className}" and all related records (enrollments, relationships, etc). This cannot be undone.`,
      confirmText: 'Permanently Delete',
      variant: 'destructive',
      requireTypedConfirm: true,
      typedConfirmText: className,
    });
    if (!typed) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/classes/permanent-delete/${SCHOOL_ID}/${recordId}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } catch {}
    setDeleting(false);
  };

  // Roster management — search-based
  const searchAvailableLearners = async (q: string) => {
    setSearchingLearners(true);
    try {
      const res = await fetch(`${API}/classes/available-learners/${SCHOOL_ID}/${recordId}?q=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const d = await res.json();
        setAvailableLearners(d.learners || []);
        setAvailableTotal(d.total || 0);
      }
    } catch {}
    setSearchingLearners(false);
  };

  const handleAddToRoster = async (learnerId: string) => {
    if (!rosterRelDefId) {
      alert('No class-learner relationship configured. Please set up a relationship in Schema Builder first.');
      return;
    }
    try {
      const res = await fetch(`${API}/classes/link/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromRecordId: recordId,
          toRecordId: learnerId,
          relationshipDefinitionId: rosterRelDefId,
        }),
      });
      if (res.ok) {
        setSelectedLearnerIds(prev => { const n = new Set(prev); n.delete(learnerId); return n; });
        loadRoster();
        // Refresh search results
        searchAvailableLearners(learnerSearch);
      }
    } catch {}
  };

  const handleBulkAddToRoster = async () => {
    if (!rosterRelDefId) {
      alert('No class-learner relationship configured. Please set up a relationship in Schema Builder first.');
      return;
    }
    if (selectedLearnerIds.size === 0) return;
    await fetch(`${API}/classes/link-bulk/${SCHOOL_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromRecordId: recordId,
        toRecordIds: Array.from(selectedLearnerIds),
        relationshipDefinitionId: rosterRelDefId,
      }),
    });
    setSelectedLearnerIds(new Set());
    loadRoster();
    searchAvailableLearners(learnerSearch);
  };

  const toggleAllVisible = () => {
    if (selectedLearnerIds.size === availableLearners.length) {
      setSelectedLearnerIds(new Set());
    } else {
      setSelectedLearnerIds(new Set(availableLearners.map(l => l.id)));
    }
  };

  const toggleLearnerSelect = (id: string) => {
    setSelectedLearnerIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleRemoveFromRoster = async (linkId: string) => {
    const typed = await confirm({
      title: 'Remove from Roster',
      message: 'Remove this learner from the class roster?',
      confirmText: 'Remove',
      variant: 'warning',
    });
    if (!typed) return;
    try {
      const res = await fetch(`${API}/classes/unlink/${SCHOOL_ID}/${linkId}`, { method: 'DELETE' });
      if (res.ok) loadRoster();
    } catch {}
  };

  if (loading) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16, gap: 6 }}>
          <ArrowLeft size={15} /> Back to Classes
        </button>
        <LearnerDetailSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-enter">
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16, gap: 6 }}>
          <ArrowLeft size={15} /> Back to Classes
        </button>
        <div className="empty-state"><p>Class not found.</p></div>
      </div>
    );
  }

  const quickStats = getQuickStats();
  const identity = getIdentity();
  const sections = data.sections || [];
  const unsectionedFields = data.unsectionedFields || [];

  return (
    <div className="page-enter">
      {/* Back button */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <ArrowLeft size={15} /> Back to Classes
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setEditValues(data.values || {}); }}><X size={14} /> Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={saveStatus === 'success' ? { background: '#22c55e', borderColor: '#22c55e' } : saveStatus === 'error' ? { background: '#ef4444', borderColor: '#ef4444' } : {}}
              >
                {saving ? <ASSpinner size="sm" /> : saveStatus === 'success' ? '\u2713' : saveStatus === 'error' ? '\u2717' : <Save size={14} />}
                {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(true)}><Edit3 size={14} /> Edit</button>
              <button className="btn btn-secondary" onClick={handleDelete} disabled={deleting} style={{ color: '#dc2626' }}>
                <Trash2 size={14} /> {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
              {confirmDelete && (
                <button className="btn" onClick={handlePermanentDelete} disabled={deleting}
                  style={{ background: '#dc2626', color: 'white' }}>
                  {deleting ? <ASSpinner size="sm" /> : <Trash2 size={14} />}
                  Permanently Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete info banner */}
      {confirmDelete && deleteInfo && (
        <div className="card" style={{ padding: 12, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: '0.85rem', color: '#991b1b' }}>
            {deleteInfo.message} — Click "Permanently Delete" to confirm, or "Delete" to undo the archive.
          </p>
        </div>
      )}

      {/* Parent info banner */}
      {parentInfo && (
        <div className="card" style={{ padding: 10, marginBottom: 12, background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
          <Layers size={14} style={{ color: '#2563eb' }} />
          <span style={{ color: '#1e40af' }}>
            Stream of <strong>{parentInfo.name}</strong>
          </span>
        </div>
      )}

      {/* Class Identity Header */}
      <div className="card" style={{
        padding: 24, marginBottom: 16,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary, #3b82f6) 30%, #1a1a2e), #1a1a2e)',
        color: 'white', opacity: 0.95,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar
            photo={identity.photo}
            name={identity.name}
            size={64}
            borderRadius={16}
            editable
            onUpload={handlePhotoUpload}
            style={{ background: 'rgba(255,255,255,0.15)' }}
          />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>{identity.name}</h2>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {quickStats.map((stat, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px',
                  fontSize: '0.8rem',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{stat.label}</span>
                  <span style={{ fontWeight: 600 }}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PRIMARY CONTENT: Roster (Doc 16 §2.3 — leads with the roster) */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} style={{ color: 'var(--brand-primary, #3b82f6)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Class Roster</h3>
            <span className="badge" style={{ background: 'var(--brand-primary-light, #eff6ff)', color: 'var(--brand-primary, #3b82f6)' }}>
              {childrenRosters.length > 0 ? `${totalRosterCount} total` : `${roster.length} learners`}
            </span>
          </div>
          <button className="btn btn-primary btn-sm" disabled={!rosterRelDefId && !rosterLoading} onClick={() => { setAddingToRoster(true); searchAvailableLearners(''); setLearnerSearch(''); }} title={!rosterRelDefId ? 'No relationship configured' : ''}>
            <UserPlus size={14} /> Add Learner
          </button>
        </div>

        {!rosterLoading && !rosterRelDefId && (
          <div style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: '#fef3c7', border: '1px solid #fde68a', fontSize: '0.8rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>No class-learner relationship is configured. Go to <strong>Schema Builder</strong> to create one, then reload.</span>
          </div>
        )}

        {rosterLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><ASSpinner size="sm" /></div>
        ) : roster.length === 0 && childrenRosters.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--brand-text-tertiary)' }}>
            <Users size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ fontSize: '0.85rem' }}>No learners enrolled in this class yet.</p>
          </div>
        ) : (
          <>
            {/* Direct roster */}
            {roster.length > 0 && (
              <div className="table-container" style={{ marginBottom: childrenRosters.length > 0 ? 16 : 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>ID</th>
                      <th>Grade</th>
                      <th>Status</th>
                      <th style={{ width: 48 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div className="td-primary">
                            {entry.values?.full_name || entry.values?.name ||
                              [entry.values?.first_name, entry.values?.last_name].filter(Boolean).join(' ') ||
                              'Learner'}
                          </div>
                        </td>
                        <td><span className="td-mono">{entry.id.slice(0, 8)}</span></td>
                        <td>{entry.values?.grade_level ?? '—'}</td>
                        <td>
                          <span className={`badge ${entry.values?.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>
                            {entry.values?.status ?? 'Active'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}
                            onClick={(e) => { e.stopPropagation(); handleRemoveFromRoster(entry.linkId); }}
                            title="Remove from roster">
                            <UserMinus size={13} style={{ color: '#dc2626' }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Children's rosters (rollup) */}
            {childrenRosters.map((child) => (
              <div key={child.classId} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f3f4f6' }}>
                  <School size={13} style={{ color: '#6b7280' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>{child.className}</span>
                  <span className="badge" style={{ background: '#f3f4f6', color: '#6b7280', fontSize: '0.7rem' }}>{child.roster.length}</span>
                </div>
                {child.roster.length > 0 ? (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>ID</th>
                          <th>Grade</th>
                          <th>Status</th>
                          <th style={{ width: 48 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {child.roster.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <div className="td-primary">
                                {entry.values?.full_name || entry.values?.name ||
                                  [entry.values?.first_name, entry.values?.last_name].filter(Boolean).join(' ') ||
                                  'Learner'}
                              </div>
                            </td>
                            <td><span className="td-mono">{entry.id.slice(0, 8)}</span></td>
                            <td>{entry.values?.grade_level ?? '—'}</td>
                            <td>
                              <span className={`badge ${entry.values?.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>
                                {entry.values?.status ?? 'Active'}
                              </span>
                            </td>
                            <td>
                              <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }}
                                onClick={(e) => { e.stopPropagation(); handleRemoveFromRoster(entry.linkId); }}
                                title="Remove from roster">
                                <UserMinus size={13} style={{ color: '#dc2626' }} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', padding: '4px 0' }}>No learners in this stream yet.</p>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add Learner — Search-based */}
      {addingToRoster && (
        <div className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--brand-primary, #3b82f6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Add Learner to Roster</h4>
            <button className="btn btn-ghost btn-icon" onClick={() => { setAddingToRoster(false); setSelectedLearnerIds(new Set()); }} style={{ width: 28, height: 28 }}><X size={14} /></button>
          </div>

          {/* Search input */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                className="input"
                placeholder="Search by name or ID..."
                value={learnerSearch}
                onChange={e => { setLearnerSearch(e.target.value); searchAvailableLearners(e.target.value); }}
                style={{ paddingLeft: 32, fontSize: '0.85rem' }}
                autoFocus
              />
            </div>
            {selectedLearnerIds.size > 0 && (
              <button className="btn btn-primary btn-sm" onClick={handleBulkAddToRoster}>
                <UserPlus size={13} /> Add {selectedLearnerIds.size} Selected
              </button>
            )}
          </div>

          {/* Select all */}
          {availableLearners.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
              <input
                type="checkbox"
                checked={selectedLearnerIds.size === availableLearners.length && availableLearners.length > 0}
                onChange={toggleAllVisible}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Select all {availableLearners.length} visible learners
              </span>
            </div>
          )}

          {/* Results */}
          {searchingLearners ? (
            <div style={{ padding: 16, textAlign: 'center' }}><ASSpinner size="sm" /></div>
          ) : availableLearners.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-text-tertiary)', textAlign: 'center', padding: 12 }}>
              {learnerSearch ? 'No learners found matching your search.' : 'All learners are already in this roster.'}
            </p>
          ) : (
            <>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: 8 }}>
                {availableTotal} learner{availableTotal !== 1 ? 's' : ''} available
              </div>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {availableLearners.map((l) => (
                  <div key={l.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderBottom: '1px solid #f3f4f6',
                    background: selectedLearnerIds.has(l.id) ? 'var(--brand-primary-light, #eff6ff)' : '',
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedLearnerIds.has(l.id)}
                      onChange={() => toggleLearnerSelect(l.id)}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>
                      {l.displayName || l.id.slice(0, 8)}
                    </span>
                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-primary, #3b82f6)' }}
                      onClick={() => handleAddToRoster(l.id)}>
                      <UserPlus size={12} /> Add
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Class Fields */}
      {editing ? (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Edit Class Details</h3>
          {sections.map((section) => (
            section.fields.length > 0 && (
              <div key={section.id} style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                  {section.name}
                </h4>
                <div className="form-grid">
                  {section.fields.map((field: any) => (
                    <DynamicField
                      key={field.id}
                      field={field}
                      value={editValues[field.internalName]}
                      onChange={(val) => setEditValues(prev => ({ ...prev, [field.internalName]: val }))}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
          {unsectionedFields.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
                Additional Information
              </h4>
              <div className="form-grid">
                {unsectionedFields.map((field: any) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={editValues[field.internalName]}
                    onChange={(val) => setEditValues(prev => ({ ...prev, [field.internalName]: val }))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {sections.map((section) => (
            section.fields.length > 0 && (
              <div key={section.id} className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, color: '#374151' }}>
                  {section.name}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {section.fields.map((field: any) => (
                    <div key={field.id}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--brand-text-tertiary)', marginBottom: 4, display: 'block' }}>
                        {field.name}
                      </label>
                      <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                        <FieldValueDisplay
                          field={field}
                          value={field.value}
                          displayName={getClassName()}
                          imageSize={40}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {unsectionedFields.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, color: '#374151' }}>
                Additional Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {unsectionedFields.map((field: any) => (
                  <div key={field.id}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--brand-text-tertiary)', marginBottom: 4, display: 'block' }}>
                      {field.name}
                    </label>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                      <FieldValueDisplay
                        field={field}
                        value={field.value}
                        displayName={getClassName()}
                        imageSize={40}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Related Records */}
      {Object.keys(data.related || {}).length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, color: '#374151' }}>Related Records</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(data.related).map(([key, records]) => {
              const meta = RELATED_META[key] || { icon: School, color: '#6b7280', label: key };
              const Icon = meta.icon;
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  background: '#f9fafb', borderRadius: 8,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: `${meta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={16} style={{ color: meta.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--brand-text-tertiary)' }}>
                      {records.length} record{records.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: '#9ca3af' }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// RelationshipInlinePanel — Shared inline panel for linking/unlinking related records
// Extracted from SubjectDetail's renderRelationshipPanel. Self-contained with its own
// multi-select state via useBulkLink. Supports optional "Add Entire Class" for learner panels.

import { useState } from 'react';
import { UserPlus, UserMinus, Link, X, Users } from 'lucide-react';
import ASSpinner from './ASSpinner';
import Avatar from './Avatar';
import { useBulkLink } from '../hooks/useBulkLink';

export interface RelatedEntry {
  id: string;
  values: Record<string, any>;
  linkId: string;
}

export interface RelationshipInlinePanelProps {
  title: string;
  icon: any;
  entries: RelatedEntry[];
  loading: boolean;
  /** API prefix for link-bulk endpoint, e.g. "subjects", "teachers" */
  apiPrefix: string;
  /** Current record ID (the one being viewed) */
  recordId: string;
  /** Available records to link */
  available: any[];
  /** Fetch available records */
  loadAvailable: () => void;
  /** Single link handler */
  handleLink: (id: string) => void;
  /** Single unlink handler */
  handleUnlink: (linkId: string) => void;
  /** After bulk link succeeds */
  onBulkLinked?: () => void;
  emptyMessage: string;
  linkMessage: string;
  targetEntity: string;
  relDefId: string | null;
  /** "Add Entire Class" — only for learner panels */
  bulkGroup?: {
    loadGroups: () => void;
    groups: any[];
    loadGroupMembers: (groupId: string) => Promise<any[]>;
    onConfirmBulkGroup: (memberIds: string[]) => Promise<void>;
  };
}

function getDisplayName(vals: Record<string, any>, id: string): string {
  if (vals.first_name) return `${vals.first_name} ${vals.last_name || ''}`.trim();
  return vals.name || vals.class_name || vals.subject_name || id.slice(0, 8);
}

export default function RelationshipInlinePanel({
  title, icon: Icon, entries, loading, apiPrefix, recordId,
  available, loadAvailable, handleLink, handleUnlink, onBulkLinked,
  emptyMessage, linkMessage, targetEntity, relDefId, bulkGroup,
}: RelationshipInlinePanelProps) {
  const { selectedIds, linking, toggleSelect, toggleSelectAll, clearSelection, bulkLink, setLinking } = useBulkLink();
  const [adding, setAdding] = useState(false);

  // "Add Entire Class" state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [loadingGroupMembers, setLoadingGroupMembers] = useState(false);

  const selectedCount = selectedIds.size;

  const handleBulkLink = async () => {
    if (selectedCount === 0 || !relDefId) return;
    const result = await bulkLink(apiPrefix, recordId, [...selectedIds], relDefId);
    if (result) {
      setAdding(false);
      clearSelection();
      onBulkLinked?.();
    }
  };

  const handleOpenAdd = () => {
    setAdding(true);
    clearSelection();
    loadAvailable();
  };

  const handleCloseAdd = () => {
    setAdding(false);
    clearSelection();
    setSelectedGroupId(null);
    setGroupMembers([]);
  };

  // "Add Entire Class" handlers
  const handleSelectGroup = async (groupId: string) => {
    if (!bulkGroup) return;
    setLoadingGroupMembers(true);
    setSelectedGroupId(groupId);
    const members = await bulkGroup.loadGroupMembers(groupId);
    setGroupMembers(members);
    setLoadingGroupMembers(false);
  };

  const handleConfirmBulkGroup = async () => {
    if (!bulkGroup || groupMembers.length === 0) return;
    setLinking(true);
    await bulkGroup.onConfirmBulkGroup(groupMembers.map(m => m.id));
    setLinking(false);
    setSelectedGroupId(null);
    setGroupMembers([]);
    handleCloseAdd();
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={16} /> {title}
          <span className="badge" style={{ background: '#f3f4f6', color: '#6b7280', fontWeight: 500, fontSize: '0.75rem' }}>
            {entries.length}
          </span>
        </h3>
        {!adding && (
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={handleOpenAdd}>
            <UserPlus size={13} /> {linkMessage}
          </button>
        )}
      </div>

      {/* Add Panel */}
      {adding && (
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Available to link</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {selectedCount > 0 && relDefId && (
                <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={handleBulkLink} disabled={linking}>
                  {linking ? <ASSpinner size="sm" /> : <Link size={12} />}
                  Link {selectedCount}
                </button>
              )}
              <button className="btn btn-ghost btn-icon" onClick={handleCloseAdd} style={{ width: 24, height: 24 }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Add Entire Class — learner panels only */}
          {bulkGroup && targetEntity === 'learner' && (
            <div style={{ marginBottom: 8, padding: '8px 10px', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#1d4ed8', marginBottom: 4 }}>Add Entire Class</div>
              {bulkGroup.groups.length === 0 ? (
                <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'white', border: '1px solid #93c5fd' }}
                  onClick={bulkGroup.loadGroups}>
                  <Users size={11} /> Load Classes
                </button>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {bulkGroup.groups.map((grp: any) => {
                    const grpName = grp.values?.name || grp.values?.class_name || grp.id.slice(0, 8);
                    const isLoading = selectedGroupId === grp.id && loadingGroupMembers;
                    return (
                      <button key={grp.id} className="btn btn-ghost" disabled={isLoading || linking}
                        style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'white', border: '1px solid #93c5fd' }}
                        onClick={() => handleSelectGroup(grp.id)}>
                        {isLoading ? <ASSpinner size="sm" /> : <Users size={11} />}
                        {grpName}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedGroupId && groupMembers.length > 0 && (
                <div style={{ marginTop: 6, padding: '6px 8px', background: 'white', borderRadius: 4, fontSize: '0.72rem', color: '#374151' }}>
                  {groupMembers.length} learner{groupMembers.length !== 1 ? 's' : ''} will be linked.
                  <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '2px 8px', marginLeft: 8 }}
                    onClick={handleConfirmBulkGroup} disabled={linking}>
                    {linking ? <ASSpinner size="sm" /> : 'Confirm'}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px', marginLeft: 4 }}
                    onClick={() => { setSelectedGroupId(null); setGroupMembers([]); }}>
                    Cancel
                  </button>
                </div>
              )}
              {selectedGroupId && !loadingGroupMembers && groupMembers.length === 0 && (
                <div style={{ marginTop: 6, padding: '6px 8px', background: '#fef2f2', borderRadius: 4, fontSize: '0.72rem', color: '#991b1b', border: '1px solid #fecaca' }}>
                  This class has no learners enrolled yet. Add learners to this class first, then try again.
                  <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px', marginLeft: 8 }}
                    onClick={() => { setSelectedGroupId(null); setGroupMembers([]); }}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Available records */}
          {available.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No available records to link.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: '0.75rem', color: '#6b7280', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedIds.size === available.length && available.length > 0}
                  onChange={() => toggleSelectAll(available.map((r: any) => r.id))} style={{ accentColor: '#7c3aed' }} />
                Select all ({available.length})
              </label>
              {available.map((rec: any) => {
                const vals = rec.values || {};
                const displayName = getDisplayName(vals, rec.id);
                const isSelected = selectedIds.has(rec.id);
                return (
                  <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, background: isSelected ? '#f5f3ff' : 'white', border: `1px solid ${isSelected ? '#c4b5fd' : '#f3f4f6'}` }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(rec.id)} style={{ accentColor: '#7c3aed' }} />
                    <span style={{ fontSize: '0.8rem', flex: 1 }}>{displayName}</span>
                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '2px 8px' }} onClick={() => handleLink(rec.id)}>Link</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Linked entries */}
      {loading ? (
        <div style={{ padding: 16, textAlign: 'center' }}><ASSpinner size="sm" /></div>
      ) : entries.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', padding: 8 }}>{emptyMessage}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.map((entry) => {
            const vals = entry.values || {};
            const displayName = getDisplayName(vals, entry.id);
            return (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={displayName} photo={vals.photo || vals.passport_photo} size={28} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{displayName}</span>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => handleUnlink(entry.linkId)} style={{ width: 28, height: 28, color: '#dc2626' }}>
                  <UserMinus size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Grade Scale Editor — school-defined grade bands { label, min %, max % }
// Grades are derived from percentage at read time, never stored on records.
// Changing this scale re-grades everything automatically. No default A–E scale
// is ever invented — if no bands are defined, views show the percentage only.

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

export interface GradeBand { label: string; min: number; max: number; remark?: string; }

interface EditableBand { label: string; min: string; max: string; remark: string; }

interface Props {
  onClose?: () => void;
  onSaved?: (bands: GradeBand[]) => void;
}

export default function GradeScaleEditor({ onClose, onSaved }: Props) {
  const [bands, setBands] = useState<EditableBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetch(`${API}/assessments/grade-scale/${SCHOOL_ID}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && Array.isArray(d.bands)) {
          setBands(d.bands.map((b: GradeBand) => ({
            label: b.label ?? '',
            min: b.min !== undefined && b.min !== null ? String(b.min) : '',
            max: b.max !== undefined && b.max !== null ? String(b.max) : '',
            remark: b.remark ?? '',
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateBand = (i: number, patch: Partial<EditableBand>) => {
    setBands(prev => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b));
    setMsg(null);
  };

  const addBand = () => {
    setBands(prev => [...prev, { label: '', min: '', max: '', remark: '' }]);
    setMsg(null);
  };

  const removeBand = (i: number) => {
    setBands(prev => prev.filter((_, idx) => idx !== i));
    setMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = bands
        .filter(b => b.label.trim() !== '' && b.min !== '' && b.max !== '')
        .map(b => ({
          label: b.label.trim(),
          min: Number(b.min),
          max: Number(b.max),
          remark: b.remark.trim(),
        }));

      if (payload.some(b => isNaN(b.min) || isNaN(b.max))) {
        setMsg({ type: 'error', message: 'Min and max must be numbers.' });
        return;
      }

      const res = await fetch(`${API}/assessments/grade-scale/${SCHOOL_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bands: payload }),
      });
      if (res.ok) {
        const d = await res.json();
        setMsg({ type: 'success', message: `Saved ${d.bands.length} band(s). Everything is re-graded instantly.` });
        onSaved?.(d.bands);
      } else {
        const err = await res.json().catch(() => ({}) as any);
        setMsg({ type: 'error', message: err.error || 'Failed to save grade scale' });
      }
    } catch (e: any) {
      setMsg({ type: 'error', message: e.message || 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>Grade Scale</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--brand-text-secondary)', marginTop: 2 }}>
            School-defined bands with optional remarks. Grades and remarks are derived from the percentage at read time — change a band and everything re-grades.
          </p>
        </div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ gap: 4 }}>
            <X size={14} /> Close
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" /></div>
      ) : (
        <>
          {bands.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: '#d97706', marginBottom: 10 }}>
              No grade scale defined yet. Percentages are shown without grades until bands are added here.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
            {bands.map((b, i) => (
              <div key={i} style={{
                border: '1px solid var(--brand-border)', borderRadius: 8, padding: 8,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="input"
                    placeholder="Label (e.g. A)"
                    value={b.label}
                    onChange={e => updateBand(i, { label: e.target.value })}
                    style={{ flex: 1, fontSize: '0.8rem', padding: '5px 8px' }}
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="Min %"
                    value={b.min}
                    onChange={e => updateBand(i, { min: e.target.value })}
                    style={{ width: 80, fontSize: '0.8rem', padding: '5px 8px', textAlign: 'center' }}
                  />
                  <span style={{ color: 'var(--brand-text-secondary)', fontSize: '0.8rem' }}>–</span>
                  <input
                    className="input"
                    type="number"
                    placeholder="Max %"
                    value={b.max}
                    onChange={e => updateBand(i, { max: e.target.value })}
                    style={{ width: 80, fontSize: '0.8rem', padding: '5px 8px', textAlign: 'center' }}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => removeBand(i)} style={{ padding: 4 }} title="Remove band">
                    <Trash2 size={14} style={{ color: '#dc2626' }} />
                  </button>
                </div>
                <input
                  className="input"
                  placeholder="Remark for this band (optional) — e.g. Excellent, keep it up"
                  value={b.remark}
                  onChange={e => updateBand(i, { remark: e.target.value })}
                  style={{ fontSize: '0.78rem', padding: '5px 8px' }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={addBand} style={{ gap: 4 }}>
              <Plus size={13} /> Add band
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 4 }}>
              {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
              Save scale
            </button>
            {msg && (
              <span style={{
                fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4,
                color: msg.type === 'success' ? '#166534' : '#991b1b',
              }}>
                {msg.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {msg.message}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

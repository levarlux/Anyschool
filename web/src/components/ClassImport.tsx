// Class Import — CSV upload, column mapping, preview, import
// Adapted from LearnerImport for the class entity type

import { useState, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, ArrowLeft, ArrowRight,
  Check, X, AlertTriangle, Download,
} from 'lucide-react';

import ASSpinner from './ASSpinner';

const API = '/api';
const SCHOOL_ID = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

interface Props {
  fields: any[];
  onImported: () => void;
  onCancel: () => void;
}

type Step = 'upload' | 'map' | 'preview' | 'done';

interface ParsedRow {
  [header: string]: string;
}

export default function ClassImport({ fields, onImported, onCancel }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = useCallback((text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return;

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    setCsvHeaders(headers);

    const rows: ParsedRow[] = [];
    for (let i = 1; i < Math.min(lines.length, 200); i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: ParsedRow = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
    setCsvRows(rows);

    const autoMap: Record<string, string> = {};
    for (const header of headers) {
      const norm = header.toLowerCase().replace(/[^a-z]/g, '');
      for (const field of fields) {
        const fieldNorm = field.internalName.toLowerCase().replace(/[^a-z]/g, '');
        if (norm.includes(fieldNorm) || fieldNorm.includes(norm)) {
          autoMap[header] = field.internalName;
          break;
        }
      }
    }
    setColumnMapping(autoMap);
    setStep('map');
  }, [fields]);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  }, [parseCSV]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePreview = async () => {
    setImporting(true);
    try {
      const res = await fetch(`${API}/classes/import/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: csvRows, columnMapping, dryRun: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreview(data);
        setStep('preview');
      }
    } catch {}
    setImporting(false);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch(`${API}/classes/import/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: csvRows, columnMapping, dryRun: false }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setStep('done');
      }
    } catch {}
    setImporting(false);
  };

  const mappedCount = Object.values(columnMapping).filter(Boolean).length;

  // Step 1: Upload
  if (step === 'upload') {
    return (
      <div className="page-enter">
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ gap: 6 }}>
            <ArrowLeft size={15} /> Back to Classes
          </button>
        </div>
        <div className="card" style={{ padding: 40, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div className="empty-state-icon" style={{ background: '#eff6ff', margin: '0 auto 16px' }}>
            <FileSpreadsheet size={28} style={{ color: '#3b82f6' }} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 8 }}>Import Class Data</h3>
          <p className="text-muted" style={{ marginBottom: 24, fontSize: '0.85rem' }}>
            Upload a CSV file with class data. We'll help you map columns to fields.
          </p>

          <div
            className="dropzone"
            style={{ padding: 40, cursor: 'pointer', border: '2px dashed var(--brand-border)', borderRadius: 'var(--brand-radius-lg)' }}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={24} style={{ color: '#9ca3af', marginBottom: 8 }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--brand-text-secondary)' }}>
              Drag and drop a CSV file here, or click to browse
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--brand-text-tertiary)', marginTop: 4 }}>
              Supports .csv files up to 5MB
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => {
            const headers = fields.slice(0, 6).map(f => f.name).join(',');
            const sample = `${headers}\nGrade 1A,1,Room 101,40`;
            const blob = new Blob([sample], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'class-import-template.csv'; a.click();
          }}>
            <Download size={14} /> Download Template
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Map Columns
  if (step === 'map') {
    return (
      <div className="page-enter">
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => setStep('upload')} style={{ gap: 6 }}>
            <ArrowLeft size={15} /> Back
          </button>
        </div>
        <div className="card" style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Map Columns</h3>
          <p className="text-muted" style={{ marginBottom: 20, fontSize: '0.85rem' }}>
            Match each CSV column to a Class field. Found <strong>{csvRows.length}</strong> rows in <strong>{fileName}</strong>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {csvHeaders.map(header => (
              <div key={header} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, color: 'var(--brand-text)' }}>
                  {header}
                </div>
                <ArrowRight size={14} style={{ color: '#9ca3af' }} />
                <select
                  className="select"
                  style={{ flex: 2 }}
                  value={columnMapping[header] || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                >
                  <option value="">— Skip this column —</option>
                  {fields.map(f => (
                    <option key={f.id} value={f.internalName}>{f.name} ({f.dataType})</option>
                  ))}
                </select>
                <div style={{ width: 32, textAlign: 'center' }}>
                  {columnMapping[header] ? (
                    <Check size={14} style={{ color: '#22c55e' }} />
                  ) : (
                    <X size={14} style={{ color: '#d1d5db' }} />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--brand-text-secondary)' }}>
              {mappedCount} of {csvHeaders.length} columns mapped
            </span>
            <button
              className="btn btn-primary"
              onClick={handlePreview}
              disabled={mappedCount === 0 || importing}
            >
              {importing ? <ASSpinner size="sm" /> : <ArrowRight size={14} />}
              Preview Import
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Preview
  if (step === 'preview' && preview) {
    return (
      <div className="page-enter">
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => setStep('map')} style={{ gap: 6 }}>
            <ArrowLeft size={15} /> Back
          </button>
        </div>
        <div className="card" style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>Import Preview</h3>
          <p className="text-muted" style={{ marginBottom: 20, fontSize: '0.85rem' }}>
            Review the import before confirming.
          </p>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
            <div className="kpi-card">
              <div>
                <div className="kpi-value" style={{ color: '#3b82f6' }}>{preview.summary.new}</div>
                <div className="kpi-label">New Records</div>
              </div>
            </div>
            <div className="kpi-card">
              <div>
                <div className="kpi-value" style={{ color: '#f59e0b' }}>{preview.summary.update}</div>
                <div className="kpi-label">Updates</div>
              </div>
            </div>
            <div className="kpi-card">
              <div>
                <div className="kpi-value" style={{ color: '#ef4444' }}>{preview.summary.errors}</div>
                <div className="kpi-label">Errors</div>
              </div>
            </div>
          </div>

          {preview.errorMessages?.length > 0 && (
            <div className="card" style={{ padding: 12, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={14} style={{ color: '#991b1b' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b' }}>Import Errors</span>
              </div>
              {preview.errorMessages.map((err: string, i: number) => (
                <p key={i} style={{ fontSize: '0.75rem', color: '#991b1b', marginBottom: 2 }}>{err}</p>
              ))}
            </div>
          )}

          <div className="table-container" style={{ marginBottom: 20 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  {Object.entries(columnMapping).filter(([,v]) => v).map(([header]) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.slice(0, 10).map((item: any) => (
                  <tr key={item.row}>
                    <td>{item.row}</td>
                    <td>
                      <span className={`badge ${item.status === 'new' ? 'badge-success' : item.status === 'update' ? 'badge-warning' : 'badge-error'}`}>
                        {item.status}
                      </span>
                    </td>
                    {Object.entries(columnMapping).filter(([,v]) => v).map(([header, fieldName]) => (
                      <td key={header}>{item.values[fieldName as string] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep('map')}>Back</button>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? <ASSpinner size="sm" /> : <Upload size={14} />}
              Import {preview.summary.new + preview.summary.update} Records
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Done
  if (step === 'done' && result) {
    return (
      <div className="page-enter">
        <div className="card" style={{ padding: 40, maxWidth: 500, margin: '40px auto', textAlign: 'center' }}>
          <div className="empty-state-icon" style={{ background: '#f0fdf4', margin: '0 auto 16px' }}>
            <Check size={28} style={{ color: '#22c55e' }} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 8 }}>Import Complete</h3>
          <p className="text-muted" style={{ marginBottom: 20, fontSize: '0.85rem' }}>
            Successfully imported <strong>{result.summary.imported}</strong> class records.
            {result.summary.failed > 0 && <> <strong>{result.summary.failed}</strong> records failed.</>}
          </p>
          <button className="btn btn-primary" onClick={onImported}>
            Back to Classes
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// Subject Import — CSV/XLSX upload, column mapping, import (Doc 18)
// 4-step wizard: Upload → Map → Preview → Done

import { useState, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, ArrowLeft, ArrowRight,
  Check,
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

export default function SubjectImport({ fields, onImported, onCancel }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
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
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  }, [parseCSV]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const mapRow = (row: ParsedRow) => {
    const mapped: Record<string, any> = {};
    for (const [csvHeader, fieldName] of Object.entries(columnMapping)) {
      if (fieldName && row[csvHeader] !== undefined) {
        mapped[fieldName] = row[csvHeader];
      }
    }
    return mapped;
  };

  const handlePreview = () => {
    const mapped = csvRows.slice(0, 5).map(mapRow);
    setPreview(mapped);
    setStep('preview');
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');
    try {
      const mappedRecords = csvRows.map(mapRow);
      const res = await fetch(`${API}/subjects/import/${SCHOOL_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: mappedRecords }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setStep('done');
        onImported();
      } else {
        setError(data.error || 'Import failed');
      }
    } catch {
      setError('Network error \u2014 please try again');
    }
    setImporting(false);
  };

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={onCancel} style={{ gap: 6 }}>
          <ArrowLeft size={15} /> Back to Subjects
        </button>
      </div>

      <div className="card" style={{ padding: 24, maxWidth: 720 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 4 }}>Import Subjects</h2>
        <p className="text-muted" style={{ marginBottom: 24, fontSize: '0.85rem' }}>
          Upload a CSV file to import subjects in bulk.
        </p>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 600,
                background: step === s ? '#22c55e' : i < ['upload', 'map', 'preview', 'done'].indexOf(step) ? '#dcfce7' : '#f3f4f6',
                color: step === s ? 'white' : i < ['upload', 'map', 'preview', 'done'].indexOf(step) ? '#16a34a' : '#9ca3af',
              }}>
                {i < ['upload', 'map', 'preview', 'done'].indexOf(step) ? <Check size={12} /> : i + 1}
              </div>
              <span style={{ fontSize: '0.75rem', color: step === s ? '#16a34a' : '#9ca3af', textTransform: 'capitalize' }}>{s}</span>
              {i < 3 && <div style={{ width: 20, height: 1, background: '#e5e7eb', margin: '0 4px' }} />}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: 12, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
            <p style={{ fontSize: '0.85rem', color: '#991b1b' }}>{error}</p>
          </div>
        )}

        {/* Upload Step */}
        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            style={{
              border: '2px dashed #d1d5db', borderRadius: 12, padding: 40, textAlign: 'center',
              cursor: 'pointer', transition: 'border-color 0.2s',
            }}
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet size={32} style={{ color: '#9ca3af', marginBottom: 12 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: 4 }}>Drop a CSV file here or click to browse</p>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Supports .csv files up to 5MB</p>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        )}

        {/* Map Step */}
        {step === 'map' && (
          <div>
            <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>Map CSV columns to subject fields. File: <strong>{fileName}</strong> ({csvRows.length} rows)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {csvHeaders.map(header => (
                <div key={header} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{header}</span>
                  <ArrowRight size={14} style={{ color: '#9ca3af' }} />
                  <select className="select" style={{ flex: 2 }} value={columnMapping[header] || ''} onChange={(e) => setColumnMapping(prev => ({ ...prev, [header]: e.target.value }))}>
                    <option value="">-- Skip --</option>
                    {fields.filter(f => f.dataType !== 'file' && f.dataType !== 'relationship').map(f => (
                      <option key={f.id} value={f.internalName}>{f.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep('upload')}>Back</button>
              <button className="btn btn-primary" onClick={handlePreview}>Preview</button>
            </div>
          </div>
        )}

        {/* Preview Step */}
        {step === 'preview' && preview && (
          <div>
            <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>Preview (first 5 rows). {csvRows.length} total rows will be imported.</p>
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                      {Object.values(columnMapping).filter(Boolean).map((fieldName: string) => (
                        <th key={fieldName} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600 }}>{fieldName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row: Record<string, string>, i: number) => (
                    <tr key={i}>
                      {Object.values(columnMapping).filter(Boolean).map((fieldName: string) => (
                        <td key={fieldName} style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>{row[fieldName] || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep('map')}>Back</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? <ASSpinner size="sm" /> : <Upload size={14} />}
                {importing ? 'Importing...' : `Import ${csvRows.length} Subjects`}
              </button>
            </div>
          </div>
        )}

        {/* Done Step */}
        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check size={24} style={{ color: '#16a34a' }} />
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Import Complete</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 16 }}>
              {result.created} subject{result.created !== 1 ? 's' : ''} created successfully.
              {result.errors > 0 && ` ${result.errors} failed.`}
            </p>
            <button className="btn btn-primary" onClick={onCancel}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

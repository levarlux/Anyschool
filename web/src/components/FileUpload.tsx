import { useState, useRef } from 'react';
import { Upload, File, FileSpreadsheet, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';

const API = '/api';
const MAX_SIZE = 10 * 1024 * 1024;

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFileChange = async (f: File) => {
    setError('');
    setResult(null);
    if (f.size > MAX_SIZE) { setError('File too large. Maximum 10MB.'); return; }
    setFile(f);
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      const text = await f.text();
      const lines = text.split('\n').filter(l => l.trim());
      setPreview({ type: 'csv', headers: lines[0]?.split(',') || [], rows: lines.slice(1, 6), totalRows: lines.length - 1 });
    } else {
      setPreview({ type: ext, name: f.name, size: f.size });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFileChange(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const schoolId = localStorage.getItem('anyschool_current_school');
    try {
      const res = await fetch(`${API}/files/upload/${schoolId}`, { method: 'POST', body: formData });
      if (res.ok) { setResult(await res.json()); }
      else { setError((await res.json()).error || 'Upload failed'); }
    } catch { setError('Network error'); }
    setUploading(false);
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(''); };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.pdf')) return <FileText size={20} style={{ color: '#ef4444' }} />;
    if (name.endsWith('.csv')) return <FileSpreadsheet size={20} style={{ color: '#22c55e' }} />;
    return <File size={20} style={{ color: '#3b82f6' }} />;
  };

  return (
    <div className="page-enter">
      <div className="entity-header">
        <div className="entity-header-left">
          <div className="entity-icon-wrap" style={{ background: '#f59e0b12' }}>
            <Upload size={22} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h2>File Upload</h2>
            <p className="text-muted">Import data from CSV, Excel, or PDF files</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        {!file ? (
          <div
            className={`dropzone ${dragOver ? 'dragover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={e => e.target.files?.[0] && onFileChange(e.target.files[0])} hidden />
            <div className="dropzone-icon">
              <Upload size={32} />
            </div>
            <h3>Drop a file here or click to browse</h3>
            <p>Supports CSV, Excel, and PDF files up to 10MB</p>
            <div className="format-badges">
              <span className="format-badge">.csv</span>
              <span className="format-badge">.xlsx</span>
              <span className="format-badge">.pdf</span>
            </div>
          </div>
        ) : (
          <div className="file-preview-content">
            <div className="file-info-row">
              {getFileIcon(file.name)}
              <div className="file-meta">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={reset}>
                <X size={16} />
              </button>
            </div>

            {preview?.type === 'csv' && (
              <div className="csv-preview">
                <div className="section-header" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Preview ({preview.totalRows} rows)</span>
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead><tr>{preview.headers.map((h: string, i: number) => <th key={i}>{h.trim()}</th>)}</tr></thead>
                    <tbody>{preview.rows.map((r: string, i: number) => (
                      <tr key={i}>{r.split(',').map((c: string, j: number) => <td key={j}>{c.trim()}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={reset}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload & Process'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="upload-alert error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {result && (
          <div className="upload-alert success">
            <CheckCircle size={16} />
            {result.totalRows} rows parsed from {result.fileName} — {result.headers?.length || 0} columns detected
          </div>
        )}
      </div>
    </div>
  );
}

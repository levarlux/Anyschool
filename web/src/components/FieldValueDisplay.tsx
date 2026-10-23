// FieldValueDisplay — Reusable read-only rendering for any field value
// Used by detail views (LearnerDetail, TeacherDetail, ClassDetail) and any place
// that needs to render a field value as a final, non-editable display.
// Replaces ad-hoc inline ternaries so image fields, file fields, currency, etc.
// render consistently across the app — in the hero, sections, and additional info.

import Avatar from './Avatar';
import { getFieldDisplayStyle } from '../lib/fieldStyle';
import { FileText } from 'lucide-react';
import { MultiValueDropdown } from './DataTable';

function parseMultiValue(value: any): string[] | null {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map(v => String(v ?? ''));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(v => String(v ?? ''));
      } catch { /* fall through */ }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }
  }
  return null;
}

export interface FieldValueDisplayProps {
  /** Field metadata (dataType, internalName, fileSubtype, etc.) */
  field: {
    dataType: string;
    internalName?: string;
    fileSubtype?: string | null;
    validationRules?: any;
    name?: string;
  };
  /** The value to display (string, number, boolean, URL, etc.) */
  value: any;
  /** Display name to use for avatar initials / color hash (e.g. entity display name) */
  displayName?: string;
  /** Size of avatar in pixels for image fields (default 32) */
  imageSize?: number;
  /** Layout direction for image + label */
  layout?: 'inline' | 'stacked';
  /** Additional styles for the container */
  style?: React.CSSProperties;
}

function extractFileUrl(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.url === 'string') return value.url;
  return null;
}

function extractFileName(value: any): string {
  if (!value) return '';
  // If value is an object with a name property, use it
  if (typeof value === 'object' && typeof value.name === 'string' && value.name) return value.name;
  // Extract filename from URL
  const url = typeof value === 'string' ? value : value?.url;
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    const last = segments[segments.length - 1];
    // Decode URI and strip query params
    return decodeURIComponent(last).split('?')[0] || '';
  } catch {
    // Not a valid URL (e.g. data: URL) — return empty
    return '';
  }
}

export default function FieldValueDisplay({
  field,
  value,
  displayName,
  imageSize = 32,
  layout = 'inline',
  style,
}: FieldValueDisplayProps) {
  // File fields always render — image subtype shows avatar (photo or initials),
  // file subtype shows file icon (or dash if no value).
  if (field.dataType === 'file') {
    const subType = field.fileSubtype || field.validationRules?.fileSubtype || 'image';
    const fileUrl = extractFileUrl(value);
    const nameForAvatar = displayName || field.name || field.internalName || '';

    if (subType === 'image') {
      // Avatar with photo or initials — works whether URL or data URL
      return (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: layout === 'inline' ? 'flex-end' : 'flex-start',
            ...style,
          }}
        >
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', textDecoration: 'none' }}
              title="Open full image"
            >
              <Avatar photo={fileUrl} name={nameForAvatar} size={imageSize} borderRadius="50%" />
            </a>
          ) : (
            <Avatar photo={null} name={nameForAvatar} size={imageSize} borderRadius="50%" />
          )}
        </div>
      );
    }

    // File subtype — show file icon + filename (truncated with ellipsis)
    const fileName = extractFileName(value);
    return (
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          maxWidth: 240, ...style,
        }}
        title={fileName || 'File'}
      >
        {fileUrl ? (
          <>
            <FileText size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
            <span style={{
              fontSize: '0.8rem', color: '#374151',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {fileName || 'File'}
            </span>
          </>
        ) : (
          <span style={{ color: '#9ca3af' }}>—</span>
        )}
      </div>
    );
  }

  // Boolean
  if (field.dataType === 'boolean') {
    return (
      <span className={`badge ${value ? 'badge-success' : 'badge-secondary'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    );
  }

  // Currency — with KES prefix
  if (field.dataType === 'currency' || field.internalName?.includes('balance') || field.internalName?.includes('fee') || field.internalName?.includes('salary')) {
    const isAmount = Number(value) > 0;
    return (
      <span style={{ fontWeight: 600, color: isAmount ? '#ef4444' : '#22c55e' }}>
        KES {Number(value || 0).toLocaleString()}
      </span>
    );
  }

  // Data URL fallback (legacy photo storage)
  if (typeof value === 'string' && value.startsWith('data:')) {
    const nameForAvatar = displayName || field.name || field.internalName || '';
    return <Avatar photo={value} name={nameForAvatar} size={imageSize} borderRadius="50%" />;
  }

  // Null / undefined for non-file types → dash
  if (value == null || value === '') {
    return <span style={{ color: '#d1d5db', ...style }}>—</span>;
  }

  // Multi-value arrays: show dropdown for ANY non-boolean field type
  if (field.dataType !== 'boolean' && field.dataType !== 'file') {
    const parsed = parseMultiValue(value);
    if (parsed && parsed.length > 0) {
      if (parsed.length === 1) {
        return <span style={style}>{parsed[0]}</span>;
      }
      return <MultiValueDropdown names={parsed} label={String(value)} />;
    }
  }

  // Type-based subtle color tint
  const tintStyle = getFieldDisplayStyle(field.dataType, field.internalName, field);
  if (tintStyle) {
    return <span style={{ ...tintStyle, ...style }}>{String(value)}</span>;
  }

  return <span style={style}>{String(value)}</span>;
}

// Avatar — Reusable initials/photo avatar with color-coded background
// Works everywhere: list views, detail heroes, relationship badges, inline editing.
// Shows initials circle when no photo; photo when set; editable mode for inline upload.

import { useState, useRef } from 'react';
import { Camera } from 'lucide-react';
import ASSpinner from './ASSpinner';

// Consistent color palette — hash name to get deterministic color per record
const AVATAR_COLORS = [
  { bg: '#3b82f6', text: '#ffffff' }, // blue
  { bg: '#8b5cf6', text: '#ffffff' }, // violet
  { bg: '#ec4899', text: '#ffffff' }, // pink
  { bg: '#f59e0b', text: '#ffffff' }, // amber
  { bg: '#10b981', text: '#ffffff' }, // emerald
  { bg: '#ef4444', text: '#ffffff' }, // red
  { bg: '#06b6d4', text: '#ffffff' }, // cyan
  { bg: '#84cc16', text: '#ffffff' }, // lime
  { bg: '#f97316', text: '#ffffff' }, // orange
  { bg: '#6366f1', text: '#ffffff' }, // indigo
  { bg: '#14b8a6', text: '#ffffff' }, // teal
  { bg: '#e11d48', text: '#ffffff' }, // rose
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0][0]?.toUpperCase() || '?';
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function getColorForName(name: string): { bg: string; text: string } {
  const idx = hashName(name) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export interface AvatarProps {
  /** Photo URL or data URL */
  photo?: string | null;
  /** Name used for initials and color assignment */
  name: string;
  /** Size in pixels (default: 40) */
  size?: number;
  /** Show edit overlay on hover */
  editable?: boolean;
  /** Called when user selects a new photo */
  onUpload?: (file: File) => void;
  /** Border radius (default: '50%' for circle) */
  borderRadius?: string | number;
  /** Additional styles */
  style?: React.CSSProperties;
  /** Show camera icon overlay when editable */
  showCameraOverlay?: boolean;
}

export default function Avatar({
  photo,
  name,
  size = 40,
  editable = false,
  onUpload,
  borderRadius = '50%',
  style,
  showCameraOverlay = true,
}: AvatarProps) {
  const [uploading, setUploading] = useState(false);
  const [hovering, setHovering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = getInitials(name);
  const color = getColorForName(name);
  // Only real image sources count — list endpoints may send a truthy presence marker
  // (e.g. '1') instead of a blob, which must fall back to initials, not a broken <img>.
  const hasPhoto = !!photo && typeof photo === 'string' &&
    (photo.startsWith('data:') || photo.startsWith('http') || photo.startsWith('blob:'));
  const isUploading = uploading;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      onUpload(file);
    } finally {
      // Parent is responsible for setting uploading to false
      // But we reset the input
      setUploading(false);
    }
    e.target.value = '';
  };

  const fontSize = size <= 24 ? '0.55rem' : size <= 32 ? '0.65rem' : size <= 48 ? '0.8rem' : size <= 64 ? '1rem' : '1.4rem';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius,
        background: hasPhoto ? 'transparent' : color.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
        cursor: editable ? 'pointer' : 'default',
        border: hasPhoto ? 'none' : 'none',
        transition: 'transform 0.15s, box-shadow 0.15s',
        ...style,
      }}
      onMouseEnter={() => editable && setHovering(true)}
      onMouseLeave={() => editable && setHovering(false)}
      onClick={() => editable && fileRef.current?.click()}
      title={editable ? 'Click to change photo' : name}
    >
      {hasPhoto ? (
        <img
          src={photo!}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{
          fontSize,
          fontWeight: 700,
          color: color.text,
          letterSpacing: '0.03em',
          userSelect: 'none',
          lineHeight: 1,
        }}>
          {isUploading ? '' : initials}
        </span>
      )}

      {/* Camera overlay on hover (editable mode) */}
      {editable && showCameraOverlay && (
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hovering || isUploading ? 1 : 0,
          transition: 'opacity 0.2s',
          pointerEvents: hovering ? 'auto' : 'none',
        }}>
          {isUploading ? (
            <ASSpinner size="sm" />
          ) : (
            <Camera size={size <= 32 ? 12 : size <= 48 ? 16 : 20} style={{ color: 'white' }} />
          )}
        </div>
      )}

      {editable && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}
    </div>
  );
}

// Named export for the badge/tag variant — small colored tag showing assignment
export function AssignmentTag({
  label,
  color,
  onRemove,
  size = 'sm',
}: {
  label: string;
  color?: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}) {
  const bgColor = color || '#6b7280';
  const isSmall = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: isSmall ? '2px 8px' : '4px 10px',
      borderRadius: 6,
      fontSize: isSmall ? '0.65rem' : '0.75rem',
      fontWeight: 600,
      background: `${bgColor}18`,
      color: bgColor,
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
    }}>
      {label}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none', border: 'none', padding: 0, margin: 0,
            cursor: 'pointer', color: bgColor, lineHeight: 1,
            fontSize: isSmall ? '0.7rem' : '0.8rem', opacity: 0.6,
          }}
          title={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

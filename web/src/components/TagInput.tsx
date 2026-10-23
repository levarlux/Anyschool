// TagInput — Reusable comma-separated multi-value input
// Converts typed values into interactive tag chips. Use on any field that accepts multiple values.
// Props: value (string[]), onChange (callback), placeholder, delimiter, maxTags, disabled

import { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { X } from 'lucide-react';

export interface TagInputProps {
  /** Current array of tag values */
  value: string[];
  /** Called with the updated array whenever tags change */
  onChange: (tags: string[]) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Character that triggers tag creation (default: ',') */
  delimiter?: string;
  /** Max number of tags (0 = unlimited) */
  maxTags?: number;
  /** Disable the input */
  disabled?: boolean;
  /** Additional class name for the container */
  className?: string;
  /** Additional inline styles for the container */
  style?: React.CSSProperties;
}

export default function TagInput({
  value,
  onChange,
  placeholder = 'Type and press comma or Enter...',
  delimiter = ',',
  maxTags = 0,
  disabled = false,
  className,
  style,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTags = (text: string) => {
    const parts = text.split(delimiter);
    const newTags: string[] = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && !value.includes(trimmed)) {
        newTags.push(trimmed);
      }
    }
    if (newTags.length === 0) return;
    const updated = maxTags > 0 ? [...value, ...newTags].slice(0, maxTags) : [...value, ...newTags];
    onChange(updated);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(t => t !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === delimiter || e.key === 'Enter') {
      e.preventDefault();
      if (input.trim()) {
        addTags(input);
        setInput('');
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(delimiter)) {
      e.preventDefault();
      addTags(pasted);
      setInput('');
    }
  };

  return (
    <div
      className={className}
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
        minHeight: 36, padding: '4px 8px',
        border: '1px solid var(--brand-border)', borderRadius: 'var(--brand-radius-sm, 6px)',
        background: disabled ? '#f9fafb' : 'var(--brand-surface)',
        cursor: disabled ? 'not-allowed' : 'text',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        ...style,
      }}
    >
      {value.map(tag => (
        <span key={tag} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem',
          background: 'var(--brand-primary, #6366f1)', color: 'white', fontWeight: 500,
          lineHeight: 1.4, whiteSpace: 'nowrap',
        }}>
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%',
                background: 'rgba(255,255,255,0.25)', border: 'none', padding: 0,
                cursor: 'pointer', color: 'white', lineHeight: 1,
              }}
              title={`Remove ${tag}`}
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={value.length === 0 ? placeholder : ''}
        disabled={disabled || (maxTags > 0 && value.length >= maxTags)}
        style={{
          flex: 1, minWidth: 80, border: 'none', outline: 'none', background: 'transparent',
          fontSize: '0.85rem', padding: '2px 4px', color: 'var(--brand-text)',
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}

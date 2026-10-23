// ConfirmModal — Themed replacement for window.confirm()
// Supports: regular confirm, destructive double-confirm (type to confirm)
// Animated, dark-slate themed, keyboard accessible

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive' | 'warning';
  requireTypedConfirm?: boolean;
  typedConfirmText?: string; // e.g. "DELETE" or student name
}

interface Props extends ConfirmOptions {
  open: boolean;
  onConfirm: (typedValue?: string) => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, message, confirmText, cancelText,
  variant = 'default', requireTypedConfirm, typedConfirmText,
  onConfirm, onCancel,
}: Props) {
  const [typed, setTyped] = useState('');
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirmLabel = confirmText || 'Confirm';
  const cancelLabel = cancelText || 'Cancel';
  const isDestructive = variant === 'destructive' || variant === 'warning';
  const confirmDisabled = requireTypedConfirm && typed !== (typedConfirmText || 'DELETE');

  // Animate in
  useEffect(() => {
    if (open) {
      setTyped('');
      setClosing(false);
      requestAnimationFrame(() => setVisible(true));
      if (requireTypedConfirm) {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    }
  }, [open, requireTypedConfirm]);

  // Close with animation
  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onCancel();
    }, 180);
  };

  const handleConfirm = () => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onConfirm(requireTypedConfirm ? typed : undefined);
    }, 180);
  };

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'Enter' && !confirmDisabled) handleConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, confirmDisabled, typed]);

  if (!open && !closing) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        opacity: visible && !closing ? 1 : 0,
        transition: 'opacity 0.18s ease',
        pointerEvents: visible && !closing ? 'auto' : 'none',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          background: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: 0,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          transform: visible && !closing ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Header accent bar */}
        {isDestructive && (
          <div style={{
            height: 3,
            background: variant === 'destructive'
              ? 'linear-gradient(90deg, #ef4444, #f97316)'
              : 'linear-gradient(90deg, #f59e0b, #f97316)',
          }} />
        )}

        <div style={{ padding: '24px 24px 0' }}>
          {/* Icon + Title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isDestructive
                ? variant === 'destructive' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'
                : 'rgba(99, 102, 241, 0.15)',
            }}>
              {isDestructive ? (
                <AlertTriangle size={20} style={{ color: variant === 'destructive' ? '#f87171' : '#fbbf24' }} />
              ) : (
                <AlertTriangle size={20} style={{ color: '#818cf8' }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: 0, lineHeight: 1.3 }}>
                {title}
              </h3>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: 28, height: 28, borderRadius: 6, border: 'none',
                background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#94a3b8'; }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Message */}
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0, lineHeight: 1.6, paddingLeft: 52 }}>
            {message}
          </p>

          {/* Typed confirmation input */}
          {requireTypedConfirm && (
            <div style={{ marginTop: 16, paddingLeft: 52 }}>
              <label style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 6, display: 'block' }}>
                Type <span style={{ color: '#f87171', fontWeight: 600 }}>"{typedConfirmText || 'DELETE'}"</span> to confirm:
              </label>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder={typedConfirmText || 'DELETE'}
                style={{
                  width: '100%', height: 38, padding: '0 12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, background: '#0f172a',
                  color: '#f1f5f9', fontSize: '0.85rem',
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'monospace', letterSpacing: 1,
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--brand-primary, #6366f1)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '20px 24px',
          marginTop: 16,
        }}>
          <button
            onClick={handleClose}
            style={{
              height: 36, padding: '0 16px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
              fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmDisabled}
            style={{
              height: 36, padding: '0 16px', borderRadius: 8,
              border: 'none',
              background: confirmDisabled
                ? 'rgba(255,255,255,0.06)'
                : isDestructive
                  ? variant === 'destructive' ? '#ef4444' : '#f59e0b'
                  : 'var(--brand-primary, #6366f1)',
              color: confirmDisabled ? '#475569' : '#ffffff',
              fontSize: '0.85rem', fontWeight: 600, cursor: confirmDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              opacity: confirmDisabled ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => { if (!confirmDisabled) e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={e => { if (!confirmDisabled) e.currentTarget.style.opacity = '1'; }}
          >
            {isDestructive && <Trash2 size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

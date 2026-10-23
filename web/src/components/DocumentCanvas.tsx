import { useState, useCallback } from 'react';

export interface Block {
  id: string;
  type: 'text' | 'number' | 'table' | 'mergeField' | 'image' | 'signature' | 'divider' | 'spacer';
  x: number;
  y: number;
  width: number;
  height: number;
  config: Record<string, any>;
}

export interface DocumentLayout {
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  header: Block[] | null;
  footer: Block[] | null;
  blocks: Block[];
}

const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'number', label: 'Number', icon: '#' },
  { type: 'table', label: 'Table', icon: '⊞' },
  { type: 'mergeField', label: 'Field', icon: '{ }' },
  { type: 'image', label: 'Image', icon: '🖼' },
  { type: 'signature', label: 'Signature', icon: '✍' },
  { type: 'divider', label: 'Line', icon: '—' },
  { type: 'spacer', label: 'Space', icon: '↕' },
] as const;

let blockIdCounter = 0;
function newBlockId() {
  return `block-${Date.now()}-${++blockIdCounter}`;
}

interface Props {
  layout: DocumentLayout;
  onChange: (layout: DocumentLayout) => void;
  mergeFields?: { internalName: string; label: string }[];
  theme?: Record<string, any>;
}

export default function DocumentCanvas({ layout, onChange, mergeFields = [] }: Props) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

  const addBlock = useCallback((type: Block['type']) => {
    const newBlock: Block = {
      id: newBlockId(),
      type,
      x: 20,
      y: 20 + layout.blocks.length * 15,
      width: 120,
      height: type === 'spacer' ? 10 : 15,
      config: getDefaultConfig(type, mergeFields),
    };
    onChange({
      ...layout,
      blocks: [...layout.blocks, newBlock],
    });
  }, [layout, onChange, mergeFields]);

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    onChange({
      ...layout,
      blocks: layout.blocks.map(b => b.id === id ? { ...b, ...updates } : b),
    });
  }, [layout, onChange]);

  const deleteBlock = useCallback((id: string) => {
    onChange({
      ...layout,
      blocks: layout.blocks.filter(b => b.id !== id),
    });
    if (selectedBlock === id) setSelectedBlock(null);
  }, [layout, onChange, selectedBlock]);

  const selected = layout.blocks.find(b => b.id === selectedBlock);

  return (
    <div style={{ display: 'flex', gap: '16px', fontFamily: 'Inter, sans-serif' }}>
      {/* Block palette */}
      <div style={{ width: '140px', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: '8px' }}>
          Blocks
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {BLOCK_TYPES.map(bt => (
            <button
              key={bt.type}
              onClick={() => addBlock(bt.type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#374151',
                textAlign: 'left',
              }}
            >
              <span style={{ width: '20px', textAlign: 'center', fontWeight: 700 }}>{bt.icon}</span>
              {bt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '24px',
            minHeight: '500px',
            position: 'relative',
          }}
        >
          {/* Page outline */}
          <div
            style={{
              width: '595px', // A4 at ~2x
              height: '842px',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              borderRadius: '2px',
              position: 'relative',
              overflow: 'hidden',
              margin: '0 auto',
            }}
          >
            {layout.blocks.map(block => (
              <div
                key={block.id}
                onClick={(e) => { e.stopPropagation(); setSelectedBlock(block.id); }}
                style={{
                  position: 'absolute',
                  left: `${block.x * 2}px`,
                  top: `${block.y * 2}px`,
                  width: `${block.width * 2}px`,
                  height: `${block.height * 2}px`,
                  border: selectedBlock === block.id ? '2px solid #3b82f6' : '1px dashed #d1d5db',
                  borderRadius: '2px',
                  cursor: 'move',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: '#6b7280',
                  background: selectedBlock === block.id ? 'rgba(59,130,246,0.05)' : 'transparent',
                  transition: 'border-color 0.15s',
                }}
              >
                {block.type === 'mergeField'
                  ? `{${block.config.fieldName || '?'}}`
                  : block.type === 'text'
                    ? (block.config.content || 'Text').slice(0, 20)
                    : block.type === 'signature'
                      ? 'Signature'
                      : block.type === 'divider'
                        ? '────────'
                        : block.type === 'image'
                          ? '🖼'
                          : block.type}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Properties panel */}
      <div style={{ width: '220px', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: '8px' }}>
          Properties
        </div>
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '11px', color: '#555' }}>
              X
              <input type="number" value={selected.x}
                onChange={e => updateBlock(selected.id, { x: Number(e.target.value) })}
                style={{ width: '100%', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
              />
            </label>
            <label style={{ fontSize: '11px', color: '#555' }}>
              Y
              <input type="number" value={selected.y}
                onChange={e => updateBlock(selected.id, { y: Number(e.target.value) })}
                style={{ width: '100%', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
              />
            </label>
            <label style={{ fontSize: '11px', color: '#555' }}>
              Width
              <input type="number" value={selected.width}
                onChange={e => updateBlock(selected.id, { width: Number(e.target.value) })}
                style={{ width: '100%', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
              />
            </label>
            <label style={{ fontSize: '11px', color: '#555' }}>
              Height
              <input type="number" value={selected.height}
                onChange={e => updateBlock(selected.id, { height: Number(e.target.value) })}
                style={{ width: '100%', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
              />
            </label>

            {selected.type === 'text' && (
              <label style={{ fontSize: '11px', color: '#555' }}>
                Content
                <textarea value={selected.config.content || ''}
                  onChange={e => updateBlock(selected.id, { config: { ...selected.config, content: e.target.value } })}
                  style={{ width: '100%', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', minHeight: '60px' }}
                />
              </label>
            )}

            {selected.type === 'mergeField' && (
              <label style={{ fontSize: '11px', color: '#555' }}>
                Field
                <select value={selected.config.fieldName || ''}
                  onChange={e => updateBlock(selected.id, { config: { ...selected.config, fieldName: e.target.value } })}
                  style={{ width: '100%', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="">Select field...</option>
                  {mergeFields.map(f => (
                    <option key={f.internalName} value={f.internalName}>{f.label}</option>
                  ))}
                </select>
              </label>
            )}

            <button
              onClick={() => deleteBlock(selected.id)}
              style={{
                padding: '6px',
                background: '#fee2e2',
                color: '#dc2626',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Delete Block
            </button>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#999' }}>Click a block to edit</div>
        )}
      </div>
    </div>
  );
}

function getDefaultConfig(type: Block['type'], mergeFields: { internalName: string; label: string }[]): Record<string, any> {
  switch (type) {
    case 'text': return { content: 'Text block' };
    case 'number': return { value: 0, prefix: '', suffix: '' };
    case 'table': return { columns: [], rows: [] };
    case 'mergeField': return { fieldName: mergeFields[0]?.internalName || '', fallback: '' };
    case 'image': return { src: '' };
    case 'signature': return { label: 'Authorized Signature' };
    case 'divider': return {};
    case 'spacer': return {};
    default: return {};
  }
}

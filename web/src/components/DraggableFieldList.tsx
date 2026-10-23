// DraggableFieldList — smooth pointer-based drag-to-reorder
// No native drag API — uses pointer events for instant response

import { useState, useRef, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { setFieldOrder } from '../lib/fieldOrder';

interface FieldItem {
  id: string;
  name: string;
  internalName: string;
  dataType: string;
  value: any;
  isRequired?: boolean;
  isIdentifier?: boolean;
}

interface Props {
  entityType: string;
  schoolId: string;
  fields: FieldItem[];
  onOrderChanged?: (orderedIds: string[]) => void;
  renderField?: (field: FieldItem, index: number) => React.ReactNode;
}

export default function DraggableFieldList({ entityType, schoolId, fields, onOrderChanged, renderField }: Props) {
  const [items, setItems] = useState<FieldItem[]>(fields);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const itemHeight = useRef(0);

  const getIndexFromY = useCallback((y: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = y - rect.top + containerRef.current.scrollTop;
    return Math.max(0, Math.min(items.length - 1, Math.floor(relativeY / itemHeight.current)));
  }, [items.length]);

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    setDragIdx(index);
    setOverIdx(index);

    // Measure item height
    const children = containerRef.current?.children;
    if (children && children[0]) {
      itemHeight.current = (children[0] as HTMLElement).offsetHeight + 2; // +gap
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx === null) return;
    const newOverIdx = getIndexFromY(e.clientY);
    setOverIdx(newOverIdx);
  }, [dragIdx, getIndexFromY]);

  const handlePointerUp = useCallback(() => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }

    const newItems = [...items];
    const dragged = newItems.splice(dragIdx, 1)[0];
    newItems.splice(overIdx, 0, dragged);

    setItems(newItems);
    setDragIdx(null);
    setOverIdx(null);

    const orderedIds = newItems.map(f => f.id);
    setFieldOrder(entityType, schoolId, orderedIds);
    onOrderChanged?.(orderedIds);
  }, [dragIdx, overIdx, items, entityType, schoolId, onOrderChanged]);

  return (
    <div ref={containerRef} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      style={{ display: 'flex', flexDirection: 'column', gap: 2, touchAction: 'none', userSelect: 'none' }}>
      {items.map((field, index) => {
        const isDragging = dragIdx === index;
        const isOver = overIdx === index && dragIdx !== null && dragIdx !== index;

        return (
          <div key={field.id}
            onPointerDown={(e) => handlePointerDown(e, index)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', borderRadius: 8,
              background: isDragging ? '#eff6ff' : isOver ? '#f0f9ff' : '#fff',
              border: isDragging ? '1.5px solid #93c5fd' : isOver ? '1.5px solid #bfdbfe' : '1px solid #f3f4f6',
              cursor: dragIdx !== null ? 'grabbing' : 'grab',
              transition: isDragging ? 'none' : 'all 0.15s ease',
              transform: isDragging ? 'scale(1.02)' : 'scale(1)',
              boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.12)' : isOver ? '0 2px 8px rgba(59,130,246,0.1)' : 'none',
              opacity: dragIdx !== null && !isDragging ? 0.6 : 1,
              position: 'relative',
              zIndex: isDragging ? 10 : 1,
            }}>
            <GripVertical size={14} style={{ color: isDragging ? '#3b82f6' : '#9ca3af', flexShrink: 0 }} />
            {renderField ? renderField(field, index) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>{field.name}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {field.value ?? '—'}
                </div>
              </div>
            )}
            {field.isRequired && (
              <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 500 }}>Required</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

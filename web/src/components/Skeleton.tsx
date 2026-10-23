// Reusable Skeleton loading components — matches actual page layouts

import React from 'react';

const shimmer = {
  background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: 6,
};

const shimmerKeyframes = `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;

if (typeof document !== 'undefined' && !document.getElementById('skeleton-styles')) {
  const style = document.createElement('style');
  style.id = 'skeleton-styles';
  style.textContent = shimmerKeyframes;
  document.head.appendChild(style);
}

function Bar({ width, height = 14, style: s = {} }: { width: string | number; height?: number; style?: React.CSSProperties }) {
  return <div style={{ ...shimmer, width, height, ...s }} />;
}

// ─── Learners List Skeleton ──────────────────────────────────
export function LearnersListSkeleton() {
  return (
    <div style={{ animation: 'fadeSlideUp 0.3s ease forwards' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ ...shimmer, width: 44, height: 44, borderRadius: 12 }} />
          <div>
            <Bar width={120} height={20} />
            <Bar width={80} height={12} style={{ marginTop: 6 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Bar width={100} height={36} style={{ borderRadius: 8 }} />
          <Bar width={90} height={36} style={{ borderRadius: 8 }} />
          <Bar width={80} height={36} style={{ borderRadius: 8 }} />
          <Bar width={100} height={36} style={{ borderRadius: 8 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ padding: 20, borderRadius: 12, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ ...shimmer, width: 36, height: 36, borderRadius: 8 }} />
              <Bar width={60} height={10} />
            </div>
            <Bar width={80} height={24} />
            <Bar width={50} height={10} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div style={{ borderRadius: 12, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 16, padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ ...shimmer, width: 20, height: 14 }} />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ flex: i === 1 ? 2 : 1 }}><Bar width="70%" height={12} /></div>
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(row => (
          <div key={row} style={{ display: 'flex', gap: 16, padding: '14px 20px', borderBottom: '1px solid #f9fafb' }}>
            <div style={{ ...shimmer, width: 18, height: 18, borderRadius: 4, flexShrink: 0 }} />
            {[2, 1, 1, 1, 1].map((flex, i) => (
              <div key={i} style={{ flex, display: 'flex', alignItems: 'center' }}>
                <Bar width={i === 0 ? '60%' : '40%'} height={14} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Learner Detail Skeleton ─────────────────────────────────
export function LearnerDetailSkeleton() {
  return (
    <div style={{ animation: 'fadeSlideUp 0.3s ease forwards' }}>
      <div style={{ marginBottom: 20 }}>
        <Bar width={120} height={32} style={{ borderRadius: 8 }} />
      </div>
      <div style={{
        background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)',
        borderRadius: 16, padding: '32px 32px 24px', marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ width: 96, height: 96, borderRadius: 16, background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...shimmer, width: 200, height: 24, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div style={{ ...shimmer, width: 80, height: 14, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
              <div style={{ ...shimmer, width: 50, height: 14, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ ...shimmer, width: 70, height: 32, borderRadius: 8, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
            <div style={{ ...shimmer, width: 60, height: 32, borderRadius: 8, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
              <div style={{ ...shimmer, width: 40, height: 10, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
              <div style={{ ...shimmer, width: 50, height: 12, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {[1, 2].map(section => (
          <div key={section} style={{ background: 'white', borderRadius: 12, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
              <Bar width={120} height={14} />
            </div>
            <div style={{ padding: '12px 20px' }}>
              {[1, 2, 3, 4].map(row => (
                <div key={row} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                  <Bar width={90} height={12} />
                  <Bar width={140} height={14} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Field Manager Skeleton ───────────────────────────────────
export function FieldManagerSkeleton() {
  return (
    <div style={{ padding: 16, borderRadius: 12, border: '1px solid #f3f4f6', background: 'white', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Bar width={100} height={16} />
        <Bar width={80} height={30} style={{ borderRadius: 6 }} />
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, border: '1px solid #f3f4f6', marginBottom: 4 }}>
          <div style={{ ...shimmer, width: 24, height: 24, borderRadius: 4 }} />
          <Bar width={`${40 + i * 8}%`} height={14} style={{ flex: 1 }} />
          <Bar width={60} height={10} />
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ ...shimmer, width: 24, height: 24, borderRadius: 4 }} />
            <div style={{ ...shimmer, width: 24, height: 24, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Form Skeleton (Add/Edit) ─────────────────────────────────
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div style={{ padding: 24, borderRadius: 12, border: '1px solid #f3f4f6', background: 'white', maxWidth: 720 }}>
      <Bar width={160} height={20} style={{ marginBottom: 8 }} />
      <Bar width={280} height={12} style={{ marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} style={{ gridColumn: i === fields - 1 && fields % 2 !== 0 ? 'span 2' : undefined }}>
            <Bar width={80} height={10} style={{ marginBottom: 6 }} />
            <div style={{ ...shimmer, width: '100%', height: 36, borderRadius: 6 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
        <Bar width={80} height={36} style={{ borderRadius: 8 }} />
        <Bar width={120} height={36} style={{ borderRadius: 8 }} />
      </div>
    </div>
  );
}

// ─── KPI / Chart Skeleton ─────────────────────────────────────
export function KPISkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ padding: 20, borderRadius: 12, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ ...shimmer, width: 36, height: 36, borderRadius: 8 }} />
            <Bar width={60} height={10} />
          </div>
          <Bar width={80} height={24} />
          <Bar width={50} height={10} style={{ marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ padding: 16, borderRadius: 12, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
          <Bar width={100} height={14} style={{ marginBottom: 16 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {[40, 70, 50, 90, 60, 80].map((h, j) => (
              <div key={j} style={{ ...shimmer, flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Widget Editor Skeleton ───────────────────────────────────
export function WidgetEditorSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #f3f4f6' }}>
          <div style={{ ...shimmer, width: 32, height: 32, borderRadius: 6 }} />
          <div style={{ flex: 1 }}>
            <Bar width={120} height={12} />
            <Bar width={80} height={10} style={{ marginTop: 4 }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ ...shimmer, width: 24, height: 24, borderRadius: 4 }} />
            <div style={{ ...shimmer, width: 24, height: 24, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Inline Skeleton (for sections loading data) ──────────────
export function InlineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...shimmer, width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
          <Bar width={`${60 + i * 10}%`} height={12} />
        </div>
      ))}
    </div>
  );
}

// ─── Teachers List Skeleton ─────────────────────────────────
export function TeachersListSkeleton() {
  return (
    <div style={{ animation: 'fadeSlideUp 0.3s ease forwards' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ ...shimmer, width: 44, height: 44, borderRadius: 12 }} />
          <div>
            <Bar width={120} height={20} />
            <Bar width={80} height={12} style={{ marginTop: 6 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Bar width={100} height={36} style={{ borderRadius: 8 }} />
          <Bar width={90} height={36} style={{ borderRadius: 8 }} />
          <Bar width={80} height={36} style={{ borderRadius: 8 }} />
          <Bar width={100} height={36} style={{ borderRadius: 8 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ padding: 20, borderRadius: 12, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ ...shimmer, width: 36, height: 36, borderRadius: 8 }} />
              <Bar width={60} height={10} />
            </div>
            <Bar width={80} height={24} />
            <Bar width={50} height={10} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div style={{ borderRadius: 12, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 16, padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ ...shimmer, width: 20, height: 14 }} />
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} style={{ flex: i === 1 ? 2 : 1 }}><Bar width="70%" height={12} /></div>
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(row => (
          <div key={row} style={{ display: 'flex', gap: 16, padding: '14px 20px', borderBottom: '1px solid #f9fafb' }}>
            <div style={{ ...shimmer, width: 18, height: 18, borderRadius: 4, flexShrink: 0 }} />
            {[2, 1, 1, 1, 1, 1, 1].map((flex, i) => (
              <div key={i} style={{ flex, display: 'flex', alignItems: 'center' }}>
                <Bar width={i === 0 ? '60%' : '40%'} height={14} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Teacher Detail Skeleton ────────────────────────────────
export function TeacherDetailSkeleton() {
  return (
    <div style={{ animation: 'fadeSlideUp 0.3s ease forwards' }}>
      <div style={{ marginBottom: 20 }}>
        <Bar width={120} height={32} style={{ borderRadius: 8 }} />
      </div>
      {/* Hero card skeleton */}
      <div style={{
        background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #92400e 100%)',
        borderRadius: 16, padding: '32px 32px 24px', marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ width: 96, height: 96, borderRadius: 16, background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...shimmer, width: 200, height: 24, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div style={{ ...shimmer, width: 80, height: 14, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
              <div style={{ ...shimmer, width: 50, height: 14, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
              <div style={{ ...shimmer, width: 40, height: 10, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
              <div style={{ ...shimmer, width: 50, height: 12, background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)', backgroundSize: '200% 100%' }} />
            </div>
          ))}
        </div>
      </div>
      {/* Subjects panel skeleton */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ ...shimmer, width: 18, height: 18, borderRadius: 4 }} />
          <Bar width={140} height={16} />
          <Bar width={50} height={20} style={{ borderRadius: 10 }} />
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
          {[2, 1, 1, 1, 0.3].map((flex, i) => (
            <div key={i} style={{ flex }}><Bar width="60%" height={12} /></div>
          ))}
        </div>
        {[1, 2, 3].map(row => (
          <div key={row} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #f9fafb' }}>
            {[2, 1, 1, 1, 0.3].map((flex, i) => (
              <div key={i} style={{ flex, display: 'flex', alignItems: 'center' }}>
                <Bar width={i === 0 ? '50%' : '35%'} height={14} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Classes panel skeleton */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ ...shimmer, width: 18, height: 18, borderRadius: 4 }} />
          <Bar width={130} height={16} />
          <Bar width={50} height={20} style={{ borderRadius: 10 }} />
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
          {[2, 1, 1, 1, 0.3].map((flex, i) => (
            <div key={i} style={{ flex }}><Bar width="60%" height={12} /></div>
          ))}
        </div>
        {[1, 2].map(row => (
          <div key={row} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #f9fafb' }}>
            {[2, 1, 1, 1, 0.3].map((flex, i) => (
              <div key={i} style={{ flex, display: 'flex', alignItems: 'center' }}>
                <Bar width={i === 0 ? '50%' : '35%'} height={14} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Field sections skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {[1, 2].map(section => (
          <div key={section} style={{ background: 'white', borderRadius: 12, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
              <Bar width={120} height={14} />
            </div>
            <div style={{ padding: '12px 20px' }}>
              {[1, 2, 3, 4].map(row => (
                <div key={row} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                  <Bar width={90} height={12} />
                  <Bar width={140} height={14} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

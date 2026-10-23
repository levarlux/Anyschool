import { useState, useEffect } from 'react';
import {
  Users, School, BookOpen, GraduationCap,
  Settings, FileText, Upload, ArrowUpRight, Sparkles,
  Wallet, Calendar, ClipboardCheck, Database,
} from 'lucide-react';

import ASSpinner from './ASSpinner';

const API = '/api';

type Page = string;

interface Stats {
  learners: number;
  classes: number;
  subjects: number;
  teachers: number;
  terms: number;
  assessments: number;
}

export default function Dashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [stats, setStats] = useState<Stats>({ learners: 0, classes: 0, subjects: 0, teachers: 0, terms: 0, assessments: 0 });
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const schoolId = localStorage.getItem('anyschool_current_school') || '88374870-9175-4565-a876-f17c2e295519';

  const fetchCounts = async () => {
    setLoading(true);
    try {
      // Use the same stats endpoint as the Learners page (Doc 15 §2.1 — single source of truth)
      const res = await fetch(`${API}/learners/stats/${schoolId}`);
      if (res.ok) {
        const data = await res.json();
        setStats({
          learners: data.learners || 0,
          classes: data.classes || 0,
          subjects: data.subjects || 0,
          teachers: data.teachers || 0,
          terms: data.terms || 0,
          assessments: data.assessments || 0,
        });
        if ((data.learners || 0) > 0) setSeeded(true);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchCounts(); }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch(`${API}/seed/seed-school`, {
        method: 'POST',
        headers: { 'X-School-Id': schoolId, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        await fetchCounts();
      }
    } catch {}
    setSeeding(false);
  };

  const kpis = [
    { label: 'Total Learners', value: stats.learners, icon: Users, color: '#3b82f6', bg: '#eff6ff', page: 'learners' },
    { label: 'Classes', value: stats.classes, icon: School, color: '#22c55e', bg: '#f0fdf4', page: 'classes' },
    { label: 'Subjects', value: stats.subjects, icon: BookOpen, color: '#a855f7', bg: '#faf5ff', page: 'subjects' },
    { label: 'Teachers', value: stats.teachers, icon: GraduationCap, color: '#f59e0b', bg: '#fffbeb', page: 'teachers' },
    { label: 'Terms', value: stats.terms, icon: Calendar, color: '#ef4444', bg: '#fef2f2', page: 'terms' },
    { label: 'Assessments', value: stats.assessments, icon: ClipboardCheck, color: '#ec4899', bg: '#fdf2f8', page: 'assessments' },
  ];

  const quickActions = [
    { label: 'Add Learner', icon: Users, page: 'learners', color: '#3b82f6' },
    { label: 'Schema Builder', icon: Settings, page: 'schema', color: '#a855f7' },
    { label: 'Documents', icon: FileText, page: 'documents', color: '#22c55e' },
    { label: 'Upload File', icon: Upload, page: 'uploads', color: '#f59e0b' },
    { label: 'SmartAssist', icon: Sparkles, page: 'assistant', color: '#16a34a', featured: true },
    { label: 'Finance', icon: Wallet, page: 'finance', color: '#06b6d4' },
  ];

  return (
    <div className="page-enter">
      <div className="dashboard-welcome">
        <div className="welcome-content">
          <h2>Welcome back</h2>
          <p>Here is what is happening across your school today.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!seeded && (
            <button className="btn btn-lg" onClick={handleSeed} disabled={seeding} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>
              {seeding ? <ASSpinner size="sm" /> : <Database size={16} />}
              {seeding ? 'Seeding...' : 'Load Demo Data'}
            </button>
          )}
          <button className="btn btn-lg" onClick={() => onNavigate('assistant')} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>
            <Sparkles size={16} />
            Open SmartAssist
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {kpis.map((kpi, i) => (
          <div
            key={kpi.label}
            className="kpi-card"
            style={{ animationDelay: `${i * 60}ms`, animation: 'fadeSlideUp 0.4s ease forwards', opacity: 0 }}
            onClick={() => onNavigate(kpi.page)}
          >
            <div className="kpi-icon" style={{ background: kpi.bg }}>
              <kpi.icon size={20} style={{ color: kpi.color }} />
            </div>
            <div>
              <div className="kpi-value">{loading ? '—' : kpi.value}</div>
              <div className="kpi-label">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <div className="section-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="actions-grid">
            {quickActions.map((action, i) => (
              <button
                key={action.label}
                className={`action-card ${action.featured ? 'action-featured' : ''}`}
                onClick={() => onNavigate(action.page)}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="action-icon" style={{ background: action.color + '12', color: action.color }}>
                  <action.icon size={18} />
                </div>
                <span className="action-label">{action.label}</span>
                <ArrowUpRight size={14} className="action-arrow" />
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h3>Core Pillars</h3>
          </div>
          <div className="pillars-grid">
            {[
              { name: 'Learners', icon: Users, color: '#3b82f6', count: stats.learners, page: 'learners' },
              { name: 'Classes', icon: School, color: '#22c55e', count: stats.classes, page: 'classes' },
              { name: 'Subjects', icon: BookOpen, color: '#a855f7', count: stats.subjects, page: 'subjects' },
              { name: 'Teachers', icon: GraduationCap, color: '#f59e0b', count: stats.teachers, page: 'teachers' },
              { name: 'Terms', icon: Calendar, color: '#ef4444', count: stats.terms, page: 'terms' },
              { name: 'Assessments', icon: ClipboardCheck, color: '#ec4899', count: stats.assessments, page: 'assessments' },
            ].map(p => (
              <div key={p.name} className="pillar-card" onClick={() => onNavigate(p.page)}>
                <div className="pillar-icon" style={{ background: p.color + '12' }}>
                  <p.icon size={16} style={{ color: p.color }} />
                </div>
                <div className="pillar-info">
                  <div className="pillar-name">{p.name}</div>
                  <div className="pillar-count">{loading ? '—' : p.count} records</div>
                </div>
                <ArrowUpRight size={14} className="pillar-arrow" />
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h3>Recent Activity</h3>
          </div>
          <div className="activity-list">
            {[
              { text: seeded ? 'Demo data loaded: 100 learners, 10 teachers, 16 classes' : 'System initialized with 7 core pillars', color: '#22c55e', time: 'Just now' },
              { text: 'Demo Academy school configured', color: '#3b82f6', time: 'Just now' },
              { text: '7 default relationships active', color: '#a855f7', time: 'Just now' },
              { text: 'Currency set to KES (Kenyan Shilling)', color: '#f59e0b', time: 'Just now' },
            ].map((item, i) => (
              <div key={i} className="activity-item">
                <div className="activity-dot" style={{ background: item.color }} />
                <span className="activity-text">{item.text}</span>
                <span className="activity-time">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

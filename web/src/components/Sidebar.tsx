import { useState } from 'react';
import {
  LayoutDashboard, Users, School, BookOpen, GraduationCap,
  Calendar, ClipboardCheck, UserCheck, Settings, FileText,
  Upload, ChevronsLeft, ChevronsRight, Sparkles, Wallet,
  Library, Heart, MessageSquare, Briefcase,
} from 'lucide-react';
import { UserButton } from '@clerk/clerk-react';
import { AUTH_ENABLED } from '../lib/authConfig';

type Page = string;

interface Props {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const NAV_MAIN = [
  { icon: LayoutDashboard, label: 'Dashboard', page: 'dashboard' },
];

const NAV_PILLARS = [
  { icon: Users, label: 'Learners', page: 'learners' },
  { icon: School, label: 'Classes', page: 'classes' },
  { icon: BookOpen, label: 'Subjects', page: 'subjects' },
  { icon: GraduationCap, label: 'Teachers', page: 'teachers' },
  { icon: Calendar, label: 'Terms', page: 'terms' },
  { icon: ClipboardCheck, label: 'Assessments', page: 'assessments' },
  { icon: UserCheck, label: 'Enrollments', page: 'enrollments' },
];

const NAV_TOOLS = [
  { icon: Sparkles, label: 'SmartAssist', page: 'assistant', highlight: true },
  { icon: Wallet, label: 'Finance', page: 'finance' },
  { icon: Library, label: 'Library', page: 'library' },
  { icon: Heart, label: 'Health', page: 'health' },
  { icon: MessageSquare, label: 'Communication', page: 'communication' },
  { icon: Briefcase, label: 'Staff', page: 'staff' },
];

const NAV_SYSTEM = [
  { icon: FileText, label: 'Documents', page: 'documents' },
  { icon: Upload, label: 'File Uploads', page: 'uploads' },
  { icon: Settings, label: 'Settings', page: 'settings' },
];

export default function Sidebar({ activePage, onNavigate }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo" onClick={() => onNavigate('dashboard')}>
          <img className="sidebar-logo-mark" src="/logo.svg" alt="AnySchool" />
          {!collapsed && <span className="sidebar-logo-text">AnySchool</span>}
        </div>
        <button className="sidebar-collapse" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      {AUTH_ENABLED && !collapsed && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 12px' }}>
        <UserButton />
      </div>}

      <nav className="sidebar-nav">
        <NavSection collapsed={collapsed}>
          {NAV_MAIN.map(item => (
            <NavItem key={item.page} {...item} active={activePage === item.page} collapsed={collapsed} onClick={() => onNavigate(item.page)} />
          ))}
        </NavSection>

        <NavSection label="Core Pillars" collapsed={collapsed}>
          {NAV_PILLARS.map(item => (
            <NavItem key={item.page} {...item} active={activePage === item.page} collapsed={collapsed} onClick={() => onNavigate(item.page)} />
          ))}
        </NavSection>

        <NavSection label="Modules" collapsed={collapsed}>
          {NAV_TOOLS.map(item => (
            <NavItem key={item.page} {...item} active={activePage === item.page} collapsed={collapsed} onClick={() => onNavigate(item.page)} />
          ))}
        </NavSection>

        <NavSection label="System" collapsed={collapsed}>
          {NAV_SYSTEM.map(item => (
            <NavItem key={item.page} {...item} active={activePage === item.page} collapsed={collapsed} onClick={() => onNavigate(item.page)} />
          ))}
        </NavSection>
      </nav>
    </aside>
  );
}

function NavSection({ label, collapsed, children }: { label?: string; collapsed: boolean; children: React.ReactNode }) {
  return (
    <div className="nav-section">
      {label && !collapsed && <div className="nav-section-label">{label}</div>}
      {children}
    </div>
  );
}

function NavItem({ icon: Icon, label, active, collapsed, onClick, highlight }: {
  icon: any; label: string; page: string; active: boolean; collapsed: boolean; onClick: () => void; highlight?: boolean;
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''} ${highlight ? 'nav-item-highlight' : ''}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <Icon size={18} />
      {!collapsed && <span>{label}</span>}
      {highlight && !collapsed && <span className="nav-badge">AI</span>}
    </button>
  );
}

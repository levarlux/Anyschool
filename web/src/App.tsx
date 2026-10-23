import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SchemaBuilder from './components/SchemaBuilder';
import DocumentTemplates from './components/DocumentTemplates';
import FileUpload from './components/FileUpload';
import ThemeCustomizer from './components/ThemeCustomizer';
import SmartAssist from './components/SmartAssist';
import Finance from './components/Finance';
import Library from './components/Library';
import Health from './components/Health';
import Communication from './components/Communication';
import Staff from './components/Staff';
import LearnersPage from './components/LearnersPage';
import ClassesPage from './components/ClassesPage';
import TeachersPage from './components/TeachersPage';
import SubjectsPage from './components/SubjectsPage';
import TermsPage from './components/TermsPage';
import AssessmentsPage from './components/AssessmentsPage';
import LoadingScreen from './components/LoadingScreen';
import { ConfirmProvider } from './components/ConfirmProvider';
import BillingSection from './components/BillingSection';
import { useSchoolTheme } from './lib/theme';
import './design-system/tokens.css';
import './index.css';

type Page = string;

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  learners: 'Learners',
  classes: 'Classes',
  subjects: 'Subjects',
  teachers: 'Teachers',
  terms: 'Terms',
  assessments: 'Assessments',
  enrollments: 'Enrollments',
  schema: 'Schema Builder',
  documents: 'Documents',
  uploads: 'File Uploads',
  settings: 'Settings',
  assistant: 'SmartAssist',
  finance: 'Finance',
  library: 'Library',
  health: 'Health',
  communication: 'Communication',
  staff: 'Staff',
};

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [loading, setLoading] = useState(true);
  // Reference returned from Paystack checkout (?billing=<ref>) — opens Settings → Billing
  const [billingRef, setBillingRef] = useState<string | null>(null);
  const { theme, updateTheme, resetTheme } = useSchoolTheme();

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('billing');
    if (ref) {
      window.history.replaceState({}, '', window.location.pathname);
      setBillingRef(ref);
      setPage('settings');
    }
  }, []);

  return (
    <ConfirmProvider>
      <div className="app-root">
        {loading && <LoadingScreen />}

        <div className="app-layout">
          <Sidebar activePage={page} onNavigate={setPage} />
          <div className="main-content">
            <header className="top-bar">
              <h2 className="page-title">{PAGE_TITLES[page] || page}</h2>
            </header>
            <main className="page-content" key={page}>
              {renderPage(page, setPage, theme, updateTheme, resetTheme, billingRef)}
            </main>
          </div>
        </div>
      </div>
    </ConfirmProvider>
  );
}

function renderPage(page: Page, setPage: (p: Page) => void, theme: any, updateTheme: any, resetTheme: any, billingRef: string | null) {
  switch (page) {
    case 'dashboard': return <Dashboard onNavigate={setPage} />;
    case 'learners': return <LearnersPage />;
    case 'classes': return <ClassesPage />;
    case 'subjects': return <SubjectsPage />;
    case 'terms': return <TermsPage />;
    case 'teachers': return <TeachersPage />;
    case 'assessments': return <AssessmentsPage />;
    case 'schema': return <SchemaBuilder />;
    case 'documents': return <DocumentTemplates />;
    case 'uploads': return <FileUpload />;
    case 'assistant': return <SmartAssist />;
    case 'finance': return <Finance />;
    case 'library': return <Library />;
    case 'health': return <Health />;
    case 'communication': return <Communication />;
    case 'staff': return <Staff />;
    case 'settings': return <SettingsPage theme={theme} updateTheme={updateTheme} resetTheme={resetTheme} billingRef={billingRef} />;
    default: return <Dashboard onNavigate={setPage} />;
  }
}

function SettingsPage({ theme, updateTheme, resetTheme, billingRef }: any) {
  const [tab, setTab] = useState<'theme' | 'school' | 'currency' | 'billing'>(billingRef ? 'billing' : 'theme');

  return (
    <div className="page-enter">
      <div className="theme-tabs" style={{ marginBottom: 20 }}>
        <button className={`theme-tab ${tab === 'theme' ? 'active' : ''}`} onClick={() => setTab('theme')}>Theme</button>
        <button className={`theme-tab ${tab === 'school' ? 'active' : ''}`} onClick={() => setTab('school')}>School</button>
        <button className={`theme-tab ${tab === 'currency' ? 'active' : ''}`} onClick={() => setTab('currency')}>Currency</button>
        <button className={`theme-tab ${tab === 'billing' ? 'active' : ''}`} onClick={() => setTab('billing')}>Billing</button>
      </div>

      {tab === 'theme' && <ThemeCustomizer theme={theme} onUpdate={updateTheme} onReset={resetTheme} />}

      {tab === 'billing' && <BillingSection returnReference={billingRef} />}

      {tab === 'school' && (
        <div className="card page-enter" style={{ padding: 24 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20 }}>School Settings</h3>
          <div className="form-group">
            <label className="form-label">School Name</label>
            <input className="input" placeholder="Your School Name" />
          </div>
          <div className="form-group">
            <label className="form-label">School Logo</label>
            <div className="dropzone" style={{ padding: 24 }}>
              <p style={{ color: 'var(--brand-text-secondary)', fontSize: '0.85rem' }}>Click to upload your school logo (PNG, SVG, or JPG)</p>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Contact Email</label>
              <input className="input" type="email" placeholder="admin@yourschool.edu" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input className="input" type="tel" placeholder="+254 700 000000" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 8 }}>Save School Settings</button>
        </div>
      )}

      {tab === 'currency' && (
        <div className="card page-enter" style={{ padding: 24 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Currency Settings</h3>
          <p className="text-muted" style={{ marginBottom: 20 }}>Each school can use its own currency for fees and financial records.</p>
          <div className="form-group">
            <label className="form-label">Currency</label>
            <select className="select" defaultValue="KES">
              <option value="KES">KES - Kenyan Shilling</option>
              <option value="USD">USD - US Dollar</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="EUR">EUR - Euro</option>
              <option value="NGN">NGN - Nigerian Naira</option>
              <option value="ZAR">ZAR - South African Rand</option>
              <option value="GHS">GHS - Ghanaian Cedi</option>
              <option value="UGX">UGX - Ugandan Shilling</option>
              <option value="TZS">TZS - Tanzanian Shilling</option>
              <option value="INR">INR - Indian Rupee</option>
              <option value="PHP">PHP - Philippine Peso</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Currency Symbol</label>
            <input className="input" defaultValue="KES" maxLength={4} style={{ width: 100 }} />
          </div>
          <button className="btn btn-primary" style={{ marginTop: 8 }}>Save Currency</button>
        </div>
      )}
    </div>
  );
}

export default App;

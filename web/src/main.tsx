import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import ClerkAuthGate from './components/ClerkAuthGate';
import { AUTH_ENABLED, DEFAULT_SCHOOL_ID } from './lib/authConfig';
import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const root = ReactDOM.createRoot(document.getElementById('root')!);

if (AUTH_ENABLED) {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={publishableKey}>
        <ClerkAuthGate><App /></ClerkAuthGate>
      </ClerkProvider>
    </React.StrictMode>,
  );
} else {
  // TEMP (build-out): no sign-in screen. Pin the app to the default school so
  // every module (which reads this key at load time) targets the same tenant
  // the API resolves when auth is off.
  localStorage.setItem('anyschool_current_school', DEFAULT_SCHOOL_ID);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

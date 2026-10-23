import { SignedIn, SignedOut, SignIn, useAuth, useClerk } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';

const API = '/api';

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const { getToken, orgId, orgSlug } = useAuth();
  const { setActive } = useClerk();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activationDone = useRef(false);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith(API)) return originalFetch(input, init);

      const token = await getToken();
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (orgSlug) headers.set('X-Clerk-Organization-Slug', orgSlug);
      return originalFetch(input, { ...init, headers });
    };
    return () => { window.fetch = originalFetch; };
  }, [getToken, orgSlug]);

  useEffect(() => {
    // One org per account, provisioned server-side. When the session has no
    // active organization yet, bootstrap creates (or reuses) the account's
    // single school org and hands back its id — we activate it and reload so
    // the next bootstrap carries the org claim and can provision the school row.
    setReady(false);
    setError(null);
    fetch(`${API}/auth/bootstrap`, { method: 'POST' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to set up this school');
        if (body.requiresActivation) {
          if (activationDone.current) throw new Error('Could not activate your school workspace. Please sign in again.');
          activationDone.current = true;
          await setActive({ organization: body.organizationId });
          window.location.reload();
          return;
        }
        const previous = localStorage.getItem('anyschool_current_school');
        localStorage.setItem('anyschool_current_school', body.schoolId);
        if (previous !== body.schoolId) {
          // Module-level SCHOOL_ID constants across the app were evaluated at
          // bundle load, before bootstrap stored this id. Reload once so every
          // module picks up the correct tenant (also covers org switches).
          window.location.reload();
          return;
        }
        setReady(true);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to set up this school'));
  }, [orgId]);

  if (error) return <div className="auth-container"><div className="auth-box"><h1>Setup failed</h1><p>{error}</p></div></div>;
  if (!ready) return <div className="auth-container"><div className="auth-box"><p>Setting up your school workspace…</p></div></div>;
  return <>{children}</>;
}

export default function ClerkAuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedOut>
        <div className="auth-container">
          <div className="auth-box">
            <img className="auth-logo" src="/logo.svg" alt="AnySchool" />
            <h1>Welcome to AnySchool</h1>
            <p>Sign in to manage your school.</p>
            <SignIn routing="hash" />
          </div>
        </div>
      </SignedOut>
      <SignedIn><SessionBootstrap>{children}</SessionBootstrap></SignedIn>
    </>
  );
}

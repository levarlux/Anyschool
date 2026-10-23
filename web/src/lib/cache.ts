// Cache utility with stale-while-revalidate pattern
// Every cached entry stores { data, version } where version is a server-provided marker.
// On load: render from cache immediately, then check version in background. If stale, refetch.
// Handles old cache format (raw data without version wrapper) for backwards compatibility.

const API = '/api';

export interface CacheEntry<T> {
  data: T;
  version: any;
  cachedAt: number;
}

export interface VersionMap {
  [entityType: string]: { count: number; lastUpdatedAt: string };
}

// Fetch version markers with timeout (cheap — just timestamps + counts)
export async function fetchVersions(schoolId: string): Promise<VersionMap | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API}/learners/version/${schoolId}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return data.versions || {};
    }
  } catch {}
  return null;
}

// Load from cache synchronously — handles both old format (raw) and new format ({ data, version })
export function loadCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // New format: has 'data' key
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return parsed as CacheEntry<T>;
    }
    // Old format: raw data directly — wrap it
    return { data: parsed as T, version: null, cachedAt: 0 };
  } catch {
    return null;
  }
}

// Save to cache with version marker
export function saveCache<T>(key: string, data: T, version: any): void {
  const entry: CacheEntry<T> = { data, version, cachedAt: Date.now() };
  const serialized = JSON.stringify(entry);
  try {
    localStorage.setItem(key, serialized);
    return;
  } catch (e) {
    // Quota exceeded — evict OTHER page caches (legacy keys first, then oldest),
    // retrying after each one. Without this, one full quota silently kills caching
    // for every page that hasn't written its key yet (it re-fetches forever).
    // Settings, field orders, school id and drafts are NOT cache entries — never touched.
    const candidates: { key: string; cachedAt: number; legacy: boolean }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('anyschool_') || k === key) continue;
      let parsed: any;
      try { parsed = JSON.parse(localStorage.getItem(k) || ''); } catch { continue; }
      if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) continue;
      candidates.push({ key: k, cachedAt: Number(parsed.cachedAt) || 0, legacy: /assessmentss/.test(k) });
    }
    candidates.sort((a, b) => (Number(b.legacy) - Number(a.legacy)) || (a.cachedAt - b.cachedAt));

    let lastErr: any = e;
    for (const c of candidates) {
      try { localStorage.removeItem(c.key); } catch {}
      try {
        localStorage.setItem(key, serialized);
        console.warn(`[cache] "${key}" saved after evicting "${c.key}" (localStorage quota)`);
        return;
      } catch (e2) { lastErr = e2; }
    }
    // Quota errors must be visible — silent failures made the learners page look "uncached"
    console.warn(`[cache] Failed to save "${key}" (likely QuotaExceededError):`, lastErr);
  }
}

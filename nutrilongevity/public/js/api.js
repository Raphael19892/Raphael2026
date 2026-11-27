// JSON API client + shared app state.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) { const e = new Error(data?.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

export const state = {
  user: null, profile: null, targets: null, plan: null, status: { ai: false },
  listeners: new Set(),
  set(patch) { Object.assign(this, patch); this.listeners.forEach((fn) => fn()); },
};

export async function loadMe() {
  const me = await api('/api/me');
  state.set({ user: me.user, profile: me.profile, targets: me.targets });
  return me;
}

export async function loadPlan() {
  const { plan } = await api('/api/plan/current');
  state.set({ plan });
  return plan;
}

let saveTimer = null;
export function savePlanDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (state.plan?.id) api(`/api/plan/${state.plan.id}`, { method: 'PUT', body: { plan: state.plan } }).catch(() => {}); }, 400);
}

/** Download the user's data (server version: the browser handles the attachment response). */
export async function exportData(format) {
  location.href = `/api/export?format=${format === 'csv' ? 'csv' : 'json'}`;
}

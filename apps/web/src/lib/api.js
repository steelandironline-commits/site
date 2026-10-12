// Thin fetch wrapper: same-origin cookies, CSRF header, safe error messages.

const BASE = import.meta.env.VITE_API_URL || '';

const DEFAULT_MESSAGES = {
  0: 'Sem conexão com o servidor. Verifique sua internet.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Não encontrado.',
  429: 'Muitas requisições. Aguarde um instante.',
  500: 'Não foi possível executar esta ação.',
};

export class ApiError extends Error {
  constructor(message, { status = 0, code, fields, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields || {};
    this.details = details;
  }
}

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

const listeners = new Set();
export function onUnauthorized(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function api(path, { method = 'GET', body, signal, quiet401 = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'autopix',
        // Audit hint only (never used for authorization).
        'X-AutoPix-Client': isStandalone() ? 'pwa' : 'web',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(DEFAULT_MESSAGES[0], { status: 0 });
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const e = data?.error || {};
    const message = e.message || DEFAULT_MESSAGES[res.status] || DEFAULT_MESSAGES[500];
    const error = new ApiError(message, { status: res.status, code: e.code, fields: e.fields, details: e.details });
    if (res.status === 401 && !quiet401) listeners.forEach((fn) => fn(error));
    throw error;
  }
  return data;
}

export const get = (path, opts) => api(path, opts);
export const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body: body ?? {} });
export const put = (path, body, opts) => api(path, { ...opts, method: 'PUT', body });
export const patch = (path, body, opts) => api(path, { ...opts, method: 'PATCH', body });
export const del = (path, opts) => api(path, { ...opts, method: 'DELETE' });

export const API_BASE = BASE;

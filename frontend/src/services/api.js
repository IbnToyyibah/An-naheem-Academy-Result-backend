const runtime = (typeof window !== 'undefined' && window.__APP_CONFIG__) ? window.__APP_CONFIG__ : {};
const API_URL = (runtime.VITE_API_URL || import.meta.env.VITE_API_URL || 'https://an-naheem-academy-result-backend.onrender.com/api').replace(/\/$/, '');
const FILE_URL = (runtime.VITE_FILE_URL || import.meta.env.VITE_FILE_URL || '').replace(/\/$/, '');

export function assetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;

  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (FILE_URL) {
    if (FILE_URL.endsWith('/uploads') && cleanPath.startsWith('/uploads')) {
      cleanPath = cleanPath.substring('/uploads'.length);
    }
    return `${FILE_URL}${cleanPath}`;
  }

  try {
    return `${new URL(API_URL, window.location.origin).origin}${cleanPath}`;
  } catch {
    return cleanPath;
  }
}

function redirectToLogin(role) {
  const target = role === 'parent' ? '/#/parent-login' : '/#/admin-login';
  if (window.location.hash !== target) window.location.assign(target);
}

async function safeParseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function api(path, options = {}) {
  const shouldRedirectOnAuthError = options.authRedirect !== false;
  const { authRedirect: _authRedirect, timeout: _timeout, ...fetchOptions } = options;
  const token = localStorage.getItem('token');
  const headers = fetchOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_URL}${path}`;
  const requestTimeout = typeof _timeout === 'number' ? _timeout : 15000;

  const makeFetch = async (signal) => {
    return fetch(url, {
      ...fetchOptions,
      headers: { ...headers, ...fetchOptions.headers },
      signal
    });
  };

  // Helper to perform fetch with AbortController and timeout
  const fetchWithTimeout = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout);
    try {
      const resp = await makeFetch(controller.signal);
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  let response;
  try {
    response = await fetchWithTimeout();
  } catch (err) {
    // Retry once for transient failures (not for explicit aborts)
    if (err && err.name === 'AbortError') {
      throw new Error(`Request to ${url} aborted after ${requestTimeout}ms`);
    }
    try {
      await new Promise(r => setTimeout(r, 500));
      response = await fetchWithTimeout();
    } catch (err2) {
      const msg = err2 && err2.message ? err2.message : 'Make sure the backend is running and CORS is configured.';
      throw new Error(`Cannot reach the server at ${API_URL}. ${msg}`);
    }
  }

  const data = await safeParseJson(response) || {};

  if (!response.ok) {
    if (shouldRedirectOnAuthError && (response.status === 401 || response.status === 403)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth:logout'));
      if (path.startsWith('/parent')) redirectToLogin('parent');
      else if (path.startsWith('/admin')) redirectToLogin('admin');
    }

    const message = data && data.message ? data.message : response.statusText || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}


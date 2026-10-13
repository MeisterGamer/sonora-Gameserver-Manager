const TOKEN_STORAGE_KEY = 'sonora_auth_token';

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {}
}

export async function apiRequest(url: string, method = 'GET', body?: unknown) {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const data = await response.json();
  if (response.status === 401) {
    setStoredAuthToken(null);
    window.dispatchEvent(new Event('sonora-login-required'));
  }
  if (!response.ok || data.success === false) {
    const error: any = new Error(data.error || data.message || 'Aktion fehlgeschlagen (HTTP ' + response.status + ')');
    error.needsSetup = data.needsSetup;
    throw error;
  }
  return data;
}

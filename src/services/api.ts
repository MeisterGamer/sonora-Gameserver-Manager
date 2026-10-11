export async function apiRequest(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, { method, credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (response.status === 401) window.dispatchEvent(new Event('sonora-login-required'));
  if (!response.ok || data.success === false) throw new Error(data.error || data.message || 'Aktion fehlgeschlagen (HTTP ' + response.status + ')');
  return data;
}

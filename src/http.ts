const CONNECT_MS = 5000;
const BODY_MS = 10000;

export async function fetchJson<T>(url: string): Promise<T> {
  const ac = new AbortController();
  const connectTimer = setTimeout(() => ac.abort(), CONNECT_MS + BODY_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(connectTimer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

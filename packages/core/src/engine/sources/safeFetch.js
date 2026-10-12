import dns from 'node:dns/promises';
import net from 'node:net';

const PRIVATE_V4 = [
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
  ['0.0.0.0', 8],
];

function v4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  const lower = ip.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('::ffff:');
}

/**
 * fetch() for untrusted public URLs: http(s) only, no private/internal hosts
 * (SSRF protection), bounded time and size, no credentials.
 */
export async function safeFetchText(url, { timeoutMs = 8000, maxBytes = 600_000, fetchImpl = globalThis.fetch, accept = 'text/html' } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('invalid url');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('blocked protocol');
  if (parsed.username || parsed.password) throw new Error('credentials in url');
  const { address } = await dns.lookup(parsed.hostname);
  if (isPrivateAddress(address)) throw new Error('blocked host');

  const res = await fetchImpl(parsed.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': 'TemPixBot/1.0 (+https://tempix.com.br/bot)', Accept: accept },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const reader = res.body?.getReader?.();
  if (!reader) return { text: (await res.text()).slice(0, maxBytes), url: res.url || parsed.toString() };
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    chunks.push(value);
    if (received >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return { text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'), url: res.url || parsed.toString() };
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

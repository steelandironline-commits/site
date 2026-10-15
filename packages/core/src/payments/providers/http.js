import https from 'node:https';

/**
 * fetch-compatible client with optional mutual TLS (client certificate),
 * required by Banco do Brasil in production. Returns { ok, status, headers, json(), text() }.
 */
export function createMtlsFetch({ certBase64, keyBase64, pfxBase64, passphrase }) {
  const identity = pfxBase64
    ? { pfx: Buffer.from(pfxBase64, 'base64'), passphrase: passphrase || '' }
    : { cert: Buffer.from(certBase64, 'base64'), key: Buffer.from(keyBase64, 'base64') };
  const agent = new https.Agent({ ...identity, keepAlive: true, minVersion: 'TLSv1.2' });
  return (url, { method = 'GET', headers = {}, body, signal } = {}) =>
    new Promise((resolve, reject) => {
      const req = https.request(url, { method, headers, agent, signal }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: { get: (k) => res.headers[k.toLowerCase()] },
            text: async () => text,
            json: async () => (text ? JSON.parse(text) : {}),
          });
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
}

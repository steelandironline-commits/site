import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';

/**
 * Public intermediate of BB's mTLS hosts (*.mtls.api.bb.com.br). Added to the
 * default roots so the connection verifies even when the server omits it from
 * its chain. Verification stays on: the intermediate chains to DigiCert Global
 * Root G2, already a trusted root.
 */
const BB_INTERMEDIATES = fs.readFileSync(new URL('./certs/bb-mtls-intermediate.pem', import.meta.url), 'utf8');

/**
 * fetch-compatible client with optional mutual TLS (client certificate),
 * required by Banco do Brasil in production. Returns { ok, status, headers, json(), text() }.
 */
export function createMtlsFetch({ certBase64, keyBase64, pfxBase64, passphrase, extraCa = BB_INTERMEDIATES }) {
  const identity = pfxBase64
    ? { pfx: Buffer.from(pfxBase64, 'base64'), passphrase: passphrase || '' }
    : { cert: Buffer.from(certBase64, 'base64'), key: Buffer.from(keyBase64, 'base64') };
  const agent = new https.Agent({ ...identity, ca: [...tls.rootCertificates, extraCa], keepAlive: true, minVersion: 'TLSv1.2' });
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

// Minimal structured logger with secret redaction. Never pass passwords or
// raw tokens here; redaction is a second line of defence, not the first.

const REDACT = /(password|passwordHash|token|secret|authorization|cookie|accessToken|qr_code|pixCopyPaste)/i;

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 4) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function write(level, msg, meta) {
  if (process.env.NODE_ENV === 'test' && level !== 'error' && !process.env.DEBUG_LOGS) return;
  const line = { level, time: new Date().toISOString(), msg, ...(meta ? redact(meta) : {}) };
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  debug: (msg, meta) => process.env.DEBUG_LOGS && write('debug', msg, meta),
};

/** Normalize a Brazilian/international phone to digits with country code. */
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`; // BR without country code
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

/**
 * WhatsApp sometimes reports Brazilian mobiles without the extra "9"
 * (wa_id 55 DD 8 digits). Return both forms so lookups match either.
 */
export function phoneVariants(input) {
  const d = normalizePhone(input);
  if (!d) return [];
  const set = new Set([d]);
  if (d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9 && rest.startsWith('9')) set.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) set.add(`55${ddd}9${rest}`);
  }
  return [...set];
}

export function maskPhone(d) {
  if (!d) return '';
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} •••••-${d.slice(-4)}`;
}

// Minimal EMV® QRCPS (BR Code) payload builder, used by the mock provider so
// the development checkout renders a structurally valid "Pix copia e cola".

function tlv(id, value) {
  const v = String(value);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function clean(value, max) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, '')
    .toUpperCase()
    .slice(0, max);
}

export function buildBrCode({ key, amount, merchantName, merchantCity, txid, description }) {
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', key) + (description ? tlv('02', clean(description, 40)) : '');
  const payload =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', Number(amount).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', clean(merchantName, 25)) +
    tlv('60', clean(merchantCity, 15)) +
    tlv('62', tlv('05', clean(txid, 25).replace(/[^A-Z0-9]/g, '') || '***')) +
    '6304';
  return payload + crc16(payload);
}

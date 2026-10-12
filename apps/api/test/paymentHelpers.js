export { disconnectPrisma, getPaymentProvider } from '@autopix/core';
import { crc16 } from '@autopix/core/payments/brcode.js';

export function crc16Check(brcode) {
  return crc16(brcode.slice(0, -4)) === brcode.slice(-4);
}

import { getConfig } from '../config.js';
import { CloudApiWhatsAppProvider, parseCloudWebhook } from './CloudApiWhatsAppProvider.js';
import { MockWhatsAppProvider, DisabledWhatsAppProvider } from './MockWhatsAppProvider.js';

export { WhatsAppProvider, decisionPayload, parseDecisionPayload, commandPayload, parseCommandPayload } from './WhatsAppProvider.js';
export { CloudApiWhatsAppProvider, parseCloudWebhook, MockWhatsAppProvider, DisabledWhatsAppProvider };
export { normalizePhone, phoneVariants, maskPhone } from './phone.js';

let instance;
export function getWhatsAppProvider(config = getConfig()) {
  if (instance) return instance;
  const w = config.whatsapp;
  const common = { templates: w.templates, appUrl: config.appUrl };
  if (w.provider === 'cloud') instance = new CloudApiWhatsAppProvider({ ...w, ...common });
  else if (w.provider === 'mock') instance = new MockWhatsAppProvider({ secret: config.payment.webhookSecret || config.secrets.session, ...common });
  else instance = new DisabledWhatsAppProvider(common);
  return instance;
}

export function resetWhatsAppProvider() {
  instance = undefined;
}

// Contato da vaga: telefone brasileiro (WhatsApp quando é celular) e e-mail, lidos do texto ou de um
// campo da fonte, e os links wa.me e mailto:. Funções puras.

/** DDDs em uso no Brasil. Evita tomar por telefone um número qualquer de dez ou onze dígitos. */
const DDDS = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '),
);

// DDD (com ou sem parênteses), 4 ou 5 dígitos, 4 dígitos, com prefixo +55 opcional. Não pode começar nem
// terminar colado em outro dígito (CEP, CNPJ, protocolo e datas não passam).
const PHONE_RE = /(?<![\d])(?:\+?\s*55[\s.-]*)?\(?\s*(\d{2})\s*\)?[\s.-]*(9?\d{4})[\s.-]?(\d{4})(?![\d])/g;

/**
 * Telefones do texto, sem repetição. Celular (nove dígitos começando por 9) pode ter WhatsApp.
 * @returns {{ ddd: string, local: string, mobile: boolean, number: string, display: string }[]}
 */
export function extractPhones(text) {
  const found = [];
  const seen = new Set();
  for (const match of String(text ?? '').matchAll(PHONE_RE)) {
    const [, ddd, head, tail] = match;
    if (!DDDS.has(ddd)) continue;
    const local = `${head}${tail}`;
    const mobile = local.length === 9 && local[0] === '9';
    // Oito dígitos é telefone fixo (2 a 5) ou celular antigo (6 a 9): sem o nono dígito, o WhatsApp não é garantido.
    if (local.length === 8 && !/^[2-9]/.test(local)) continue;
    const number = `${ddd}${local}`;
    if (seen.has(number)) continue;
    seen.add(number);
    const display = mobile ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}` : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
    found.push({ ddd, local, mobile, number, display });
  }
  return found;
}

const EMAIL_RE = /(?<![\w.+-])[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?![\w-])/gi;
const FILE_EXTENSIONS = /\.(?:png|jpe?g|gif|svg|webp|bmp|ico|pdf|docx?|xlsx?|css|js)$/i;

/** E-mails do texto em minúsculas, sem repetição. */
export function extractEmails(text) {
  const out = [];
  for (const match of String(text ?? '').matchAll(EMAIL_RE)) {
    const email = match[0].toLowerCase().replace(/\.+$/, '');
    if (email.length > 254 || FILE_EXTENSIONS.test(email) || !/\.[a-z]{2,}$/.test(email)) continue;
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/** Provedores de e-mail gratuito: um e-mail deles não prova que a vaga é de uma empresa. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.com.br', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com', 'globomail.com',
  'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'zipmail.com.br', 'oi.com.br', 'r7.com',
]);

/** O e-mail é de domínio próprio (não é de um provedor gratuito)? */
export function isOwnDomainEmail(email) {
  const domain = String(email ?? '').toLowerCase().split('@')[1];
  return Boolean(domain) && !FREE_MAIL.has(domain);
}

/**
 * Contato de uma vaga a partir de um ou mais textos (descrição, campos de telefone e e-mail da fonte).
 * @param {(string|null|undefined)|(string|null|undefined)[]} texts
 * @returns {{ whatsapp: string|null, phone: string|null, email: string|null, emailOwnDomain: boolean }}
 *  `whatsapp` vem pronto para wa.me: "55" + DDD + número. `phone` é um fixo, sem WhatsApp (DDD + número).
 */
export function extractContacts(texts) {
  const text = (Array.isArray(texts) ? texts : [texts]).filter((t) => typeof t === 'string' && t).join('\n');
  const phones = extractPhones(text);
  const mobile = phones.find((p) => p.mobile);
  const landline = phones.find((p) => !p.mobile);
  const emails = extractEmails(text);
  const email = emails.find(isOwnDomainEmail) ?? emails[0] ?? null;
  return {
    whatsapp: mobile ? `55${mobile.number}` : null,
    phone: landline ? landline.number : null,
    email,
    emailOwnDomain: email ? isOwnDomainEmail(email) : false,
  };
}

/** "(47) 99999-8888" a partir de DDD + número, com ou sem o 55 na frente. Devolve null para número fora do formato. */
export function formatPhone(number) {
  const digits = String(number ?? '').replace(/\D/g, '');
  const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length !== 10 && local.length !== 11) return null;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  const cut = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/** https://wa.me/55DDDNUMERO, com texto de abertura opcional. Devolve null para número fora do formato. */
export function whatsappLink(number, message) {
  if (!/^55\d{10,11}$/.test(String(number ?? ''))) return null;
  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** mailto: com assunto e corpo opcionais. Devolve null para e-mail fora do formato. */
export function mailtoLink(email, { subject, body } = {}) {
  const address = String(email ?? '').toLowerCase();
  if (extractEmails(address)[0] !== address) return null;
  const query = [subject ? `subject=${encodeURIComponent(subject)}` : null, body ? `body=${encodeURIComponent(body)}` : null].filter(Boolean).join('&');
  return query ? `mailto:${address}?${query}` : `mailto:${address}`;
}

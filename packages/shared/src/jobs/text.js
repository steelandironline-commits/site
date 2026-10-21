// Texto de vaga: comparação sem acento e limpeza do que vem de fontes externas.

/** Minúsculas, sem acentos e com espaços simples. Serve para comparar palavras-chave. */
export function foldText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ordm: 'º', ordf: 'ª', ccedil: 'ç', Ccedil: 'Ç' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }
    return Object.hasOwn(ENTITIES, body) ? ENTITIES[body] : whole;
  });
}

/**
 * Texto puro de um trecho HTML vindo de uma fonte externa (nunca confiável): tira marcações, scripts e
 * estilos, troca quebras de bloco por quebra de linha e decodifica as entidades mais comuns. O resultado
 * é texto: quem o mostra deve inseri-lo como texto, nunca como HTML.
 */
export function htmlToText(value, { maxLength = 8000 } = {}) {
  let text = String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*(?:p|div|ul|ol|h[1-6]|tr)\b[^>]*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, ' ');
  text = decodeEntities(decodeEntities(text));
  // Nada de caracteres de controle (menos a quebra de linha) nem marcação que a decodificação tenha revelado.
  text = text
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/** Uma linha só (título, nome de empresa, cidade): sem quebras, sem marcação, com tamanho limitado. */
export function cleanLine(value, maxLength = 200) {
  const line = htmlToText(value, { maxLength: maxLength * 2 }).replace(/\s+/g, ' ').trim();
  return line.length > maxLength ? `${line.slice(0, maxLength - 1).trimEnd()}…` : line;
}

/** Só endereços http(s): `javascript:`, `data:` e afins nunca viram link. Devolve a URL normalizada ou null. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

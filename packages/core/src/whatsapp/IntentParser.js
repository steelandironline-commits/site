import { z } from 'zod';
import { fold } from '@autopix/shared';

export const INTENTS = [
  'CREATE_PIX',
  'SEARCH_FREIGHT',
  'CREATE_WORKFORCE_DEMAND',
  'LIST_TODAY_OPPORTUNITIES',
  'GET_OPEN_PIPELINE_VALUE',
  'CONFIRM',
  'CANCEL',
  'HELP',
  'UNKNOWN',
];

/** Structured intent contract — the ONLY thing any parser (incl. an LLM) may produce. */
export const intentSchema = z.object({
  intent: z.enum(INTENTS),
  params: z
    .object({
      amountCents: z.number().int().positive().optional(),
      description: z.string().max(140).optional(),
      origin: z.string().max(80).optional(),
      destination: z.string().max(80).optional(),
      date: z.string().datetime().optional(),
      role: z.string().max(80).optional(),
      quantity: z.number().int().positive().max(200).optional(),
    })
    .default({}),
  confidence: z.number().min(0).max(1).default(0.5),
});

const NUMBER_WORDS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12, quinze: 15, vinte: 20 };
const WEEKDAYS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

/** Parse "1400", "1.400", "1.400,50", "R$ 1400", "2 mil", "1,5 mil" → cents. */
export function parseAmountCents(text) {
  const t = fold(text);
  const mil = /(\d+(?:[.,]\d+)?)\s*mil\b/.exec(t);
  if (mil) return Math.round(Number(mil[1].replace(',', '.')) * 1000 * 100);
  const m = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+\.\d{1,2})(?!\d)/.exec(t.replace(/(\d)\s+(\d{3})\b/g, '$1$2'));
  if (!m) return null;
  let raw = m[1];
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
  else raw = raw.replace(',', '.');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

/** Brazil-local date words → ISO (08:00 America/Sao_Paulo ≈ 11:00Z). */
export function parseDate(text, now = new Date()) {
  const t = fold(text);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0));
  const addDays = (n) => new Date(base.getTime() + n * 86_400_000).toISOString();
  if (/depois de amanha/.test(t)) return addDays(2);
  if (/\bamanha\b/.test(t)) return addDays(1);
  if (/\bhoje\b/.test(t)) return addDays(0);
  const dm = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (dm) {
    const year = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : base.getUTCFullYear();
    const d = new Date(Date.UTC(year, Number(dm[2]) - 1, Number(dm[1]), 11));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}(-feira)?\\b`).test(t)) {
      let diff = (dow - base.getUTCDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return addDays(diff);
    }
  }
  return undefined;
}

function singular(word) {
  if (/oes$/.test(word)) return word.replace(/oes$/, 'or').replace(/dor$/, 'dor');
  if (/ores$/.test(word)) return word.replace(/es$/, '');
  if (/eis$/.test(word)) return word.replace(/eis$/, 'el');
  if (/is$/.test(word)) return word.replace(/is$/, 'l');
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
/** "são paulo" → "São Paulo" (Unicode-safe; keeps prepositions lowercase). */
const titleCase = (s) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** Deterministic Portuguese intent parser (default). */
export class RuleBasedIntentParser {
  async parse(text) {
    const raw = String(text || '').trim();
    const t = fold(raw);
    if (!t) return { intent: 'UNKNOWN', params: {}, confidence: 0 };
    if (/^(sim|s|confirmo|confirmar|confirma|ok|pode|isso)\b/.test(t)) return { intent: 'CONFIRM', params: {}, confidence: 0.95 };
    if (/^(nao|n|cancelar|cancela|cancele|pare)\b/.test(t)) return { intent: 'CANCEL', params: {}, confidence: 0.95 };

    if (/\bpix\b/.test(t) || /\bcobranca\b/.test(t)) {
      const amountCents = parseAmountCents(raw);
      const desc = /\b(?:para|referente a|ref\.?)\s+(.{3,80})$/.exec(raw)?.[1];
      return { intent: 'CREATE_PIX', params: { ...(amountCents ? { amountCents } : {}), ...(desc && !/\d/.test(desc) ? { description: desc } : {}) }, confidence: amountCents ? 0.9 : 0.6 };
    }

    if (/\b(carga|cargas|frete|fretes)\b/.test(t)) {
      const route = /\bde\s+(.+?)\s+(?:para|pra|at[ée]|a)\s+(.+?)(?:\s+(?:hoje|amanh[ãa]|depois|na|no|dia|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|\d{1,2}\/)|[,.!?]|$)/i.exec(raw);
      const params = {};
      if (route) {
        params.origin = titleCase(route[1].trim());
        params.destination = titleCase(route[2].trim());
      }
      const date = parseDate(raw);
      if (date) params.date = date;
      return { intent: 'SEARCH_FREIGHT', params, confidence: route ? 0.9 : 0.5 };
    }

    const work = /\b(?:preciso de|precisamos de|preciso|quero|contratar|procuro)\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|doze|quinze|vinte)\s+([a-zÀ-ſ]+)/.exec(t);
    if (work) {
      const quantity = /^\d+$/.test(work[1]) ? Number(work[1]) : NUMBER_WORDS[work[1]];
      const params = { quantity, role: titleCase(singular(work[2])) };
      const date = parseDate(raw);
      if (date) params.startDate = date;
      return { intent: 'CREATE_WORKFORCE_DEMAND', params, confidence: 0.85 };
    }

    if (/oportunidade/.test(t)) return { intent: 'LIST_TODAY_OPPORTUNITIES', params: {}, confidence: 0.8 };
    if (/(quanto|valor|total).*(aberto|negocio|pipeline|funil)/.test(t)) return { intent: 'GET_OPEN_PIPELINE_VALUE', params: {}, confidence: 0.85 };
    if (/^(oi|ola|ajuda|menu|help|bom dia|boa tarde|boa noite)\b/.test(t)) return { intent: 'HELP', params: {}, confidence: 0.9 };
    return { intent: 'UNKNOWN', params: {}, confidence: 0 };
  }
}

/**
 * LLM boundary. `generate(prompt) → string` is injected (any provider).
 * The model can only PROPOSE a structured intent; the output is validated
 * against `intentSchema`, and every state change still goes through the
 * ActionEngine (authorization, confirmation, audit). On any doubt we fall
 * back to the deterministic parser.
 */
export class LlmIntentParser {
  constructor({ generate, fallback = new RuleBasedIntentParser() }) {
    if (typeof generate !== 'function') throw new Error('LlmIntentParser requires a generate(prompt) function');
    this.generate = generate;
    this.fallback = fallback;
  }

  prompt(text) {
    return [
      'Você classifica mensagens de WhatsApp de empresas brasileiras para o AutoPix.',
      `Responda APENAS um JSON com {"intent": one of ${JSON.stringify(INTENTS)}, "params": {...}, "confidence": 0..1}.`,
      'params possíveis: amountCents (inteiro, centavos), description, origin, destination, date (ISO 8601), role, quantity.',
      'Nunca invente valores ausentes. Mensagem:',
      JSON.stringify(String(text).slice(0, 500)),
    ].join('\n');
  }

  async parse(text) {
    try {
      const out = await this.generate(this.prompt(text));
      const json = JSON.parse(String(out).replace(/^```(?:json)?|```$/g, '').trim());
      const parsed = intentSchema.safeParse(json);
      if (parsed.success && parsed.data.confidence >= 0.6) return parsed.data;
    } catch {
      /* fall through */
    }
    return this.fallback.parse(text);
  }
}

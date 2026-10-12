import { z } from 'zod';
import { isValidCnpj, onlyDigits } from './format.js';

const trimmed = (max) => z.string().trim().max(max);
const optionalText = (max) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v));

const tagList = (maxItems = 30, maxLen = 80) =>
  z
    .array(z.string().trim().min(1).max(maxLen))
    .max(maxItems)
    .transform((list) => Array.from(new Set(list.map((s) => s.trim()).filter(Boolean))));

const money = z.coerce.number().int().min(0).max(1_000_000_000);

const urlish = z
  .union([z.string().trim().max(300), z.null()])
  .optional()
  .transform((v) => {
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  })
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.hostname.includes('.');
    } catch {
      return false;
    }
  }, 'URL inválida');

export const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido').max(254);

export const passwordSchema = z
  .string()
  .min(10, 'A senha precisa ter pelo menos 10 caracteres')
  .max(200, 'Senha muito longa')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letras e números');

export const cnpjSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v ? onlyDigits(v) : null))
  .refine((v) => !v || isValidCnpj(v), 'CNPJ inválido');

/** Full editable company profile (used by onboarding steps and /app/company). */
export const companyProfileSchema = z.object({
  name: trimmed(120).min(2, 'Informe o nome da empresa'),
  cnpj: cnpjSchema,
  website: urlish,
  instagram: optionalText(80).transform((v) => (v ? v.replace(/^@/, '') : v)),
  phone: optionalText(30),
  city: optionalText(80),
  state: optionalText(2).transform((v) => (v ? v.toUpperCase() : v)),
  serviceLocations: tagList(20),
  serviceRadiusKm: z.coerce.number().int().min(0).max(5000).nullable().optional(),
  description: optionalText(2000),
  products: tagList(),
  services: tagList(),
  idealCustomer: optionalText(1000),
  averageTicket: money.nullable().optional(),
  minimumDeal: money.nullable().optional(),
  preferredIndustries: tagList(),
  excludedIndustries: tagList(),
  keywords: tagList(40),
});

export const companyUpdateSchema = companyProfileSchema.partial();

export const onboardingStartSchema = z
  .object({
    accountType: z.enum(['COMPANY', 'PERSON']).default('COMPANY'),
    name: trimmed(120).min(2, 'Informe seu nome'),
    email: emailSchema,
    companyName: z.string().trim().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.accountType === 'COMPANY' && (!v.companyName || v.companyName.length < 2)) {
      ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Informe o nome da empresa' });
    }
  });

export const onboardingStepSchema = z.object({
  step: z.coerce.number().int().min(0).max(20),
  data: companyUpdateSchema,
  complete: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha').max(200),
});

export const activateSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const opportunityUpdateSchema = z
  .object({
    status: z.enum(['NEW', 'RESEARCHING', 'CONTACTED', 'INTERESTED', 'PROPOSAL', 'WON', 'LOST', 'ARCHIVED']).optional(),
    notes: z.union([z.string().max(10_000), z.null()]).optional(),
    generateApproach: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar');

export const opportunityQuerySchema = z.object({
  status: z.enum(['NEW', 'RESEARCHING', 'CONTACTED', 'INTERESTED', 'PROPOSAL', 'WON', 'LOST', 'ARCHIVED']).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['recent', 'score', 'value']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const activityQuerySchema = z.object({
  type: z.enum(['SEARCH', 'RESEARCH', 'SIGNAL', 'OPPORTUNITY', 'AGENT', 'SYSTEM', 'PAYMENT']).optional(),
  q: z.string().trim().max(120).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

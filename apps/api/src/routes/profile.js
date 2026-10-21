import { Router } from 'express';
import { z } from 'zod';
import { companyProfileSchema, jobSearchFields } from '@autopix/shared';
import { requireAuth, requireRole } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

/**
 * Corpo do PUT: o subconjunto do perfil de empresa que uma pessoa preenche. Cada campo vem da mesma
 * definição de companyProfileSchema, então a regra de validação é uma só. Não tem CNPJ, produtos,
 * cliente ideal, ticket, setores nem palavras-chave: o que vier a mais é descartado.
 * Mais os campos de vagas: workArea (slug da lista), jobTitle (até 80) e contactPreference (WHATSAPP ou EMAIL).
 */
export const profileUpdateSchema = companyProfileSchema
  .pick({ phone: true, postalCode: true, city: true, state: true, serviceRadiusKm: true, description: true, services: true, operationalProfile: true })
  .extend({ name: z.string().trim().max(120).min(2, 'Informe seu nome'), ...jobSearchFields })
  .partial();

/**
 * Perfil da pessoa física (ETAPA 5), só na área CPF: lê e grava o perfil da conta PERSON com a
 * mesma regra de CompanyService (/api/company é da empresa e não existe no host CPF).
 *
 *   GET /api/profile   { profile }
 *   PUT /api/profile   { profile, changed }
 *
 * O perfil devolvido tem só os campos de PROFILE_FIELDS (mais o CPF mascarado): nada de cobrança,
 * comissão, assinatura, equipe nem de chave Pix de repasse. Conta que não é PERSON recebe o mesmo
 * 404 de uma rota inexistente, inclusive no modo legado (onde a guarda de área não bloqueia).
 */
export function profileRoutes({ companies }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    res.json({ profile: await companies.getProfile(req.user.id) });
  });

  r.put('/', requireRole('OWNER', 'ADMIN'), async (req, res) => {
    res.json(await companies.updateProfile(req.user.id, parse(profileUpdateSchema, req.body)));
  });

  return r;
}

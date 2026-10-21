// Vagas de demonstração (DEMO_MODE=true). Título e empresa começam por "(DEMO)", a fonte é DEMO e a página mostra a
// faixa "Dados de demonstração". Em produção (DEMO_MODE=false) este arquivo nunca é usado: JobService só o monta
// com demoMode ligado. Tudo é fictício: empresas, telefones (sem DDD real em uso) e links (domínio reservado .example).
const DAY = 24 * 60 * 60 * 1000;

const long =
  'Atividades: acompanhar a rotina da área, registrar o que foi feito, cumprir os procedimentos de segurança e trabalhar em equipe. ' +
  'Requisitos: experiência comprovada na função, disponibilidade de horário e vontade de aprender. Benefícios: vale-refeição e plano de saúde. ';

/** [id, título, empresa, cidade, UF, descrição, dias desde a publicação, dias até o prazo ou null, salário, contato] */
const DEMO_JOBS = [
  ['demo-1', 'Soldador MIG/MAG', 'Metalúrgica Exemplo', 'Joinville', 'SC', `Soldagem de estruturas metálicas. Salário: R$ 3.200 a R$ 3.800 por mês. ${long} Contato: (47) 90000-0001 ou rh@metalurgica-demo.example`, 2, 18, null, null],
  ['demo-2', 'Eletricista Industrial', 'Indústria Modelo', 'Blumenau', 'SC', `Manutenção elétrica em painéis e motores. ${long} Enviar currículo para vagas@industria-demo.example`, 5, 12, { min: 3500, max: 4200, period: 'MES' }, null],
  ['demo-3', 'Mecânico de Manutenção Industrial', 'Oficina Central Exemplo', 'Curitiba', 'PR', `Manutenção preventiva e corretiva de máquinas. ${long} WhatsApp (41) 90000-0002`, 1, null, { min: 2800, max: 3400, period: 'MES' }, null],
  ['demo-4', 'Pedreiro', 'Construtora Horizonte Exemplo', 'Florianópolis', 'SC', `Obra residencial, alvenaria e acabamento. Pagamento de R$ 180,00 por dia. ${long} (48) 90000-0003`, 8, 30, null, null],
  ['demo-5', 'Motorista Carreteiro', 'Transportes Exemplo', 'Itajaí', 'SC', `Rotas regionais com carreta, CNH E. ${long} Falar no (47) 90000-0004 ou transportes@transp-demo.example`, 3, 25, { min: 4200, max: 5000, period: 'MES' }, null],
  ['demo-6', 'Operador de Empilhadeira', 'Logística Exemplo', 'Joinville', 'SC', `Movimentação de cargas em centro de distribuição, curso de operador exigido. ${long} rh@logistica-demo.example`, 0, 10, null, null],
  ['demo-7', 'Técnico de Enfermagem', 'Clínica Exemplo', 'São Paulo', 'SP', `Plantão 12x36 em clínica de médio porte. ${long} Contato: (11) 90000-0005`, 6, 15, { min: 2600, max: 3000, period: 'MES' }, null],
  ['demo-8', 'Vendedor Interno', 'Loja Exemplo', 'Porto Alegre', 'RS', 'Atendimento e vendas em loja de materiais de construção. Salário fixo R$ 1.900 por mês mais comissão. Interessados devem comparecer à loja.', 4, null, null, null],
  ['demo-9', 'Auxiliar Administrativo', 'Escritório Exemplo', 'Belo Horizonte', 'MG', 'Rotinas administrativas e atendimento ao público. Enviar currículo pelo site da empresa.', 9, 20, null, null],
  ['demo-10', 'Auxiliar de Limpeza', 'Serviços Exemplo', 'Campinas', 'SP', 'Limpeza e conservação em condomínio. Salário de R$ 1.650 por mês. Atenção: para garantir a vaga é preciso pagar uma taxa de inscrição de R$ 50 por Pix antecipado. Renda extra garantida!', 1, 7, null, null],
  ['demo-11', 'Trabalhe de casa', 'Oportunidade Fácil Exemplo', 'Qualquer cidade', 'SP', 'Renda extra: ganhe R$ 300 por dia sem experiência, trabalhando de casa. Cadastro pago.', 0, null, null, null],
  ['demo-12', 'Desenvolvedor Web Júnior', 'Software House Exemplo', 'Recife', 'PE', `Desenvolvimento web com JavaScript. ${long} Contato: rh@software-demo.example`, 7, 14, { min: 4000, max: 5500, period: 'MES' }, null],
];

export class DemoJobSource {
  name = 'DEMO';

  /** As vagas de demonstração em relação a `now` (a data de publicação anda com o relógio, o id não muda). */
  list(now = new Date()) {
    return DEMO_JOBS.map(([id, title, company, city, state, description, postedDaysAgo, deadlineDays, salary]) => ({
      externalId: id,
      title: `(DEMO) ${title}`,
      company: company ? `(DEMO) ${company}` : undefined,
      city,
      state,
      description,
      sourceUrl: `https://vagas.demo.example/${id}`,
      postedAt: new Date(now.getTime() - postedDaysAgo * DAY - 3 * 60 * 60 * 1000),
      expiresAt: deadlineDays === null ? null : new Date(now.getTime() + deadlineDays * DAY + 60 * 60 * 1000),
      salary,
      contactText: [],
    }));
  }
}

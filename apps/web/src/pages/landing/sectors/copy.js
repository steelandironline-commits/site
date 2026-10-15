/**
 * Home copy for the sector sections (pt-BR). One object per section so a
 * locale file can replace it later. Visual examples are illustrative.
 */
const onboarding = (q) => `/onboarding?tipo=empresa&${q}`;

export const ECOSYSTEM = {
  eyebrow: 'Ecossistema',
  title: 'Sua empresa trabalha. O TemPix procura oportunidades.',
  body: 'Quem precisa encontra quem fornece. Quem fornece encontra quem precisa. Da estrada ao porto, da máquina à obra.',
  hub: 'TemPix',
  hubSub: 'intermedeia',
  nodes: [
    { id: 'industrias', label: 'Indústrias', icon: 'factory' },
    { id: 'transportadoras', label: 'Transportadoras', icon: 'truck' },
    { id: 'caminhoneiros', label: 'Caminhoneiros', icon: 'route' },
    { id: 'terminais', label: 'Terminais', icon: 'container' },
    { id: 'navios', label: 'Navios', icon: 'ship' },
    { id: 'fornecedores', label: 'Fornecedores', icon: 'store' },
    { id: 'compradores', label: 'Compradores', icon: 'cart' },
    { id: 'prestadores', label: 'Prestadores', icon: 'wrench' },
    { id: 'obras', label: 'Obras', icon: 'hardhat' },
    { id: 'maquinas', label: 'Máquinas e equipamentos pesados', icon: 'crane' },
  ],
};

export const MARITIME = {
  eyebrow: 'TemPix Marítimo',
  title: 'Navios também precisam de quem resolva.',
  body: 'O TemPix intermedeia demandas marítimas e portuárias, conectando compradores a empresas capazes de fornecer peças, manutenção, transporte, suprimentos e serviços.',
  positioning: 'Rede de oportunidades, compradores e fornecedores para operações marítimas e portuárias. O TemPix não atua como agente marítimo.',
  cta: { label: 'Quero fornecer para operações marítimas', to: onboarding('operacao=fornecedor_maritimo&objetivo=fornecer_maritimo') },
  ctaAlt: { label: 'Preciso encontrar um fornecedor', to: onboarding('objetivo=encontrar_fornecedores') },
  flow: [
    { title: 'Navio', sub: 'Chegada ao porto', icon: 'ship' },
    { title: 'Necessidade do comprador', sub: 'Peça · Reparo · Transporte · Suprimento · Serviço', icon: 'clipboard' },
    { title: 'TemPix', sub: 'Intermedeia fornecedores compatíveis', icon: 'tempix' },
    { title: 'Empresas', sub: 'Recebem a oportunidade', icon: 'store' },
    { title: 'Cotações', sub: 'Comprador compara propostas', icon: 'scale' },
    { title: 'Contrato', sub: 'Execução e pagamento', icon: 'handshake' },
  ],
  services: ['Usinagem', 'Soldagem', 'Caldeiraria', 'Elétrica', 'Hidráulica', 'Bombas', 'Motores', 'Válvulas', 'Peças industriais', 'Ferramentas', 'Suprimentos', 'EPI', 'Transporte', 'Caminhões', 'Guindastes', 'Munck', 'Inspeção', 'Limpeza', 'Manutenção emergencial', 'Alimentação', 'Água', 'Logística'],
  opportunity: {
    kicker: 'Oportunidade marítima',
    title: 'Usinagem emergencial para um navio atracado',
    rows: [
      ['Comprador', 'Operação portuária'],
      ['Navio', 'Operação portuária'],
      ['Local', 'Santos/SP'],
      ['Necessidade', 'Usinagem emergencial'],
      ['Prazo', '8 horas'],
      ['Categoria', 'Manutenção industrial'],
    ],
    status: 'Buscando fornecedores',
    detail: 'Eixo Ø500 × 1.500 mm para reparo a bordo. O TemPix procura empresas com torno compatível, atendimento emergencial e acesso ao porto de Santos, e organiza as cotações para o comprador.',
  },
  chainTitle: 'Da estrada ao porto, sem sistemas separados',
  chains: {
    export: { label: 'Para o navio', steps: ['Transportadora', 'Terminal', 'Porto', 'Navio'] },
    import: { label: 'Do navio', steps: ['Navio', 'Terminal', 'Transportadora', 'Destino'] },
  },
  chainNote: 'O TemPix conecta os participantes e intermedeia as oportunidades entre compradores, fornecedores e prestadores.',
};

export const CONSTRUCTION = {
  eyebrow: 'Obras, máquinas e equipamentos pesados',
  title: 'Máquinas, equipes e equipamentos para fazer acontecer.',
  body: 'Do munck à soldagem, da preparação do terreno à montagem da estrutura: encontre fornecedores, empresas e profissionais capazes de fornecer ou executar.',
  tagline: 'Do comprador ao fornecedor. Da máquina à obra.',
  cta: { label: 'Quero oferecer meus equipamentos', to: onboarding('operacao=locacao_maquinas&objetivo=oferecer_equipamentos') },
  ctaAlt: { label: 'Preciso contratar uma equipe ou equipamento', to: onboarding('operacao=construtora_contratante&objetivo=contratar_equipamentos,contratar_equipes') },
  ctaExtra: { label: 'Quero encontrar compradores para meu equipamento', to: onboarding('operacao=fornecedor_equipamentos&objetivo=encontrar_compradores,comprar_vender_equipamentos') },
  legend: [
    { label: 'Munck içando a tesoura', color: '#ffb35c' },
    { label: 'Britadeira em área isolada', color: '#f2b134' },
    { label: 'Soldador com EPI completo', color: '#5fe39a' },
  ],
  sceneAlt:
    'Obra de montagem de galpão em 2.5D: um munck chega pela via, abre as sapatas, ergue a lança e iça uma tesoura metálica até assentá-la nos pilares, guiado por um sinaleiro; ao lado, um soldador com máscara trabalha numa viga sobre cavaletes, um trabalhador quebra o piso com britadeira numa área isolada por cones e fita, e uma escavadeira abre uma vala.',
  flows: {
    buyer: {
      label: 'Quem contrata',
      steps: [
        { title: 'Comprador / obra', sub: 'Descreve a necessidade' },
        { title: 'Fornecedores de máquinas', sub: 'Locadoras e proprietários compatíveis' },
        { title: 'Munck, guindaste ou máquina', sub: 'Com a capacidade certa' },
        { title: 'Profissionais e empresas', sub: 'Operadores, soldagem, montagem' },
        { title: 'Execução', sub: 'Mobilização e obra' },
        { title: 'Pagamento', sub: 'Assegurado até a conclusão' },
      ],
    },
    supplier: {
      label: 'Quem fornece',
      steps: [
        { title: 'Fornecedor de equipamento', sub: 'Cadastra capacidade, região e disponibilidade' },
        { title: 'TemPix', sub: 'Encontra compradores e obras compatíveis' },
        { title: 'Oportunidades', sub: 'Chegam no painel e no WhatsApp' },
        { title: 'Cotações', sub: 'Proposta direto ao comprador' },
        { title: 'Contratação', sub: 'Contrato e pagamento pelo TemPix' },
      ],
    },
  },
  opportunity: {
    kicker: 'Oportunidade de obra',
    title: 'Munck 12 t e equipe de solda para montar um galpão',
    rows: [
      ['Comprador', 'Construtora / empresa de montagem'],
      ['Local', 'Campinas/SP'],
      ['Necessidade', 'Montagem de galpão metálico'],
      ['Equipamento', 'Munck de 12 toneladas'],
      ['Serviço adicional', 'Soldagem e preparação do piso'],
      ['Prazo', 'Início em 2 dias'],
    ],
    status: 'Buscando fornecedores e equipe',
    detail: 'Tesouras de 8 t a 12 m de altura. O TemPix procura munck ≥ 12 t com operador em Campinas, equipe de soldagem e trabalho em altura, e organiza as cotações.',
  },
  examples: [
    'Locação de guindaste para montagem industrial',
    'Munck para içamento de estrutura metálica',
    'Equipe de soldagem para montagem de galpão',
    'Britadeira e operador para demolição de piso',
    'Plataforma elevatória para instalação em altura',
    'Escavadeira para preparação de terreno',
    'Caminhão basculante para remoção de entulho',
    'Comprador buscando munck disponível na região',
    'Fornecedor de munck buscando obras e compradores',
    'Construtora buscando equipamento com operador',
    'Locadora buscando contratos de longo prazo',
  ],
};

export const SHARED = {
  intermediated: 'Oportunidade intermediada pelo TemPix',
  seeOpportunity: 'Ver oportunidade',
  close: 'Fechar',
  example: 'Exemplo de como uma oportunidade chega pelo TemPix.',
  supply: 'Quero fornecer',
};

/**
 * Question engine. Each module is a short, focused group of questions that
 * only appears when it applies to the company (by operation type, objective
 * or account type). The UI renders fields generically from these
 * definitions, so a new category is a new module here, not new screens.
 *
 * Field types:
 *  chips     multi-select from a catalog            { path, options }
 *  choice    single select from a catalog           { path, options }
 *  yesno     Sim / Não; `children` show when Sim    { path, children? }
 *  toggles   several Sim/Não questions              { items: [{ path, label }] }
 *  number    numeric with unit                      { path, unit }
 *  text      short free text                        { path, placeholder }
 *  tags      free list (Enter adds)                 { path, placeholder }
 *  equipment repeatable equipment with specs        { path, groups }
 *  vehicles  repeatable fleet vehicles              { path }
 *  lanes     repeatable origin → destination        { path }
 *  requests  repeatable buyer needs with details    { path }
 *  date      calendar date (YYYY-MM-DD)             { path }
 *
 * Any field may carry `when` (shown only if the condition holds).
 */
import {
  ATTENDANCE,
  AVAILABILITY,
  BUSINESS_OBJECTIVES,
  BUSINESS_ROLES,
  BUYER_NEEDS,
  CARGO_TYPES,
  CONSTRUCTION_TYPES,
  CONTAINER_OPERATIONS,
  CONTAINER_TYPES,
  CNH_CATEGORIES,
  CONTRACT_PREFERENCES,
  DOCUMENTS,
  IDEAL_CUSTOMERS,
  LICENSES,
  NORM_AREAS,
  NORMS,
  NRS,
  INDUSTRIAL_SERVICES,
  MARITIME_SERVICES,
  MOBILIZATION_TIMES,
  OPERATION_TYPES,
  PORT_ACCESS,
  PORTS,
  REGIONS,
  SUPPLIED_EQUIPMENT,
  SUPPLIERS_SOUGHT,
  TERMINAL_ACCESS_TYPES,
  TERMINAL_SUPPLIERS,
  TERRAIN_TYPES,
  VEHICLE_TYPES,
} from './catalog.js';

/** Progressive sections of the signup, in order. */
export const OPERATION_GROUPS = Object.freeze([
  { id: 'sobre', label: 'Sobre sua empresa' },
  { id: 'faz', label: 'O que você faz' },
  { id: 'fornece', label: 'O que você vende ou fornece' },
  { id: 'compra', label: 'O que você compra ou precisa contratar' },
  { id: 'equipamentos', label: 'Suas máquinas e equipamentos' },
  { id: 'estrutura', label: 'Sua estrutura e equipe' },
  { id: 'onde', label: 'Onde consegue atender' },
  { id: 'clientes', label: 'Clientes e fornecedores desejados' },
  { id: 'revisao', label: 'Revisão' },
]);

const INDUSTRIAL = ['industria_metalurgica', 'usinagem', 'caldeiraria_soldagem', 'manutencao_industrial'];
const TRANSPORT = ['transportadora', 'logistica'];
const HEAVY = ['guindastes_munck', 'locacao_maquinas', 'operador_maquinas', 'demolicao_terraplenagem'];
const CONSTRUCTION = ['construcao', 'obras_montagem', 'demolicao_terraplenagem'];
const BUYERS = ['comprador_industrial', 'comprador_equipamentos', 'comprador_servicos', 'construtora_contratante'];
const SUPPLIERS = ['fornecedor_equipamentos', 'comercio_distribuidor'];

const roles = (label = 'Como sua empresa atua?') => ({
  type: 'chips',
  path: 'roles',
  label,
  hint: 'Marque todas que se aplicam.',
  options: BUSINESS_ROLES,
});

/** The first operational step, shown to everyone. */
export const OPERATION_START = Object.freeze({
  id: 'operacao',
  group: 'faz',
  title: 'Qual é o seu tipo de operação?',
  subtitle: 'Marque tudo o que faz parte do seu dia a dia. Assim o TemPix entende o que você fornece, compra e executa.',
  fields: [
    { type: 'chips', path: 'types', label: 'Tipo de operação', hint: 'Marque todas que se aplicam: uma empresa pode ser fornecedora, compradora e executora ao mesmo tempo.', options: OPERATION_TYPES, required: true, byAccount: true, fold: 40, personHint: 'Marque tudo o que você faz no seu dia a dia, como autônomo. Pode marcar mais de uma opção.' },
    { type: 'text', path: 'otherType', label: 'Qual?', placeholder: 'Descreva sua operação', when: { path: 'types', includes: 'outros' } },
    { type: 'chips', path: 'objectives', label: 'Quais são seus objetivos no TemPix?', hint: 'Marque quantos quiser: quanto mais, melhor o TemPix entende sua empresa.', options: BUSINESS_OBJECTIVES, required: true, byAccount: true, personHint: 'Marque quantos quiser: quanto mais, melhor o TemPix entende o seu trabalho.' },
  ],
});

export const OPERATION_MODULES = Object.freeze([
  /* ---------------- indústria / metalúrgica / usinagem ---------------- */
  {
    id: 'industrial_servicos',
    group: 'fornece',
    appliesTo: { types: INDUSTRIAL },
    title: 'Quais serviços sua empresa realiza?',
    subtitle: 'Usamos isso para direcionar só as demandas que você executa.',
    fields: [
      { type: 'chips', path: 'industrial.services', label: 'Serviços', options: INDUSTRIAL_SERVICES },
      roles('Atua como'),
      {
        type: 'toggles',
        label: 'Compra e venda',
        items: [
          { path: 'industrial.sellsEquipment', label: 'Vende ou fornece máquinas, peças ou equipamentos?' },
          { path: 'industrial.buysInputs', label: 'Compra matéria-prima, máquinas ou serviços?' },
          { path: 'industrial.wantsBuyers', label: 'Deseja receber oportunidades de compradores?' },
          { path: 'industrial.seeksSuppliers', label: 'Deseja encontrar fornecedores para sua operação?' },
        ],
      },
    ],
  },
  {
    id: 'industrial_maquinas',
    group: 'equipamentos',
    appliesTo: { types: INDUSTRIAL },
    title: 'Quais máquinas sua empresa possui?',
    subtitle: 'A capacidade de cada máquina decide quais peças e serviços chegam até você.',
    fields: [{ type: 'equipment', path: 'equipment', groups: ['industrial', 'heavy'], label: 'Máquinas e equipamentos' }],
  },
  {
    id: 'industrial_estrutura',
    group: 'estrutura',
    appliesTo: { types: INDUSTRIAL },
    title: 'Capacidade operacional',
    subtitle: 'Nada aqui é obrigatório. Quanto mais completo, mais precisas as oportunidades.',
    fields: [
      {
        type: 'toggles',
        label: 'Atendimento',
        items: [
          { path: 'capabilities.emergency', label: 'Atende serviços emergenciais?' },
          { path: 'capabilities.h24', label: 'Trabalha 24 horas?' },
          { path: 'capabilities.weekends', label: 'Trabalha aos finais de semana?' },
          { path: 'capabilities.terminals', label: 'Pode atender dentro de terminais?' },
          { path: 'capabilities.portAreas', label: 'Pode atender áreas portuárias?' },
          { path: 'capabilities.externalTeam', label: 'Possui equipe externa?' },
          { path: 'capabilities.serviceVehicle', label: 'Possui veículo para atendimento?' },
          { path: 'capabilities.onsiteInstall', label: 'Faz instalação no cliente?' },
          { path: 'capabilities.pickupDelivery', label: 'Faz retirada e entrega?' },
        ],
      },
      { type: 'number', path: 'capabilities.maxLiftTons', label: 'Peso máximo que consegue movimentar', unit: 't' },
      {
        type: 'toggles',
        label: 'Estrutura',
        items: [
          { path: 'capabilities.overheadCrane', label: 'Possui ponte rolante?' },
          { path: 'capabilities.forklift', label: 'Possui empilhadeira?' },
          { path: 'capabilities.crane', label: 'Possui guindaste?' },
          { path: 'capabilities.munck', label: 'Possui munck?' },
          { path: 'capabilities.aerialPlatform', label: 'Possui plataforma elevatória?' },
          { path: 'capabilities.earthworks', label: 'Possui máquinas para preparação, demolição ou terraplenagem?' },
          { path: 'capabilities.safetyDocs', label: 'Possui documentação de segurança para acesso industrial?' },
          { path: 'capabilities.nrStaff', label: 'Possui funcionários com NRs específicas?' },
        ],
      },
    ],
  },

  /* ---------------- transportadora / logística ---------------- */
  {
    id: 'transporte_frota',
    group: 'equipamentos',
    appliesTo: { types: TRANSPORT },
    title: 'Sua frota',
    subtitle: 'Tipo, quantidade e capacidade de cada veículo.',
    fields: [
      { type: 'number', path: 'fleet.total', label: 'Quantidade total de veículos', unit: 'veículos' },
      { type: 'vehicles', path: 'fleet.vehicles', label: 'Veículos' },
      {
        type: 'toggles',
        label: 'Operação',
        items: [
          { path: 'fleet.offersTransport', label: 'Oferece transporte para compradores?' },
          { path: 'fleet.seeksLoads', label: 'Busca cargas e oportunidades de transporte?' },
          { path: 'fleet.transportsHeavy', label: 'Transporta equipamentos pesados?' },
          { path: 'fleet.transportsCranes', label: 'Transporta muncks, guindastes ou máquinas?' },
          { path: 'fleet.mobilization', label: 'Possui estrutura para mobilização de equipamentos?' },
        ],
      },
      roles('Atua como'),
    ],
  },
  {
    id: 'transporte_containers',
    group: 'estrutura',
    appliesTo: { types: [...TRANSPORT, 'caminhoneiro'] },
    title: 'Containers',
    subtitle: 'Só aparece o que interessa para coletas e entregas de container.',
    fields: [
      {
        type: 'yesno',
        path: 'containers.transports',
        label: 'Transporta containers?',
        children: [
          { type: 'chips', path: 'containers.types', label: 'Quais?', options: CONTAINER_TYPES },
          { type: 'number', path: 'containers.simultaneous', label: 'Quantos consegue movimentar ao mesmo tempo?', unit: 'containers' },
          { type: 'toggles', label: 'Estrutura', items: [{ path: 'containers.ownChassis', label: 'Possui carreta porta-container própria?' }] },
          { type: 'chips', path: 'containers.operations', label: 'Possui estrutura para', options: CONTAINER_OPERATIONS },
        ],
      },
    ],
  },
  {
    id: 'transporte_rotas',
    group: 'onde',
    appliesTo: { types: [...TRANSPORT, 'caminhoneiro'] },
    title: 'Rotas',
    subtitle: 'De onde costuma sair e para onde costuma levar.',
    fields: [
      { type: 'text', path: 'routes.baseCity', label: 'Cidade base', placeholder: 'Ex.: Santos' },
      { type: 'text', path: 'routes.baseState', label: 'UF', placeholder: 'SP', maxLength: 2 },
      { type: 'chips', path: 'routes.regions', label: 'Regiões atendidas', options: REGIONS },
      { type: 'chips', path: 'routes.ports', label: 'Portos', options: PORTS },
      { type: 'tags', path: 'routes.terminals', label: 'Terminais', placeholder: 'Ex.: BTP, DP World' },
      { type: 'number', path: 'routes.radiusKm', label: 'Raio de atendimento', unit: 'km' },
      { type: 'lanes', path: 'routes.lanes', label: 'Rotas de interesse' },
    ],
  },

  /* ---------------- caminhoneiro autônomo / MEI ---------------- */
  {
    id: 'caminhoneiro',
    group: 'equipamentos',
    appliesTo: { types: ['caminhoneiro'] },
    title: 'Seu caminhão',
    subtitle: 'Rápido: tipo, capacidade e quando você está disponível.',
    fields: [
      { type: 'chips', path: 'trucker.truckTypes', label: 'Tipos de caminhão', options: VEHICLE_TYPES },
      { type: 'number', path: 'trucker.quantity', label: 'Quantidade', unit: 'caminhões' },
      { type: 'number', path: 'trucker.payloadTons', label: 'Capacidade de carga', unit: 't' },
      { type: 'choice', path: 'trucker.availability', label: 'Disponibilidade', options: AVAILABILITY },
      {
        type: 'toggles',
        label: 'Oportunidades',
        items: [
          { path: 'trucker.wantsTransport', label: 'Deseja receber oportunidades de transporte?' },
          { path: 'trucker.offersHeavy', label: 'Oferece transporte de equipamentos pesados?' },
          { path: 'trucker.wantsDirect', label: 'Deseja encontrar contratantes diretamente?' },
          { path: 'trucker.acceptsIntermediation', label: 'Aceita trabalhar com intermediação do TemPix?' },
        ],
      },
    ],
  },

  /* ---------------- fornecedor marítimo / portuário ---------------- */
  {
    id: 'maritimo',
    group: 'fornece',
    appliesTo: { types: ['fornecedor_maritimo'], objectives: ['fornecer_maritimo'] },
    title: 'Operações marítimas e portuárias',
    subtitle: 'O que você fornece para navios, terminais e operadores.',
    fields: [
      { type: 'chips', path: 'maritime.services', label: 'Serviços oferecidos', options: MARITIME_SERVICES },
      { type: 'chips', path: 'maritime.ports', label: 'Portos que consegue atender', options: PORTS },
      { type: 'chips', path: 'maritime.attendance', label: 'Atendimento', options: ATTENDANCE },
      { type: 'choice', path: 'maritime.mobilization', label: 'Tempo médio para mobilização', options: MOBILIZATION_TIMES },
      {
        type: 'toggles',
        label: 'Relação comercial',
        items: [
          { path: 'maritime.suppliesBuyers', label: 'Fornece diretamente para compradores?' },
          { path: 'maritime.wantsShipDemands', label: 'Deseja receber demandas de navios, terminais e operadores?' },
          { path: 'maritime.seeksPartners', label: 'Precisa encontrar fornecedores parceiros?' },
        ],
      },
      roles('Atua como'),
    ],
  },

  /* ---------------- terminais e operadores portuários ---------------- */
  {
    id: 'terminal',
    group: 'compra',
    appliesTo: { types: ['terminal_portuario'] },
    title: 'Fornecedores do terminal',
    subtitle: 'O que você costuma contratar e como.',
    fields: [
      { type: 'chips', path: 'terminal.suppliersHired', label: 'Fornecedores que normalmente contrata', options: TERMINAL_SUPPLIERS },
      { type: 'chips', path: 'terminal.cargoTypes', label: 'Tipos de carga e operação', options: CARGO_TYPES },
      { type: 'chips', path: 'terminal.equipmentHired', label: 'Equipamentos que costuma contratar', options: BUYER_NEEDS },
      { type: 'text', path: 'terminal.servicesWanted', label: 'Quais serviços deseja contratar pelo TemPix?', placeholder: 'Ex.: manutenção de portêineres, usinagem emergencial' },
      {
        type: 'toggles',
        label: 'Contratação',
        items: [
          { path: 'terminal.accreditation', label: 'Possui processo próprio de credenciamento de fornecedores?' },
          { path: 'terminal.acceptsHomologating', label: 'Aceita propostas de fornecedores em homologação?' },
          { path: 'terminal.recurring', label: 'Possui demandas recorrentes?' },
          { path: 'terminal.emergency', label: 'Possui demandas emergenciais?' },
        ],
      },
    ],
  },

  /* ---------------- guindastes / munck / equipamentos pesados ---------------- */
  {
    id: 'pesados_equipamentos',
    group: 'equipamentos',
    appliesTo: { types: HEAVY, objectives: ['oferecer_equipamentos'] },
    title: 'Seus equipamentos pesados',
    subtitle: 'Capacidade, alcance, altura e se vai com operador.',
    fields: [{ type: 'equipment', path: 'equipment', groups: ['heavy', 'construction'], label: 'Equipamentos' }],
  },
  {
    id: 'pesados_comercial',
    group: 'estrutura',
    appliesTo: { types: HEAVY, objectives: ['oferecer_equipamentos'] },
    title: 'Locação, venda e mobilização',
    subtitle: 'Como seus equipamentos chegam até a obra.',
    fields: [
      {
        type: 'toggles',
        label: 'Modalidades',
        items: [
          { path: 'heavy.rental', label: 'Equipamento disponível para locação?' },
          { path: 'heavy.sale', label: 'Equipamento disponível para venda?' },
          { path: 'heavy.seeksBuyers', label: 'Busca compradores para o equipamento?' },
          { path: 'heavy.recurring', label: 'Aceita contratos recorrentes?' },
          { path: 'heavy.emergency', label: 'Atende solicitações emergenciais?' },
          { path: 'heavy.industrialPort', label: 'Mobiliza para obras industriais e portuárias?' },
          { path: 'heavy.seeksThirdParty', label: 'Procura equipamentos de terceiros para complementar a operação?' },
          { path: 'heavy.transportNeeded', label: 'O equipamento precisa de transporte até a obra?' },
        ],
      },
      { type: 'chips', path: 'heavy.terrains', label: 'Tipo de terreno ou obra atendida', options: TERRAIN_TYPES },
      { type: 'text', path: 'heavy.certifications', label: 'Documentação e certificações do equipamento', placeholder: 'Ex.: laudo NR-11, inspeção anual' },
      roles('Sua empresa é'),
    ],
  },

  /* ---------------- construção, obras e montagem ---------------- */
  {
    id: 'obras_servicos',
    group: 'fornece',
    appliesTo: { types: CONSTRUCTION, objectives: ['encontrar_obras'] },
    title: 'Quais tipos de obra executa?',
    subtitle: 'Da preparação do terreno à montagem da estrutura.',
    fields: [{ type: 'chips', path: 'construction.types', label: 'Tipos de obra', options: CONSTRUCTION_TYPES }, roles('Atua como')],
  },
  {
    id: 'obras_equipamentos',
    group: 'equipamentos',
    appliesTo: { types: CONSTRUCTION },
    skipIfAny: ['pesados_equipamentos', 'industrial_maquinas'],
    title: 'Equipamentos que utiliza ou possui',
    subtitle: 'Munck, plataformas, escavadeiras, britadeiras, máquinas de solda...',
    fields: [{ type: 'equipment', path: 'equipment', groups: ['heavy', 'construction'], label: 'Equipamentos' }],
  },
  {
    id: 'obras_equipe',
    group: 'estrutura',
    appliesTo: { types: CONSTRUCTION, objectives: ['encontrar_obras'] },
    title: 'Equipe e capacidade de execução',
    subtitle: 'Equipes, segurança e como você contrata e é contratado.',
    fields: [
      {
        type: 'toggles',
        label: 'Equipe',
        items: [
          { path: 'construction.ownTeam', label: 'Possui equipe própria?' },
          { path: 'construction.subcontractors', label: 'Trabalha com subcontratados?' },
          { path: 'construction.fullWorks', label: 'Executa obras completas?' },
          { path: 'construction.stagesOnly', label: 'Faz apenas etapas específicas?' },
          { path: 'construction.technicalResponsible', label: 'Possui engenheiro ou responsável técnico?' },
          { path: 'construction.weldingTeam', label: 'Possui equipe de soldagem?' },
          { path: 'construction.heightTeam', label: 'Possui equipe para trabalho em altura?' },
          { path: 'construction.demolitionTeam', label: 'Possui equipe para demolição?' },
          { path: 'construction.earthworksTeam', label: 'Possui equipe para terraplenagem?' },
        ],
      },
      {
        type: 'toggles',
        label: 'Atendimento e documentação',
        items: [
          { path: 'construction.emergency', label: 'Atende obras emergenciais?' },
          { path: 'construction.weekends', label: 'Trabalha em finais de semana?' },
          { path: 'construction.industrialPort', label: 'Atende áreas industriais e portuárias?' },
          { path: 'construction.safetyDocs', label: 'Possui documentação de segurança?' },
          { path: 'construction.artLicenses', label: 'Possui ART, licenças ou certificações aplicáveis?' },
        ],
      },
      {
        type: 'toggles',
        label: 'Compradores e fornecedores',
        items: [
          { path: 'construction.seeksBuyers', label: 'Busca compradores para seus serviços?' },
          { path: 'construction.seeksEquipmentSuppliers', label: 'Busca fornecedores de máquinas e equipamentos?' },
          { path: 'construction.hiresThirdPartyEquipment', label: 'Contrata muncks, guindastes ou plataformas de terceiros?' },
          { path: 'construction.offersFullTeams', label: 'Oferece equipes completas para execução?' },
          { path: 'construction.acceptsWithOperator', label: 'Aceita contratar equipamentos com operador?' },
          { path: 'construction.acceptsWithoutOperator', label: 'Aceita contratar equipamentos sem operador?' },
          { path: 'construction.wantsWorks', label: 'Deseja receber oportunidades de obras?' },
          { path: 'construction.wantsRentals', label: 'Deseja receber oportunidades de locação de equipamentos?' },
        ],
      },
    ],
  },

  /* ---------------- compradores ---------------- */
  {
    id: 'compra_necessidades',
    group: 'compra',
    appliesTo: { types: [...BUYERS, ...CONSTRUCTION, 'terminal_portuario'], objectives: ['contratar_equipamentos', 'contratar_equipes', 'encontrar_fornecedores'] },
    title: 'O que sua empresa precisa contratar?',
    subtitle: 'Marque o que costuma contratar. Os detalhes vêm a seguir.',
    fields: [
      { type: 'chips', path: 'buyer.needs', label: 'Necessidades', options: BUYER_NEEDS },
      { type: 'chips', path: 'buyer.preferences', label: 'Preferências de contratação', options: CONTRACT_PREFERENCES },
    ],
  },
  {
    id: 'compra_detalhes',
    group: 'compra',
    appliesTo: { types: [...BUYERS, ...CONSTRUCTION, 'terminal_portuario'], objectives: ['contratar_equipamentos', 'contratar_equipes', 'encontrar_fornecedores'] },
    when: { path: 'buyer.needs', notEmpty: true },
    title: 'Detalhes da necessidade',
    subtitle: 'Capacidade, local e prazo: é assim que o TemPix encontra fornecedores e operadores compatíveis.',
    fields: [{ type: 'requests', path: 'buyer.requests', label: 'Necessidades' }],
  },

  /* ---------------- fornecedor / vendedor de equipamentos ---------------- */
  {
    id: 'fornecedor_equipamentos',
    group: 'fornece',
    appliesTo: { types: [...SUPPLIERS, 'locacao_maquinas'], objectives: ['comprar_vender_equipamentos', 'encontrar_compradores'] },
    title: 'O que você fornece?',
    subtitle: 'Venda, locação, peças e serviços para compradores empresariais.',
    fields: [
      { type: 'chips', path: 'supplier.offered', label: 'Fornece', options: SUPPLIED_EQUIPMENT },
      {
        type: 'toggles',
        label: 'Informações comerciais',
        items: [
          { path: 'supplier.sells', label: 'Trabalha com venda?' },
          { path: 'supplier.rents', label: 'Trabalha com locação?' },
          { path: 'supplier.maintenance', label: 'Trabalha com manutenção?' },
          { path: 'supplier.parts', label: 'Oferece peças?' },
          { path: 'supplier.technicalAssistance', label: 'Oferece assistência técnica?' },
          { path: 'supplier.training', label: 'Oferece treinamento?' },
          { path: 'supplier.operator', label: 'Oferece operador?' },
          { path: 'supplier.delivery', label: 'Faz entrega ou mobilização?' },
          { path: 'supplier.businessBuyers', label: 'Atende compradores empresariais?' },
          { path: 'supplier.readyStock', label: 'Trabalha com pronta-entrega?' },
          { path: 'supplier.madeToOrder', label: 'Trabalha sob encomenda?' },
          { path: 'supplier.acceptsQuotes', label: 'Aceita propostas e cotações pelo TemPix?' },
        ],
      },
      roles('Sua empresa é'),
    ],
  },

  /* ---------------- universal (empresas) ---------------- */
  /* ---------------- acesso a terminais e portos ---------------- */
  {
    id: 'acesso_terminal',
    group: 'estrutura',
    appliesTo: { types: [...TRANSPORT, 'caminhoneiro', 'terminal_portuario', 'fornecedor_maritimo'] },
    title: 'Acesso a terminais e portos',
    subtitle: 'Quem já tem acesso entra nos terminais sem espera. Marque o que possui e até quando vale.',
    fields: [
      { type: 'choice', path: 'certifications.terminal.status', label: 'Possui acesso ou credenciamento para terminais e portos?', options: PORT_ACCESS },
      {
        type: 'chips',
        path: 'certifications.terminal.types',
        label: 'Tipos de acesso',
        options: TERMINAL_ACCESS_TYPES,
        when: { path: 'certifications.terminal.status', equals: 'sim' },
      },
      { type: 'date', path: 'certifications.terminal.validUntil', label: 'Validade do acesso', when: { path: 'certifications.terminal.status', equals: 'sim' } },
      {
        type: 'text',
        path: 'certifications.terminal.registration',
        label: 'Cadastro no terminal, se houver',
        placeholder: 'Número ou código do cadastro',
        when: { path: 'certifications.terminal.status', equals: 'sim' },
      },
    ],
  },

  /* ---------------- certificados e normas (empresas e pessoas) ---------------- */
  {
    id: 'certificacoes',
    group: 'estrutura',
    appliesTo: { always: true },
    title: 'Certificados e normas',
    titlePerson: 'Certificados e habilitações',
    subtitle: 'Empresas marcam as NRs e normas que cumprem. Pessoas marcam os certificados e habilitações que possuem. Nada aqui é obrigatório.',
    subtitlePerson: 'Marque os treinamentos e habilitações que você possui. Nada aqui é obrigatório.',
    fields: [
      {
        type: 'chips',
        path: 'certifications.nrs',
        label: 'Normas Regulamentadoras (NRs)',
        labelPerson: 'Treinamentos NR (segurança do trabalho)',
        hintPerson: 'Marque os treinamentos NR que você já fez, como NR-35 (altura) ou NR-10 (eletricidade).',
        hint: 'Marque as NRs que sua empresa ou sua equipe cumpre. “Todas as NRs” marca a lista inteira de uma vez.',
        options: NRS,
        bulk: [{ label: 'Todas as NRs', ids: NRS.map((o) => o.id) }],
      },
      {
        type: 'chips',
        path: 'certifications.norms',
        accounts: ['COMPANY'],
        label: 'Normas técnicas e certificações',
        hint: 'As normas mais exigidas em cada área. Os atalhos marcam a área inteira.',
        options: NORMS,
        bulk: NORM_AREAS.map((a) => ({ label: a.label, ids: NORMS.filter((n) => n.area === a.id).map((n) => n.id) })),
      },
      {
        type: 'chips',
        path: 'certifications.licenses',
        label: 'Habilitações e certificados das pessoas',
        labelPerson: 'Habilitações e treinamentos que você possui',
        hint: 'Para quem executa o serviço: operação de máquinas, soldagem, altura e outros treinamentos.',
        hintPerson: 'Operação de máquinas, soldagem, altura e outros treinamentos que você tem.',
        options: LICENSES,
      },
      {
        type: 'yesno',
        path: 'certifications.cnh.has',
        label: 'Possui CNH?',
        hint: 'Obrigatória para dirigir. Caminhoneiros: informe a categoria e a validade.',
        children: [
          { type: 'chips', path: 'certifications.cnh.categories', label: 'Categoria da CNH', options: CNH_CATEGORIES },
          { type: 'date', path: 'certifications.cnh.validUntil', label: 'Validade da CNH' },
        ],
      },
    ],
  },
  {
    id: 'mercado',
    group: 'clientes',
    appliesTo: { accounts: ['COMPANY'], always: true },
    title: 'Clientes e fornecedores desejados',
    subtitle: 'Quem você quer atender e de quem você quer comprar.',
    fields: [
      { type: 'chips', path: 'market.idealCustomers', label: 'Qual seu cliente ideal?', options: IDEAL_CUSTOMERS },
      { type: 'chips', path: 'market.suppliersSought', label: 'Qual fornecedor você procura?', options: SUPPLIERS_SOUGHT },
    ],
  },
]);

/** Optional documentation, asked at review and completable later in the dashboard. */
export const DOCUMENTS_FIELD = Object.freeze({
  type: 'chips',
  path: 'documents',
  label: 'Documentações e acessos que você já possui',
  hint: 'Opcional. Você pode completar depois pelo painel.',
  options: DOCUMENTS,
});

const hasAny = (list, wanted) => Array.isArray(list) && wanted.some((w) => list.includes(w));

function applies(module, profile, accountType) {
  const a = module.appliesTo || {};
  if (a.accounts && accountType && !a.accounts.includes(accountType)) return false;
  if (a.always) return true;
  return hasAny(profile.types, a.types || []) || hasAny(profile.objectives, a.objectives || []);
}

/**
 * A module shaped for the account. A pessoa física sees her own certificates and
 * training: no company norms and no "Todas as NRs" shortcut. Companies see it whole.
 */
function forAccount(module, accountType) {
  if (accountType !== 'PERSON') return module;
  return {
    ...module,
    title: module.titlePerson ?? module.title,
    subtitle: module.subtitlePerson ?? module.subtitle,
    fields: module.fields
      .filter((f) => !f.accounts || f.accounts.includes('PERSON'))
      .map(({ bulk, ...f }) => ({ ...f, label: f.labelPerson ?? f.label, hint: f.hintPerson ?? f.hint })),
  };
}

export function conditionMet(when, profile) {
  if (!when) return true;
  const value = when.path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), profile);
  if (when.includes !== undefined) return Array.isArray(value) && value.includes(when.includes);
  if (when.notEmpty) return Array.isArray(value) ? value.length > 0 : Boolean(value);
  if (when.equals !== undefined) return value === when.equals;
  return true;
}

/**
 * Modules that apply to this profile, in signup order (by group). A module
 * listing `skipIfAny` is dropped when one of those modules is already shown
 * (e.g. one equipment list, not three).
 */
export function modulesFor(profile, accountType) {
  const order = Object.fromEntries(OPERATION_GROUPS.map((g, i) => [g.id, i]));
  const picked = OPERATION_MODULES.filter((m) => applies(m, profile, accountType));
  const pickedIds = new Set(picked.map((m) => m.id));
  return picked
    .filter((m) => !(m.skipIfAny || []).some((id) => pickedIds.has(id)))
    .filter((m) => conditionMet(m.when, profile))
    .sort((x, y) => order[x.group] - order[y.group])
    .map((m) => forAccount(m, accountType));
}

/**
 * Options of a catalog offered to an account type. People (CPF) see only the
 * options tagged for them; companies (CNPJ/MEI) see every option tagged for them.
 */
export function optionsFor(catalog, accountType) {
  return catalog
    .filter((o) => !o.accounts || !accountType || o.accounts.includes(accountType))
    .filter((o) => accountType !== 'PERSON' || o.accounts)
    .map((o) => (o.labelByAccount?.[accountType] ? { ...o, label: o.labelByAccount[accountType] } : o));
}

/** Operation types offered to an account type. */
export function operationTypesFor(accountType) {
  return optionsFor(OPERATION_TYPES, accountType);
}

export const groupLabel = (id) => OPERATION_GROUPS.find((g) => g.id === id)?.label ?? '';

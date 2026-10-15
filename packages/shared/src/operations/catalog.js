/**
 * Operational catalogs. Every option has a stable `id` (stored in the
 * database and used by matching) and a `label` in pt-BR (display only).
 * To translate later, map ids to labels per locale; never store labels.
 */
const opts = (pairs) => Object.freeze(pairs.map(([id, label, extra]) => Object.freeze({ id, label, ...(extra || {}) })));

/** Who the account is. `accounts` limits where an option is offered. */
export const OPERATION_TYPES = opts([
  ['industria_metalurgica', 'Indústria / Metalúrgica', { icon: 'factory' }],
  ['usinagem', 'Usinagem', { icon: 'cog' }],
  ['caldeiraria_soldagem', 'Caldeiraria / Soldagem', { icon: 'flame' }],
  ['transportadora', 'Transportadora', { icon: 'truck' }],
  ['caminhoneiro', 'Caminhoneiro autônomo / MEI', { icon: 'truck', accounts: ['COMPANY', 'PERSON'], labelByAccount: { PERSON: 'Caminhoneiro autônomo' } }],
  ['logistica', 'Logística', { icon: 'route' }],
  ['terminal_portuario', 'Terminal / Operador portuário', { icon: 'anchor' }],
  ['fornecedor_maritimo', 'Fornecedor marítimo', { icon: 'ship' }],
  ['manutencao_industrial', 'Manutenção industrial', { icon: 'wrench' }],
  ['construcao', 'Construção', { icon: 'building' }],
  ['obras_montagem', 'Obras e montagem', { icon: 'hardhat' }],
  ['locacao_maquinas', 'Locação de máquinas', { icon: 'key' }],
  ['operador_maquinas', 'Operador de máquinas pesadas', { icon: 'hardhat', accounts: ['COMPANY', 'PERSON'] }],
  ['guindastes_munck', 'Guindastes / Munck', { icon: 'crane' }],
  ['demolicao_terraplenagem', 'Demolição / Terraplenagem', { icon: 'hammer' }],
  ['prestador_servicos', 'Prestador de serviços', { icon: 'briefcase', accounts: ['COMPANY', 'PERSON'] }],
  ['comercio_distribuidor', 'Comércio / Distribuidor', { icon: 'store' }],
  ['fornecedor_equipamentos', 'Fornecedor / Vendedor de equipamentos', { icon: 'package' }],
  ['comprador_industrial', 'Comprador industrial', { icon: 'cart' }],
  ['comprador_equipamentos', 'Comprador de equipamentos', { icon: 'cart' }],
  ['comprador_servicos', 'Comprador de serviços', { icon: 'cart' }],
  ['construtora_contratante', 'Construtora contratante', { icon: 'building' }],
  ['tecnologia', 'Empresa de tecnologia', { icon: 'cpu' }],
  ['profissional_autonomo', 'Profissional autônomo', { icon: 'user', accounts: ['PERSON'] }],
  ['outros', 'Outros', { icon: 'plus', accounts: ['COMPANY', 'PERSON'] }],
]);

/** Objectives. The COMPANY_ONLY ones (suppliers, teams, maritime, brokerage) are never offered to people. */
const ANY_ACCOUNT = ['COMPANY', 'PERSON'];
const COMPANY_ONLY = ['COMPANY'];
export const BUSINESS_OBJECTIVES = opts([
  ['encontrar_compradores', 'Encontrar compradores para meus produtos ou equipamentos', { accounts: ANY_ACCOUNT }],
  ['encontrar_fornecedores', 'Encontrar fornecedores', { accounts: COMPANY_ONLY }],
  ['contratar_equipamentos', 'Contratar máquinas ou equipamentos', { accounts: ANY_ACCOUNT }],
  ['oferecer_equipamentos', 'Oferecer máquinas ou equipamentos', { accounts: ANY_ACCOUNT }],
  ['encontrar_obras', 'Encontrar obras e oportunidades', { accounts: ANY_ACCOUNT }],
  ['oferecer_servicos', 'Oferecer serviços especializados', { accounts: ANY_ACCOUNT }],
  ['comprar_vender_equipamentos', 'Comprar ou vender equipamentos', { accounts: ANY_ACCOUNT }],
  ['contratar_equipes', 'Contratar equipes', { accounts: COMPANY_ONLY }],
  ['fornecer_maritimo', 'Fornecer para operações marítimas e portuárias', { accounts: COMPANY_ONLY }],
  ['transportar_cargas', 'Transportar cargas', { accounts: ANY_ACCOUNT }],
  ['intermediar', 'Intermediar oportunidades', { accounts: COMPANY_ONLY }],
  ['outros', 'Outros', { accounts: ANY_ACCOUNT }],
]);

/** How the company acts in a deal (a company can be several at once). */
export const BUSINESS_ROLES = opts([
  ['fabricante', 'Fabricante'],
  ['distribuidor', 'Distribuidora'],
  ['prestador', 'Prestadora de serviços'],
  ['fornecedor', 'Fornecedora'],
  ['comprador', 'Compradora'],
  ['executora', 'Executora de obras'],
  ['subcontratada', 'Subcontratada'],
  ['locadora', 'Locadora'],
  ['proprietario_equipamento', 'Proprietária de equipamentos'],
  ['operador', 'Operadora de equipamentos'],
  ['equipe_completa', 'Fornece equipamento com equipe completa'],
  ['intermediador', 'Intermediadora'],
]);

export const INDUSTRIAL_SERVICES = opts([
  ['torneamento', 'Torneamento'],
  ['fresamento', 'Fresamento'],
  ['mandrilhamento', 'Mandrilhamento'],
  ['furacao', 'Furação'],
  ['solda_mig_mag', 'Soldagem MIG/MAG'],
  ['solda_tig', 'Soldagem TIG'],
  ['eletrodo_revestido', 'Eletrodo revestido'],
  ['corte', 'Corte'],
  ['dobra', 'Dobra'],
  ['calandra', 'Calandra'],
  ['prensa', 'Prensa'],
  ['caldeiraria', 'Caldeiraria'],
  ['montagem', 'Montagem'],
  ['manutencao_industrial', 'Manutenção industrial'],
  ['estruturas_metalicas', 'Estruturas metálicas'],
  ['reparo_emergencial', 'Reparo emergencial'],
  ['outros', 'Outros'],
]);

/**
 * Equipment types. `group` drives which question module offers them;
 * `specs` lists the capacity fields asked for that type (see SPEC_FIELDS).
 */
export const EQUIPMENT_TYPES = opts([
  ['torno', 'Torno', { group: 'industrial', specs: ['maxDiameterMm', 'maxLengthMm'] }],
  ['fresadora', 'Fresadora', { group: 'industrial', specs: ['maxLengthMm'] }],
  ['centro_usinagem', 'Centro de usinagem', { group: 'industrial', specs: ['maxLengthMm'] }],
  ['furadeira', 'Furadeira', { group: 'industrial', specs: ['maxDiameterMm'] }],
  ['prensa', 'Prensa', { group: 'industrial', specs: ['capacityTons'] }],
  ['dobradeira', 'Dobradeira', { group: 'industrial', specs: ['capacityTons', 'maxLengthMm'] }],
  ['calandra', 'Calandra', { group: 'industrial', specs: ['maxLengthMm'] }],
  ['maquina_corte', 'Máquina de corte', { group: 'industrial', specs: ['maxLengthMm'] }],
  ['plasma', 'Plasma', { group: 'industrial', specs: ['maxLengthMm'] }],
  ['laser', 'Laser', { group: 'industrial', specs: ['maxLengthMm'] }],
  ['solda_mig_mag', 'Máquina de solda MIG/MAG', { group: 'industrial', specs: [] }],
  ['solda_tig', 'Máquina de solda TIG', { group: 'industrial', specs: [] }],
  ['compressor', 'Compressor', { group: 'industrial', specs: [] }],
  ['ponte_rolante', 'Ponte rolante', { group: 'industrial', specs: ['capacityTons'] }],
  ['munck', 'Munck', { group: 'heavy', specs: ['capacityTons', 'reachM', 'heightM'] }],
  ['guindaste_telescopico', 'Guindaste telescópico', { group: 'heavy', specs: ['capacityTons', 'reachM', 'heightM'] }],
  ['guindaste_esteiras', 'Guindaste sobre esteiras', { group: 'heavy', specs: ['capacityTons', 'reachM', 'heightM'] }],
  ['guindaste_articulado', 'Guindaste articulado', { group: 'heavy', specs: ['capacityTons', 'reachM', 'heightM'] }],
  ['plataforma_elevatoria', 'Plataforma elevatória', { group: 'heavy', specs: ['heightM', 'capacityTons'] }],
  ['empilhadeira', 'Empilhadeira', { group: 'heavy', specs: ['capacityTons', 'heightM'] }],
  ['escavadeira', 'Escavadeira', { group: 'heavy', specs: ['capacityTons'] }],
  ['retroescavadeira', 'Retroescavadeira', { group: 'heavy', specs: ['capacityTons'] }],
  ['pa_carregadeira', 'Pá carregadeira', { group: 'heavy', specs: ['capacityTons'] }],
  ['rolo_compactador', 'Rolo compactador', { group: 'heavy', specs: ['capacityTons'] }],
  ['perfuratriz', 'Perfuratriz', { group: 'heavy', specs: ['maxDiameterMm'] }],
  ['britadeira', 'Britadeira', { group: 'heavy', specs: [] }],
  ['caminhao_basculante', 'Caminhão basculante', { group: 'heavy', specs: ['capacityTons'] }],
  ['caminhao_prancha', 'Caminhão prancha', { group: 'heavy', specs: ['capacityTons'] }],
  ['andaime', 'Andaime', { group: 'construction', specs: ['heightM'] }],
  ['betoneira', 'Betoneira', { group: 'construction', specs: [] }],
  ['bomba_concreto', 'Bomba de concreto', { group: 'construction', specs: [] }],
  ['serra_piso', 'Serra de piso', { group: 'construction', specs: [] }],
  ['maquina_solda', 'Máquina de solda', { group: 'construction', specs: [] }],
  ['gerador', 'Gerador', { group: 'construction', specs: [] }],
  ['outros', 'Outros', { group: 'any', specs: ['capacityTons'] }],
]);

export const SPEC_FIELDS = Object.freeze({
  maxDiameterMm: { label: 'Diâmetro máximo', unit: 'mm' },
  maxLengthMm: { label: 'Comprimento máximo', unit: 'mm' },
  capacityTons: { label: 'Capacidade', unit: 't' },
  reachM: { label: 'Alcance', unit: 'm' },
  heightM: { label: 'Altura máxima', unit: 'm' },
  maxLoadTons: { label: 'Peso máximo suportado', unit: 't' },
});

export const OPERATOR_MODES = opts([
  ['com', 'Com operador'],
  ['sem', 'Sem operador'],
  ['ambos', 'Com ou sem operador'],
]);

export const AVAILABILITY = opts([
  ['agora', 'Agora'],
  ['hoje', 'Hoje'],
  ['semana', 'Esta semana'],
  ['consulta', 'Sob consulta'],
]);

export const EQUIPMENT_USAGE = opts([
  ['oferece', 'Ofereço para terceiros'],
  ['uso_interno', 'Uso interno'],
  ['ambos', 'Os dois'],
]);

export const VEHICLE_TYPES = opts([
  ['cavalo_mecanico', 'Cavalo mecânico'],
  ['carreta', 'Carreta'],
  ['bau', 'Baú'],
  ['sider', 'Sider'],
  ['truck', 'Truck'],
  ['bitruck', 'Bitruck'],
  ['toco', 'Toco'],
  ['vuc', 'VUC'],
  ['munck', 'Munck'],
  ['prancha', 'Prancha'],
  ['graneleiro', 'Graneleiro'],
  ['basculante', 'Basculante'],
  ['porta_container', 'Porta-container'],
  ['refrigerado', 'Refrigerado'],
  ['tanque', 'Tanque'],
  ['outros', 'Outros'],
]);

export const CONTAINER_TYPES = opts([
  ['20', '20 pés'],
  ['40', '40 pés'],
  ['40hc', '40 HC'],
  ['reefer', 'Reefer'],
  ['open_top', 'Open Top'],
  ['flat_rack', 'Flat Rack'],
  ['tank', 'Tank Container'],
  ['outros', 'Outros'],
]);

export const CONTAINER_OPERATIONS = opts([
  ['retirada_terminal', 'Retirada no terminal'],
  ['devolucao_vazio', 'Devolução de vazio'],
  ['entrega_cliente', 'Entrega em cliente'],
  ['porto_cliente', 'Porto → cliente'],
  ['cliente_porto', 'Cliente → porto'],
  ['transferencia_terminais', 'Transferência entre terminais'],
]);

export const PORTS = opts([
  ['santos', 'Santos'],
  ['guaruja', 'Guarujá'],
  ['sao_sebastiao', 'São Sebastião'],
  ['paranagua', 'Paranaguá'],
  ['itajai', 'Itajaí'],
  ['rio_de_janeiro', 'Rio de Janeiro'],
  ['vitoria', 'Vitória'],
  ['suape', 'Suape'],
  ['rio_grande', 'Rio Grande'],
  ['outro', 'Outro'],
]);

/** Common service regions; free text regions are accepted too. */
export const REGIONS = opts([
  ['baixada_santista', 'Baixada Santista'],
  ['grande_sao_paulo', 'Grande São Paulo'],
  ['campinas_regiao', 'Campinas e região'],
  ['interior_sp', 'Interior de São Paulo'],
  ['vale_paraiba', 'Vale do Paraíba'],
  ['sul', 'Região Sul'],
  ['sudeste', 'Região Sudeste'],
  ['brasil', 'Brasil inteiro'],
]);

export const MARITIME_SERVICES = opts([
  ['ship_supply', 'Ship supply'],
  ['provisoes', 'Provisões'],
  ['alimentacao', 'Alimentação'],
  ['agua', 'Água'],
  ['ferramentas', 'Ferramentas'],
  ['equipamentos', 'Equipamentos'],
  ['pecas', 'Peças'],
  ['manutencao', 'Manutenção'],
  ['reparo', 'Reparo'],
  ['soldagem', 'Soldagem'],
  ['usinagem', 'Usinagem'],
  ['eletrica', 'Elétrica'],
  ['hidraulica', 'Hidráulica'],
  ['limpeza', 'Limpeza'],
  ['transporte_tripulacao', 'Transporte de tripulação'],
  ['logistica', 'Logística'],
  ['outros', 'Outros'],
]);

export const ATTENDANCE = opts([
  ['comercial', 'Horário comercial'],
  ['plantao', 'Plantão'],
  ['24_7', '24/7'],
  ['emergencial', 'Emergencial'],
]);

export const MOBILIZATION_TIMES = opts([
  ['lt1h', 'Menos de 1 hora'],
  ['1_3h', '1 a 3 horas'],
  ['3_6h', '3 a 6 horas'],
  ['6_12h', '6 a 12 horas'],
  ['24h', '24 horas ou mais'],
  ['consulta', 'Sob consulta'],
]);

export const TERMINAL_SUPPLIERS = opts([
  ['manutencao', 'Manutenção'],
  ['eletrica', 'Elétrica'],
  ['mecanica', 'Mecânica'],
  ['metalurgica', 'Metalúrgica'],
  ['usinagem', 'Usinagem'],
  ['soldagem', 'Soldagem'],
  ['transporte', 'Transporte'],
  ['limpeza', 'Limpeza'],
  ['engenharia', 'Engenharia'],
  ['inspecao', 'Inspeção'],
  ['seguranca', 'Segurança'],
  ['equipamentos', 'Equipamentos'],
  ['pecas', 'Peças'],
  ['construcao', 'Construção'],
  ['guindastes', 'Guindastes'],
  ['muncks', 'Muncks'],
  ['plataformas', 'Plataformas elevatórias'],
  ['maquinas_pesadas', 'Máquinas pesadas'],
  ['outros', 'Outros'],
]);

export const CARGO_TYPES = opts([
  ['container', 'Container'],
  ['granel_solido', 'Granel sólido'],
  ['granel_liquido', 'Granel líquido'],
  ['carga_geral', 'Carga geral'],
  ['ro_ro', 'Ro-Ro'],
  ['projeto', 'Projeto'],
  ['outros', 'Outros'],
]);

export const CONSTRUCTION_TYPES = opts([
  ['montagem_galpoes', 'Montagem de galpões'],
  ['estruturas_metalicas', 'Estruturas metálicas'],
  ['montagem_industrial', 'Montagem industrial'],
  ['construcao_civil', 'Construção civil'],
  ['demolicao', 'Demolição'],
  ['terraplenagem', 'Terraplenagem'],
  ['preparacao_terreno', 'Preparação de terreno'],
  ['fundacoes', 'Fundações'],
  ['pavimentacao', 'Pavimentação'],
  ['instalacao_eletrica', 'Instalação elétrica'],
  ['instalacao_hidraulica', 'Instalação hidráulica'],
  ['caldeiraria', 'Caldeiraria'],
  ['soldagem_campo', 'Soldagem em campo'],
  ['manutencao_predial', 'Manutenção predial'],
  ['manutencao_industrial', 'Manutenção industrial'],
  ['reparo_piso', 'Reparo de piso'],
  ['corte_concreto', 'Corte e quebra de concreto'],
  ['outros', 'Outros'],
]);

export const TERRAIN_TYPES = opts([
  ['urbano', 'Obra urbana'],
  ['industrial', 'Área industrial'],
  ['portuario', 'Área portuária'],
  ['rural', 'Área rural'],
  ['irregular', 'Terreno irregular'],
]);

/** What a buyer needs to hire (equipment, teams and transport). */
export const BUYER_NEEDS = opts([
  ['munck', 'Munck'],
  ['guindaste', 'Guindaste'],
  ['plataforma_elevatoria', 'Plataforma elevatória'],
  ['empilhadeira', 'Empilhadeira'],
  ['escavadeira', 'Escavadeira'],
  ['retroescavadeira', 'Retroescavadeira'],
  ['pa_carregadeira', 'Pá carregadeira'],
  ['rolo_compactador', 'Rolo compactador'],
  ['perfuratriz', 'Perfuratriz'],
  ['britadeira', 'Britadeira'],
  ['caminhao_basculante', 'Caminhão basculante'],
  ['caminhao_prancha', 'Caminhão prancha'],
  ['equipe_soldagem', 'Equipe de soldagem'],
  ['equipe_montagem', 'Equipe de montagem'],
  ['operador_maquinas', 'Operador de máquinas'],
  ['transporte_equipamentos', 'Transporte de equipamentos'],
  ['usinagem', 'Usinagem'],
  ['manutencao', 'Manutenção'],
  ['outros', 'Outros'],
]);

/** Buyer needs that are equipment, mapped to the equipment types that satisfy them. */
export const NEED_EQUIPMENT = Object.freeze({
  munck: ['munck'],
  guindaste: ['guindaste_telescopico', 'guindaste_esteiras', 'guindaste_articulado'],
  plataforma_elevatoria: ['plataforma_elevatoria'],
  empilhadeira: ['empilhadeira'],
  escavadeira: ['escavadeira'],
  retroescavadeira: ['retroescavadeira'],
  pa_carregadeira: ['pa_carregadeira'],
  rolo_compactador: ['rolo_compactador'],
  perfuratriz: ['perfuratriz'],
  britadeira: ['britadeira'],
  caminhao_basculante: ['caminhao_basculante'],
  caminhao_prancha: ['caminhao_prancha'],
});

export const CONTRACT_PREFERENCES = opts([
  ['hora', 'Locação por hora'],
  ['diaria', 'Locação por diária'],
  ['semanal', 'Locação por semana'],
  ['mensal', 'Locação mensal'],
  ['etapa', 'Contratação por etapa'],
  ['longo_prazo', 'Contrato de longo prazo'],
  ['com_operador', 'Equipamento com operador'],
  ['sem_operador', 'Equipamento sem operador'],
  ['compra', 'Compra do equipamento'],
  ['fornecedor_local', 'Fornecedor local'],
  ['outra_regiao', 'Fornecedor de outra região'],
]);

export const URGENCY = opts([
  ['emergencial', 'Emergencial (horas)'],
  ['dias', 'Em poucos dias'],
  ['semanas', 'Nas próximas semanas'],
  ['planejado', 'Planejado'],
]);

export const SUPPLIED_EQUIPMENT = opts([
  ['muncks', 'Muncks'],
  ['guindastes', 'Guindastes'],
  ['plataformas', 'Plataformas elevatórias'],
  ['empilhadeiras', 'Empilhadeiras'],
  ['escavadeiras', 'Escavadeiras'],
  ['retroescavadeiras', 'Retroescavadeiras'],
  ['pa_carregadeiras', 'Pá carregadeiras'],
  ['britadeiras', 'Britadeiras'],
  ['compressores', 'Compressores'],
  ['geradores', 'Geradores'],
  ['maquinas_solda', 'Máquinas de solda'],
  ['caminhoes', 'Caminhões'],
  ['pecas', 'Peças e componentes'],
  ['usados', 'Equipamentos usados'],
  ['novos', 'Equipamentos novos'],
  ['locacao', 'Equipamentos para locação'],
  ['venda', 'Equipamentos para venda'],
  ['outros', 'Outros'],
]);

export const IDEAL_CUSTOMERS = opts([
  ['empresas', 'Empresas'],
  ['industrias', 'Indústrias'],
  ['terminais', 'Terminais'],
  ['transportadoras', 'Transportadoras'],
  ['navios', 'Navios'],
  ['construcao', 'Construção'],
  ['obras', 'Obras'],
  ['governo', 'Governo'],
  ['consumidor', 'Consumidor'],
  ['compradores_equipamentos', 'Compradores de equipamentos'],
  ['construtoras', 'Construtoras'],
  ['operadores_portuarios', 'Operadores portuários'],
  ['outros', 'Outros'],
]);

export const SUPPLIERS_SOUGHT = opts([
  ['maquinas', 'Fornecedor de máquinas'],
  ['locadora', 'Locadora de equipamentos'],
  ['manutencao', 'Empresa de manutenção'],
  ['soldagem', 'Equipe de soldagem'],
  ['transportadora', 'Transportadora'],
  ['operador_munck', 'Operador de munck'],
  ['guindasteiro', 'Guindasteiro'],
  ['terraplenagem', 'Empresa de terraplenagem'],
  ['pecas', 'Distribuidor de peças'],
  ['outros', 'Outros'],
]);

export const MIN_TICKETS = opts([
  ['500', 'R$ 500'],
  ['1000', 'R$ 1.000'],
  ['5000', 'R$ 5.000'],
  ['10000', 'R$ 10.000'],
  ['50000', 'R$ 50.000'],
]);

export const DOCUMENTS = opts([
  ['acesso_terminal', 'Acesso a terminal'],
  ['credenciamento_portuario', 'Credenciamento portuário'],
  ['seguro', 'Seguro'],
  ['certificados', 'Certificados'],
  ['nrs', 'NRs'],
  ['licencas', 'Licenças'],
  ['antt', 'ANTT'],
  ['rntrc', 'RNTRC'],
  ['docs_veiculos', 'Documentos de veículos'],
  ['certificados_tecnicos', 'Certificados técnicos'],
  ['certificados_equipamentos', 'Certificados de equipamentos'],
  ['inspecoes', 'Inspeções'],
  ['art', 'ART'],
  ['docs_operadores', 'Documentos de operadores'],
  ['docs_maquinas', 'Documentos de máquinas'],
  ['outros', 'Outros'],
]);

export const PORT_ACCESS = opts([
  ['sim', 'Sim'],
  ['nao', 'Não'],
  ['em_processo', 'Em processo'],
]);

/** Lookup helper: label of an id in a catalog (falls back to the id). */
export function labelOf(catalog, id) {
  return catalog.find((o) => o.id === id)?.label ?? id;
}

export const ids = (catalog) => catalog.map((o) => o.id);

/* ------------------------------------------ certificados e normas */
/** NRs em vigor (MTE). NR-02 e NR-27 foram revogadas e não aparecem. */
export const NRS = opts([
  ['nr-01', 'NR-01 · Disposições gerais e gerenciamento de riscos'],
  ['nr-03', 'NR-03 · Embargo e interdição'],
  ['nr-04', 'NR-04 · SESMT'],
  ['nr-05', 'NR-05 · CIPA'],
  ['nr-06', 'NR-06 · EPI'],
  ['nr-07', 'NR-07 · PCMSO'],
  ['nr-08', 'NR-08 · Edificações'],
  ['nr-09', 'NR-09 · Agentes ambientais'],
  ['nr-10', 'NR-10 · Eletricidade'],
  ['nr-11', 'NR-11 · Transporte e movimentação de materiais'],
  ['nr-12', 'NR-12 · Máquinas e equipamentos'],
  ['nr-13', 'NR-13 · Caldeiras e vasos de pressão'],
  ['nr-14', 'NR-14 · Fornos'],
  ['nr-15', 'NR-15 · Atividades insalubres'],
  ['nr-16', 'NR-16 · Atividades perigosas'],
  ['nr-17', 'NR-17 · Ergonomia'],
  ['nr-18', 'NR-18 · Construção civil'],
  ['nr-19', 'NR-19 · Explosivos'],
  ['nr-20', 'NR-20 · Inflamáveis e combustíveis'],
  ['nr-21', 'NR-21 · Trabalho a céu aberto'],
  ['nr-22', 'NR-22 · Mineração'],
  ['nr-23', 'NR-23 · Proteção contra incêndios'],
  ['nr-24', 'NR-24 · Condições sanitárias e de conforto'],
  ['nr-25', 'NR-25 · Resíduos industriais'],
  ['nr-26', 'NR-26 · Sinalização de segurança'],
  ['nr-28', 'NR-28 · Fiscalização e penalidades'],
  ['nr-29', 'NR-29 · Trabalho portuário'],
  ['nr-30', 'NR-30 · Trabalho aquaviário'],
  ['nr-31', 'NR-31 · Agropecuária e silvicultura'],
  ['nr-32', 'NR-32 · Serviços de saúde'],
  ['nr-33', 'NR-33 · Espaços confinados'],
  ['nr-34', 'NR-34 · Construção e reparação naval'],
  ['nr-35', 'NR-35 · Trabalho em altura'],
  ['nr-36', 'NR-36 · Abate e processamento de carnes'],
  ['nr-37', 'NR-37 · Plataformas de petróleo'],
  ['nr-38', 'NR-38 · Limpeza urbana e resíduos sólidos'],
]);

/** Areas used as shortcuts for the norms list. */
export const NORM_AREAS = Object.freeze([
  { id: 'gestao', label: 'Gestão e qualidade' },
  { id: 'industria', label: 'Indústria e usinagem' },
  { id: 'construcao', label: 'Construção e montagem' },
  { id: 'movimentacao', label: 'Içamento e transporte' },
  { id: 'portuario', label: 'Portuário e naval' },
]);

/** Technical norms and certifications most asked of each area (curated list). */
export const NORMS = opts([
  ['iso-9001', 'ISO 9001 · Gestão da qualidade', { area: 'gestao' }],
  ['iso-45001', 'ISO 45001 · Gestão de segurança e saúde', { area: 'gestao' }],
  ['iso-14001', 'ISO 14001 · Gestão ambiental', { area: 'gestao' }],
  ['ghs', 'GHS · Rotulagem de produtos químicos', { area: 'gestao' }],
  ['nbr-14725', 'ABNT NBR 14725 · FISPQ', { area: 'gestao' }],
  ['iso-12100', 'ISO 12100 · Segurança de máquinas', { area: 'industria' }],
  ['nbr-13849', 'ABNT NBR ISO 13849 · Comandos de segurança de máquinas', { area: 'industria' }],
  ['iso-3834', 'ISO 3834 · Qualidade em soldagem', { area: 'industria' }],
  ['iso-9606', 'ISO 9606 · Qualificação de soldadores', { area: 'industria' }],
  ['nbr-6118', 'ABNT NBR 6118 · Estruturas de concreto', { area: 'construcao' }],
  ['nbr-8800', 'ABNT NBR 8800 · Estruturas de aço', { area: 'construcao' }],
  ['nbr-6494', 'ABNT NBR 6494 · Segurança em andaimes', { area: 'construcao' }],
  ['nbr-5410', 'ABNT NBR 5410 · Instalações elétricas de baixa tensão', { area: 'construcao' }],
  ['nbr-5419', 'ABNT NBR 5419 · Proteção contra descargas atmosféricas', { area: 'construcao' }],
  ['nbr-16280', 'ABNT NBR 16280 · Reformas em edificações', { area: 'construcao' }],
  ['nbr-6123', 'ABNT NBR 6123 · Forças do vento em edificações', { area: 'construcao' }],
  ['nbr-8400', 'ABNT NBR 8400 · Equipamentos de levantamento de cargas', { area: 'movimentacao' }],
  ['iso-4309', 'ISO 4309 · Cabos de aço de guindastes', { area: 'movimentacao' }],
  ['iso-1496', 'ISO 1496 · Containers de carga (série 1)', { area: 'movimentacao' }],
  ['iso-6346', 'ISO 6346 · Codificação de containers', { area: 'movimentacao' }],
  ['mopp', 'MOPP · Transporte de produtos perigosos (ANTT)', { area: 'movimentacao' }],
  ['imdg', 'IMDG Code · Produtos perigosos no mar', { area: 'portuario' }],
  ['isps', 'ISPS Code · Proteção de navios e portos', { area: 'portuario' }],
  ['ism', 'ISM Code · Gestão de segurança de navios', { area: 'portuario' }],
  ['solas', 'SOLAS · Segurança da vida no mar', { area: 'portuario' }],
  ['marpol', 'MARPOL · Poluição por navios', { area: 'portuario' }],
]);

/** Habilitações e certificados de pessoas que trabalham nas operações. */
export const LICENSES = opts([
  ['cnh-b', 'CNH categoria B'],
  ['cnh-c', 'CNH categoria C'],
  ['cnh-d', 'CNH categoria D'],
  ['cnh-e', 'CNH categoria E'],
  ['mopp-motorista', 'MOPP (motorista)'],
  ['operador-empilhadeira', 'Operador de empilhadeira (NR-11)'],
  ['operador-guindaste', 'Operador de guindaste ou munck'],
  ['operador-plataforma', 'Operador de plataforma elevatória'],
  ['soldador', 'Soldador qualificado'],
  ['eletricista-sep', 'Eletricista · SEP (NR-10)'],
  ['trabalho-altura', 'Trabalho em altura (NR-35)'],
  ['espacos-confinados', 'Espaços confinados (NR-33)'],
  ['primeiros-socorros', 'Primeiros socorros'],
]);

/** Kinds of access a terminal or port can grant (gate, yard, quay, ...). */
export const TERMINAL_ACCESS_TYPES = opts([
  ['gate_caminhao', 'Gate de caminhão (entrada e saída)'],
  ['patio', 'Pátio de containers'],
  ['area_operacional', 'Área operacional'],
  ['cais', 'Cais e costado (operação de navio)'],
  ['pedestre', 'Acesso de pedestre'],
  ['credencial_motorista', 'Credencial de motorista'],
]);

/** Categorias da CNH: A moto, B carro, C caminhão, D ônibus, E articulado; pares AB..AE. */
export const CNH_CATEGORIES = opts([
  ['A', 'A · motocicleta'],
  ['B', 'B · carro e utilitário'],
  ['C', 'C · caminhão'],
  ['D', 'D · ônibus'],
  ['E', 'E · carreta e caminhão articulado'],
  ['AB', 'AB · moto e carro'],
  ['AC', 'AC · moto e caminhão'],
  ['AD', 'AD · moto e ônibus'],
  ['AE', 'AE · moto e carreta'],
]);

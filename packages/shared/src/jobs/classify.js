// Classificação da vaga em uma área de atuação, por palavras-chave. Função pura.
//
// Regras:
//  1. O título decide. Vence a área com mais palavras-chave distintas no título; no empate, a que
//     aparece primeiro no título (em português o núcleo do cargo vem antes: "Motorista de betoneira");
//     persistindo o empate, a ordem de PRIORITY.
//  2. Sem palavra-chave no título, a descrição (só o começo) decide, mas exige ao menos duas palavras-chave
//     distintas da mesma área: uma menção solta ("controle de estoque") não muda a área da vaga.
//  3. Sem área clara, a vaga é de servicos_gerais.
import { DEFAULT_JOB_AREA } from './areas.js';
import { foldText } from './text.js';

/**
 * Palavras-chave por área, já sem acento. Cada palavra casa como palavra inteira, com plural e feminino
 * opcionais no fim ("soldador" casa "soldadora" e "soldadores"). Frases aceitam espaços variáveis.
 * Termos curtos ou ambíguos ("obra", "transporte", "segurança") ficam de fora de propósito: aparecem
 * em descrições de qualquer área ("mão de obra", "vale transporte", "normas de segurança").
 */
const KEYWORDS = {
  metalurgia: [
    'soldador', 'solda', 'soldagem', 'caldeireiro', 'caldeiraria', 'serralheiro', 'serralheria', 'metalurgico', 'metalurgia',
    'siderurgico', 'siderurgia', 'fundicao', 'fundidor', 'forjaria', 'forjador', 'usinagem', 'usinador', 'torneiro', 'fresador',
    'estrutura metalica', 'estruturas metalicas', 'laminador', 'galvanizacao', 'tratamento termico', 'ponteador',
  ],
  eletrica: [
    'eletricista', 'eletrica', 'eletrico', 'eletricidade', 'eletrotecnico', 'eletromecanico', 'instalacoes eletricas', 'subestacao',
    'alta tensao', 'baixa tensao', 'painel eletrico', 'paineis eletricos', 'quadro de comando', 'clp', 'automacao industrial', 'cabista',
  ],
  mecanica: [
    'mecanico', 'mecanica', 'manutencao mecanica', 'manutencao industrial', 'eletromecanico', 'funilaria', 'funileiro', 'lanternagem',
    'lanterneiro', 'borracheiro', 'auto center', 'autocenter', 'injecao eletronica', 'refrigeracao', 'ar condicionado',
    'montador de maquinas', 'lubrificador', 'retifica', 'ajustador', 'mecatronica',
  ],
  construcao: [
    'pedreiro', 'servente de obra', 'servente de obras', 'servente de pedreiro', 'ajudante de pedreiro', 'mestre de obras', 'mestre de obra',
    'encarregado de obra', 'encarregado de obras', 'obra civil', 'obras civis', 'construcao civil', 'construtora', 'engenheiro civil',
    'arquiteto', 'azulejista', 'ladrilhista', 'gesseiro', 'carpinteiro', 'armador', 'encanador', 'pintor', 'telhadista', 'impermeabilizador',
    'vidraceiro', 'marceneiro', 'topografo', 'pavimentacao', 'asfalto', 'betoneira', 'retroescavadeira', 'escavadeira',
    'operador de maquinas pesadas', 'tecnico em edificacoes', 'andaime', 'alvenaria', 'estucador',
  ],
  logistica: [
    'motorista', 'caminhoneiro', 'carreteiro', 'entregador', 'motoboy', 'motofretista', 'logistica', 'almoxarife', 'almoxarifado',
    'estoquista', 'estoque', 'conferente', 'empilhadeira', 'transpaleteira', 'separador de pedidos', 'separacao de pedidos', 'expedicao',
    'recebimento de mercadorias', 'carga e descarga', 'ajudante de carga', 'ajudante de caminhao', 'ajudante de deposito',
    'transportadora', 'frete', 'operador logistico', 'centro de distribuicao', 'armazem', 'picking', 'cross docking',
  ],
  saude: [
    'enfermeiro', 'enfermagem', 'dentista', 'odontologo', 'cirurgiao dentista', 'fisioterapeuta', 'farmaceutico', 'farmacia', 'nutricionista',
    'psicologo', 'cuidador de idosos', 'cuidador', 'fonoaudiologo', 'radiologia', 'biomedico', 'analises clinicas', 'laboratorio',
    'agente comunitario de saude', 'saude bucal', 'atendente de clinica', 'recepcionista de clinica', 'hospital', 'clinica',
    'posto de saude', 'medico',
  ],
  alimentacao: [
    'cozinheiro', 'cozinha', 'chef', 'padeiro', 'padaria', 'confeiteiro', 'confeitaria', 'pizzaiolo', 'churrasqueiro', 'acougueiro', 'acougue',
    'salgadeiro', 'garcom', 'garconete', 'lanchonete', 'barista', 'bartender', 'barman', 'merendeira', 'copeira', 'restaurante', 'buffet',
    'sushiman', 'lavador de pratos', 'manipulador de alimentos', 'industria de alimentos', 'pasteleiro', 'sorveteiro',
  ],
  comercio: [
    'vendedor', 'vendas', 'balconista', 'atendente de loja', 'operador de caixa', 'caixa', 'repositor', 'promotor de vendas', 'lojista',
    'consultor de vendas', 'gerente de loja', 'vitrinista', 'representante comercial', 'televendas', 'supermercado', 'loja', 'fiscal de loja',
    'prevencao de perdas',
  ],
  administrativo: [
    'administrativo', 'administrativa', 'recepcionista', 'secretaria', 'secretario', 'contador', 'contabil', 'contabilidade', 'financeiro',
    'faturamento', 'recursos humanos', 'departamento pessoal', 'rh', 'comprador', 'escritorio', 'telefonista', 'digitador', 'arquivista',
    'atendimento ao cliente', 'sac', 'call center', 'telemarketing', 'assistente comercial', 'cobranca', 'tesouraria',
  ],
  tecnologia: [
    'desenvolvedor', 'programador', 'analista de sistemas', 'analista de ti', 'ti', 'tecnologia da informacao', 'suporte tecnico',
    'tecnico de informatica', 'informatica', 'software', 'devops', 'engenheiro de software', 'redes de computadores', 'seguranca da informacao',
    'analista de dados', 'cientista de dados', 'dba', 'web designer', 'ux', 'front end', 'frontend', 'back end', 'backend', 'full stack',
    'fullstack', 'helpdesk', 'help desk', 'testador', 'qa', 'infraestrutura de ti',
  ],
  limpeza: [
    'limpeza', 'faxineiro', 'diarista', 'zelador', 'zeladoria', 'conservacao', 'higienizacao', 'higienizador', 'dedetizador',
    'servente de limpeza', 'lavanderia', 'asseio', 'limpador de vidros', 'passadeira', 'lavadeira', 'domestica',
  ],
  seguranca: [
    'vigilante', 'vigia', 'porteiro', 'seguranca patrimonial', 'seguranca privada', 'seguranca do trabalho', 'seguranca eletronica',
    'agente de seguranca', 'tecnico de seguranca', 'brigadista', 'bombeiro civil', 'cftv', 'controlador de acesso', 'monitor de cameras', 'ronda', 'tst',
  ],
  agropecuaria: [
    'agricultor', 'agricola', 'trabalhador rural', 'tratorista', 'operador de trator', 'colhedor', 'colheita', 'ordenhador', 'ordenha', 'vaqueiro',
    'tratador de animais', 'veterinario', 'medico veterinario', 'zootecnista', 'agronomo', 'agronomia', 'tecnico agropecuario', 'agropecuaria',
    'agropecuario', 'fazenda', 'pecuaria', 'avicultura', 'granja', 'suinocultura', 'lavoura', 'safra', 'horticultura', 'floricultura', 'caseiro', 'peao',
  ],
  educacao: [
    'professor', 'docente', 'instrutor', 'tutor', 'pedagogo', 'pedagogia', 'coordenador pedagogico', 'auxiliar de sala', 'monitor escolar',
    'orientador educacional', 'educador', 'creche', 'aulas',
  ],
  servicos_gerais: [
    'servicos gerais', 'auxiliar geral', 'ajudante geral', 'jardineiro', 'jardinagem', 'faz tudo', 'lavador de carros', 'lavador de veiculos',
    'chaveiro', 'servente', 'manutencao predial', 'auxiliar de manutencao', 'baba', 'manobrista',
  ],
  hospitalidade: [
    'camareira', 'camareiro', 'recepcionista de hotel', 'hotel', 'pousada', 'hostel', 'resort', 'governanta', 'concierge', 'mensageiro',
    'bagageiro', 'turismo', 'agente de viagens', 'cerimonialista', 'hotelaria', 'recreacionista', 'monitor de recreacao', 'mordomo',
    'organizador de eventos', 'assistente de eventos', 'hospedagem',
  ],
};

/** Ordem do desempate final: as áreas específicas antes das genéricas. */
const PRIORITY = [
  'metalurgia', 'eletrica', 'mecanica', 'construcao', 'saude', 'tecnologia', 'seguranca', 'educacao',
  'agropecuaria', 'hospitalidade', 'alimentacao', 'limpeza', 'logistica', 'comercio', 'administrativo', 'servicos_gerais',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fim da palavra com o feminino e o plural: "soldador" casa "soldadora" e "soldadores"; "enfermeiro", "enfermeira". */
function endingOf(word) {
  if (word.length <= 3) return escapeRe(word); // siglas (ti, rh, sac, qa): exatas
  if (word.endsWith('or')) return `${escapeRe(word.slice(0, -2))}(?:or|ora|ores|oras)`;
  if (word.endsWith('om')) return `${escapeRe(word.slice(0, -2))}(?:om|ons)`;
  if (word.endsWith('o')) return `${escapeRe(word.slice(0, -1))}(?:o|a|os|as)`;
  return `${escapeRe(word)}(?:es|s)?`;
}

/** "soldador" -> palavra inteira, com feminino e plural. Frases: espaços variáveis; só a última palavra varia. */
function termRegex(term) {
  const words = term.split(' ');
  const last = words.pop();
  const body = [...words.map(escapeRe), endingOf(last)].join('\\s+');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`);
}

const RULES = PRIORITY.map((area) => ({ area, patterns: KEYWORDS[area].map(termRegex) }));

/** Quanto do começo da descrição entra na classificação. */
const DESCRIPTION_WINDOW = 2000;

/** Por área: quantas palavras-chave distintas casam e onde casa a primeira. */
function scan(folded) {
  const found = [];
  RULES.forEach(({ area, patterns }, order) => {
    let distinct = 0;
    let first = Infinity;
    for (const pattern of patterns) {
      const hit = pattern.exec(folded);
      if (hit) {
        distinct += 1;
        first = Math.min(first, hit.index);
      }
    }
    if (distinct > 0) found.push({ area, distinct, first, order });
  });
  return found;
}

function winner(found, minDistinct) {
  const eligible = found.filter((f) => f.distinct >= minDistinct);
  eligible.sort((a, b) => b.distinct - a.distinct || a.first - b.first || a.order - b.order);
  return eligible[0]?.area ?? null;
}

/**
 * Área (slug de JOB_AREAS) da vaga. Nunca devolve nulo: sem área clara, `servicos_gerais`.
 * @param {string} title
 * @param {string} [description]
 */
export function classifyJobArea(title, description = '') {
  const fromTitle = winner(scan(foldText(title)), 1);
  if (fromTitle) return fromTitle;
  const fromDescription = winner(scan(foldText(description).slice(0, DESCRIPTION_WINDOW)), 2);
  return fromDescription ?? DEFAULT_JOB_AREA;
}

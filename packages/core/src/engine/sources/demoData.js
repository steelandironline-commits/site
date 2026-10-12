// Clearly fictional companies for DEMO_MODE. All domains use the reserved
// `.example` TLD (RFC 2606) so nothing here can point to a real business.

export const DEMO_PREFIXES = {
  Indústria: ['Indústria Porto Atlântico', 'Indústria Alpha Meridional', 'Indústria Vale do Aço Novo', 'Indústria Serra Clara'],
  Metalurgia: ['Metalúrgica Vale Norte', 'Metalúrgica Ferro Leste', 'Metalúrgica Brasa Sul'],
  'Construção civil': ['Construtora Pedra Alta', 'Construtora Horizonte Azul', 'Engenharia Marco Zero'],
  Logística: ['Logística Horizonte Sul', 'Distribuidora Rota Quarenta', 'Armazéns Cais Novo'],
  Agronegócio: ['Agro Cerrado Vivo', 'Cooperativa Campo Claro', 'Grãos Planalto Verde'],
  'Alimentos e bebidas': ['Alimentos Campo Claro', 'Laticínios Serra Mansa', 'Bebidas Fonte Nova'],
  Varejo: ['Rede Varejo Boa Praça', 'Atacado Ponto Central', 'Supermercados Dia Pleno'],
  Saúde: ['Hospital Santa Aurora', 'Clínicas Vida Plena', 'Laboratório Ponto Vital'],
  Educação: ['Centro Educacional Novo Saber', 'Colégio Horizonte Aberto'],
  Tecnologia: ['Data Center Atlântico Sul', 'Tecnologia Prisma Norte'],
  Energia: ['Energia Solar Sol Nascente', 'Usina Ventos do Leste'],
  Mineração: ['Mineração Ferro Leste', 'Mineração Pedra Funda'],
  Automotivo: ['Autopeças Eixo Forte', 'Montadora Linha Azul'],
  Hotelaria: ['Hotel Mar Sereno', 'Resort Águas Claras'],
  Condomínios: ['Condomínio Parque das Águas', 'Residencial Jardim Aurora'],
};

export const DEMO_CITIES = [
  ['Joinville', 'SC'],
  ['Curitiba', 'PR'],
  ['Campinas', 'SP'],
  ['São Paulo', 'SP'],
  ['Belo Horizonte', 'MG'],
  ['Porto Alegre', 'RS'],
  ['Goiânia', 'GO'],
  ['Recife', 'PE'],
  ['Caxias do Sul', 'RS'],
  ['Sorocaba', 'SP'],
];

export const DEMO_SIGNALS = [
  {
    type: 'EXPANSION',
    text: 'A empresa anunciou expansão operacional com nova unidade fabril e aumento de capacidade produtiva previsto para os próximos meses.',
  },
  {
    type: 'CONSTRUCTION',
    text: 'Obra de ampliação do galpão industrial iniciada; licença de instalação publicada e reforma da área de produção em andamento.',
  },
  {
    type: 'PURCHASE',
    text: 'Abertura de cotação para fornecedores e homologação de novos parceiros de manutenção e serviços técnicos.',
  },
  {
    type: 'HIRING',
    text: 'Processo seletivo aberto: a empresa está contratando técnicos de manutenção e supervisores para o novo turno.',
  },
  {
    type: 'NEW_PROJECT',
    text: 'Novo projeto de modernização da planta com investimento previsto em automação e implantação de linha nova.',
  },
  {
    type: 'DEMAND',
    text: 'A empresa busca fornecedor para manutenção preventiva e precisa de terceirização de serviços especializados.',
  },
];

export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

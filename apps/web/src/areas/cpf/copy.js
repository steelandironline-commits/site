// Textos da área de pessoas para as telas que as duas áreas dividem (as telas pedem a cópia por
// props; nenhuma tem texto de área no próprio arquivo). Só vocabulário de pessoa física: nada de
// empresa, cobrança, equipe nem pagamento. A cópia da outra área está em ../cnpj/copy.js e nunca
// entra neste build.
import { formatCpf } from '@autopix/shared';

/** Página inicial da área de pessoas. O rodapé cita só a própria marca (ARQUITETURA 11, item 3). */
export const HOME = {
  disclaimer: 'Tem CPF não tem vínculo com a Receita Federal.',
};

/** Página "Vagas". Só vocabulário de pessoa física; "contratante" é quem publicou a vaga. */
export const VAGAS = {
  title: 'Vagas',
  subtitle: 'Vagas da sua área de atuação, com o contato direto, o prazo e um sinal de confiança. As vagas de logística aparecem para todas as áreas.',
  searchLabel: 'Buscar vagas',
  searchPlaceholder: 'Buscar por cargo, contratante ou palavra da vaga',
  areaLabel: 'Área',
  areaAll: 'Todas as que posso ver',
  needsArea: {
    title: 'Escolha a sua área de atuação',
    message: 'Sem a área, você vê só as vagas de logística, que servem para qualquer área.',
    link: 'Meu perfil',
  },
  demo: { title: 'Dados de demonstração', message: 'As vagas abaixo são fictícias e servem só para mostrar como a página funciona.' },
  notConfigured: {
    title: 'Fonte de vagas não configurada',
    message: 'Ainda não há uma fonte de vagas ligada neste ambiente. Quando ela for ligada, as vagas aparecem aqui.',
  },
  waiting: { title: 'Buscando as primeiras vagas…', message: 'A primeira busca leva alguns minutos. Esta página atualiza sozinha.' },
  empty: { title: 'Nenhuma vaga para você agora', message: 'Volte mais tarde ou confira a área escolhida em Meu perfil.' },
  emptySearch: { title: 'Nenhuma vaga com essa busca', message: 'Tente outra palavra ou limpe a busca.' },
  loadError: 'Não foi possível carregar as vagas.',
  unknownEmployer: 'Contratante não informado',
  unknownPlace: 'Local não informado',
  noContact: 'Sem contato na vaga. Veja os detalhes na fonte.',
  scoreNote: 'Indicador automático, feito só com o texto do anúncio. Não é avaliação oficial da empresa.',
  seeFull: 'ver completo',
  seeLess: 'ver menos',
  seeSource: 'ver na fonte',
};

export const COPY = {
  login: {
    subtitle: 'Entre para acompanhar o seu perfil e os avisos da sua conta.',
    identifier: {
      label: 'CPF',
      hint: 'Use o CPF do seu cadastro.',
      placeholder: '000.000.000-00',
      mask: formatCpf,
    },
  },
  activate: {
    invalidHelp: 'Links de verificação são de uso único e expiram em 48 horas. Se você esperava esta mensagem, volte ao cadastro para reenviar o link.',
  },
  layout: {
    offline: 'Reconecte para ver as novidades.',
  },
  activity: {
    subtitle: 'Tudo o que aconteceu na sua conta, em ordem cronológica.',
    empty: 'Os eventos aparecem aqui assim que a sua conta tiver atividade.',
    filters: [
      { key: '', label: 'Tudo' },
      { key: 'SYSTEM', label: 'Sistema' },
    ],
    eventLink: () => null,
  },
  social: {
    emptyNote: 'Depois que um serviço seu for concluído e confirmado pelo cliente, você poderá compartilhar sua opinião e uma foto.',
    emptyAction: null,
  },
  confirm: {
    afterConfirm: () => '/app',
  },
  operations: {
    subtitle: 'O que você faz, o que possui e onde trabalha. É isso que decide quais serviços e vagas chegam até você.',
  },
  settings: {
    whatsapp: {
      verified: 'Receba seus avisos de vagas e serviços no WhatsApp.',
    },
    notificationCategories: [{ key: 'SYSTEM', label: 'Sistema' }],
    environment: {
      demo: 'Modo demonstração ativo: os dados desta conta são fictícios.',
      production: 'Modo produção: somente atividades reais da sua conta.',
    },
  },
};

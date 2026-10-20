// Textos da área de pessoas para as telas que as duas áreas dividem (as telas pedem a cópia por
// props; nenhuma tem texto de área no próprio arquivo). Só vocabulário de pessoa física: nada de
// empresa, cobrança, equipe nem pagamento. A cópia da outra área está em ../cnpj/copy.js e nunca
// entra neste build.
import { formatCpf } from '@autopix/shared';

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

/**
 * The descent: one floating island per chapter, stacked downwards.
 * Palette per chapter drives the page background, the fog and the lights
 * while the camera travels between islands.
 */
export const CHAPTERS = [
  {
    id: 'cidade',
    rail: 'Início',
    kicker: 'Transporte · Pessoas · Serviços · Pix',
    title: 'Tem emprego, tem rota, tem serviço. TemPix.',
    body: 'Clientes, cargas, vagas e serviços chegam no seu WhatsApp, com pagamento assegurado até a conclusão. Sem mensalidade, com taxas pequenas e transparentes.',
    palette: { top: '#1150d8', bottom: '#00237a', sky: '#d6e4ff', ground: '#0b2a6b', accent: '#ffdf00' },
  },
  {
    id: 'demanda',
    rail: 'Cliente',
    kicker: 'Tem cliente · demanda e procura',
    title: 'Quem precisa encontra quem oferece.',
    body: 'O TemPix lê sinais públicos, como expansões, obras e novas unidades, e mostra quem precisa do que a sua empresa faz. Cada oportunidade chega com nota de 0 a 100.',
    palette: { top: '#1d8a8a', bottom: '#062a2e', sky: '#b4fff1', ground: '#0d3236', accent: '#2ad1b8' },
  },
  {
    id: 'terminais',
    rail: 'Carga',
    kicker: 'Tem carga · terminais e transportadoras',
    title: 'A carga encontra o caminhão.',
    body: 'Terminais e indústrias publicam cargas. O TemPix entrega cada uma à transportadora certa, pela rota, capacidade e janela de coleta.',
    palette: { top: '#d0814a', bottom: '#3a1912', sky: '#ffd9b0', ground: '#3d1f17', accent: '#ffb35c' },
  },
  {
    id: 'trajeto',
    rail: 'Rota',
    kicker: 'Tem rota · trajeto e destino',
    title: 'Da coleta à entrega, cada etapa no painel.',
    body: 'Saída, paradas e chegada viram eventos registrados. A chegada é evidência da operação: o pagamento só é liberado com confirmação.',
    palette: { top: '#6a4bc0', bottom: '#150d30', sky: '#dccbff', ground: '#24173f', accent: '#b69bff' },
  },
  {
    id: 'pessoas',
    rail: 'Emprego',
    kicker: 'Tem emprego · empresa contratando',
    title: 'A vaga abre. O profissional começa.',
    body: 'Empresas encontram profissionais da região para vagas e serviços sob demanda, e a contratação fica registrada no painel.',
    palette: { top: '#3f9a63', bottom: '#0b2a1b', sky: '#c9ffd9', ground: '#14301f', accent: '#5fe39a' },
  },
  {
    id: 'pix',
    rail: 'Garantia',
    kicker: 'Tem garantia · pagamento assegurado',
    title: 'Pagamento assegurado até a conclusão.',
    body: 'Em obras, serviços, rotas e transportes, o valor fica protegido na instituição de pagamento parceira e só é liberado, por Pix, quando a conclusão é confirmada. O TemPix fica com 2% do contrato.',
    palette: { top: '#23b3a6', bottom: '#04282b', sky: '#c4fff6', ground: '#0a2f30', accent: '#4fe0c9' },
  },
  {
    id: 'painel',
    rail: 'Painel',
    kicker: 'Tem tudo · seu painel',
    title: 'Tudo isso numa tela só.',
    body: 'Clientes, cargas, equipes e recebimentos no mesmo lugar, no computador ou no celular. Sem mensalidade: 2% nos contratos e 3% do salário nas contratações, só quando o negócio fecha.',
    palette: { top: '#24365e', bottom: '#0a0b0d', sky: '#c7d6ff', ground: '#10141f', accent: '#2ad1b8' },
  },
];

export const N = CHAPTERS.length;
/** Vertical distance between islands, in world units. */
export const SPACING = 22;
/** Share of each chapter's scroll spent resting on its island before diving. */
export const HOLD = 0.55;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Scroll progress (0..1) -> camera level (float, 0..N-1) + where we are inside the chapter. */
export function levelFromProgress(p) {
  const x = Math.min(Math.max(p, 0), 1) * N;
  const k = Math.min(Math.floor(x), N - 1);
  const u = Math.min(x - k, 1);
  if (k === N - 1) return { level: k, k, hold: Math.min(u / HOLD, 1) };
  if (u < HOLD) return { level: k, k, hold: u / HOLD };
  return { level: k + easeInOut((u - HOLD) / (1 - HOLD)), k, hold: 1 };
}

/** Scroll progress where chapter k is fully in view (used by the rail and the buttons). */
export const progressForChapter = (k) => (k <= 0 ? 0 : Math.min((k + 0.08) / N, 1));

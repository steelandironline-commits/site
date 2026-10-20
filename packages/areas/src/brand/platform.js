// Marca da plataforma, comum às duas áreas (remetente de e-mail, Web Push, textos jurídicos).
// Também é o conjunto de textos do build legado (apps/web/src/main.jsx), que convive até o go-live.
export const PLATFORM_NAME = 'TemPix';

/** Conjunto entregue ao BrandProvider (@autopix/ui). */
export const PLATFORM_BRAND = Object.freeze({
  name: PLATFORM_NAME,
  wordmark: Object.freeze(['Tem', 'Pix']),
  slogan: 'Tem emprego, tem rota, tem serviço. TemPix.',
  support: 'Clientes, cargas, profissionais e Pix numa tela só.',
});

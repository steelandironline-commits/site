// Marca da área de empresas. Este arquivo não importa nada e não cita outra área.
// Slogan e linha de apoio são provisórios: o texto final é da ETAPA 6.
export const AREA_NAME = 'Tem CNPJ';

/** Conjunto entregue ao BrandProvider (@autopix/ui) pela entrada desta área. */
export const AREA_BRAND = Object.freeze({
  name: AREA_NAME,
  wordmark: Object.freeze(['Tem', 'CNPJ']),
  slogan: 'Tem cliente, tem carga, tem serviço. Tem CNPJ.',
  support: 'Clientes, cargas, equipes e Pix numa tela só.',
});

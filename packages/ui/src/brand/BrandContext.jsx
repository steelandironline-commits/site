import { createContext, useContext, useMemo } from 'react';

const BrandContext = createContext(null);

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * A marca vem de quem monta o app, nunca do pacote: este arquivo não tem texto de marca
 * nem valor padrão. Cada entrada de build (legado ou área) entrega o seu conjunto:
 *
 *   name      nome da marca ("aria-label" do logo, links de volta ao início)
 *   wordmark  [parte clara, parte em destaque] do nome escrito no logo
 *   slogan    frase de abertura das telas de acesso
 *   support   linha de apoio, no rodapé da lateral das telas de acesso
 */
export function BrandProvider({ brand, children }) {
  if (!brand || !isText(brand.name) || !isText(brand.slogan) || !isText(brand.support) || !Array.isArray(brand.wordmark) || !brand.wordmark.every(isText) || brand.wordmark.length !== 2) {
    throw new TypeError('BrandProvider: "brand" precisa de name, wordmark (duas partes), slogan e support.');
  }
  const value = useMemo(() => brand, [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

/** Marca da entrada atual. Falha alto se a entrada esqueceu o BrandProvider. */
export function useBrand() {
  const brand = useContext(BrandContext);
  if (!brand) throw new Error('useBrand: falta o BrandProvider na entrada do app.');
  return brand;
}

// SOMENTE SERVIDOR (API, worker, build e testes). O navegador nunca importa este
// arquivo: ele cita as duas áreas. A marca fica em subcaminhos que o navegador
// importa um a um: @autopix/areas/brand/platform e @autopix/areas/brand/<área>.
export {
  AREAS,
  AREA_HOST_VARS,
  REDIRECT_HOST_VARS,
  isArea,
  areaOf,
  parseHost,
  hostnameOf,
  hostFor,
} from './areas.js';
export { urlFor } from './urls.js';

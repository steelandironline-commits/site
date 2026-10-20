import Settings from '../../pages/app/Settings.jsx';
import { COPY } from './copy.js';

// Configurações da pessoa: senha, WhatsApp, avisos, sessões. Sem equipe e sem chave Pix de repasse.
export default function SettingsPage() {
  return <Settings copy={COPY.settings} />;
}

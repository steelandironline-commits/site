import Settings from '../../pages/app/Settings.jsx';
import { PayoutCard } from '../../pages/app/PayoutCard.jsx';
import { TeamCard } from '../../pages/app/TeamCard.jsx';
import { COPY } from './copy.js';

// Configurações da empresa: equipe (colaboradores com login por CPF) e chave Pix de recebimento.
export default function SettingsPage() {
  return <Settings copy={COPY.settings} team={(me) => <TeamCard me={me} />} payout={<PayoutCard />} />;
}

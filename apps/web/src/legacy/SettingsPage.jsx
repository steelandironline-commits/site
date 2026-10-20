import Settings from '../pages/app/Settings.jsx';
import { PayoutCard } from '../pages/app/PayoutCard.jsx';
import { TeamCard } from '../pages/app/TeamCard.jsx';
import { COPY } from './copy.js';

// Configurações do build legado: o cartão de equipe é só de conta de empresa; a chave Pix, das duas.
export default function SettingsPage() {
  return <Settings copy={COPY.settings} team={(me) => (me.company?.accountType !== 'PERSON' ? <TeamCard me={me} /> : null)} payout={<PayoutCard />} />;
}

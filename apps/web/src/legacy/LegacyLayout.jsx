import { useSession } from '@autopix/ui';
import AppLayout from '../pages/app/AppLayout.jsx';
import { ADMIN_NAV, BACK, NAV, onboardingPath } from '../legacyNav.js';
import { COPY } from './copy.js';

/**
 * Painel do build legado: o menu de sempre, que muda conforme a conta. Um item `companyOnly` some
 * para a pessoa física, `personLabel` troca o rótulo dela e o administrador da plataforma ganha o
 * item do admin no fim. As áreas não têm nada disto: cada uma tem o seu menu pronto (areas/<área>/nav.js).
 */
export default function LegacyLayout() {
  const { me } = useSession();
  const person = me?.company?.accountType === 'PERSON';
  const items = NAV.filter((item) => !item.companyOnly || !person).map((item) => ({ ...item, label: item.personLabel && person ? item.personLabel : item.label }));
  const nav = me?.user?.isPlatformAdmin ? [...items, ADMIN_NAV] : items;
  return <AppLayout nav={nav} back={BACK} onboardingTo={onboardingPath} copy={COPY.layout} />;
}

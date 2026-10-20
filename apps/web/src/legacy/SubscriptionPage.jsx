import { COMPANY_PRICING_FEATURES, PERSON_PRICING_FEATURES } from '@autopix/shared';
import { useSession } from '@autopix/ui';
import Subscription from '../pages/app/Subscription.jsx';

// Plano do build legado: a lista e o destaque dependem do tipo da conta, como sempre.
export default function SubscriptionPage() {
  const { me } = useSession();
  const company = me?.company?.accountType !== 'PERSON';
  return <Subscription features={company ? COMPANY_PRICING_FEATURES : PERSON_PRICING_FEATURES} gold={company} />;
}

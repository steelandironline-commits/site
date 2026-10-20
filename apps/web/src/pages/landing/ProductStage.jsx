/* Product preview: how an opportunity reaches someone, as a TemPix
   WhatsApp message on a phone. Paused while off-screen. */
import { useRef } from 'react';
import { useInView, usePrefersReducedMotion } from '@autopix/ui';
import PhoneChat from './PhoneChat.jsx';
import s from './landing.module.css';

export default function ProductStage() {
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: '150px' });
  const reduced = usePrefersReducedMotion();
  return (
    <div ref={ref} className={s.productStage}>
      <PhoneChat running={inView} reduced={reduced} />
    </div>
  );
}

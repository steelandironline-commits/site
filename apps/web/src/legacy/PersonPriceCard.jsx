import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { PERSON_PRICING_FEATURES } from '@autopix/shared';
import { BRLSymbol, BRLText, Button } from '@autopix/ui';
import { reveal } from '../pages/landing/reveal.js';
import s from '../pages/landing/landing.module.css';

/** Cartão de preço do cadastro de pessoa física, na página inicial do build legado (as áreas têm a sua própria home). */
export function PersonPriceCard() {
  return (
    <motion.article className={s.price} {...reveal}>
      <div className={s.priceTop}>
        <p className="eyebrow">Cadastro Pessoa Física · login pelo CPF</p>
        <p className={s.priceValue}>
          <BRLSymbol className={s.priceCurrency} style={{ verticalAlign: '0.19em', marginRight: '0.04em' }} />0<span className={s.pricePer}> para sempre</span>
        </p>
        <p className={s.priceNote}>Para trabalhadores e autônomos se identificarem e receberem vagas, serviços e fretes.</p>
      </div>
      <ul className={s.priceList}>
        {PERSON_PRICING_FEATURES.map((f) => (
          <li key={f}>
            <Check size={15} aria-hidden="true" /> <BRLText>{f}</BRLText>
          </li>
        ))}
      </ul>
      <Button to="/onboarding?tipo=profissional" size="lg" block variant="outline" iconRight={ArrowRight}>
        CADASTRAR GRÁTIS
      </Button>
    </motion.article>
  );
}

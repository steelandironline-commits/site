/* Product preview: a phone receiving a TemPix WhatsApp message with an
   opportunity, the person taps "Aceitar" and gets the confirmation.
   Scripted marketing illustration; it never reads or writes real data. */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, BatteryFull, CheckCheck, Gauge, MessageCircle, Mic, Radar, Reply, ShieldCheck, Signal, Video, Phone, Wifi } from 'lucide-react';
import { BRLText, LogoMark } from '@autopix/ui';
import s from './phone.module.css';

const SCENES = [
  {
    hello: 'Olá, João! Tudo bem?',
    title: 'Parabéns! Você foi selecionado para uma avaliação.',
    lines: ['Vaga: eletricista industrial', 'Construtora Lima · Joinville/SC', 'Avaliação: amanhã, às 9h'],
    foot: 'Pagamento assegurado até a conclusão.',
    done: 'Avaliação confirmada! Enviamos o endereço e o contato do responsável. Boa sorte, João!',
  },
  {
    hello: 'Boa tarde, Carlos!',
    title: 'Parabéns! Você foi selecionado para uma carga.',
    lines: ['Santos → Campinas · 212 km', 'Carga seca · 24 t · coleta hoje, 14h', 'Frete: R$ 4.800,00'],
    foot: 'Pagamento assegurado até a entrega.',
    done: 'Carga reservada! A rota e o contato do terminal já estão no seu painel.',
  },
  {
    hello: 'Olá, Bia!',
    title: 'Parabéns! Sua empresa foi selecionada para um orçamento.',
    lines: ['Manutenção industrial · 94% compatível', 'Metalúrgica Silva · Joinville/SC', 'Estimativa: R$ 18.000,00'],
    foot: 'Pagamento assegurado até a conclusão.',
    done: 'Proposta enviada! Avisamos aqui assim que o cliente responder.',
  },
];

/* A calm script (ms from the start of each conversation). */
const PHASES = [
  ['banner', 600],
  ['bannerOut', 3600],
  ['typing1', 3900],
  ['hello', 5300],
  ['typing2', 6300],
  ['card', 8000],
  ['buttons', 8700],
  ['tap', 12000],
  ['reply', 12600],
  ['read', 13600],
  ['typing3', 14400],
  ['done', 16000],
  ['end', 23000],
];
const AT = Object.fromEntries(PHASES.map(([k], i) => [k, i]));

const STEPS = [
  { Icon: Radar, title: 'Agentes encontram a oportunidade', text: 'Vagas, cargas e clientes da sua região' },
  { Icon: Gauge, title: 'Nota de compatibilidade', text: 'Só chega o que combina com você' },
  { Icon: MessageCircle, title: 'Mensagem no WhatsApp', text: 'Na hora, no seu celular' },
  { Icon: Reply, title: 'Aceitar ou recusar', text: 'Com um toque, sem ligação' },
  { Icon: ShieldCheck, title: 'Pagamento assegurado', text: 'Até a conclusão do trabalho' },
];

function stepOf(p) {
  if (p < AT.typing1) return 0;
  if (p < AT.card) return 1;
  if (p < AT.tap) return 2;
  if (p < AT.done) return 3;
  return 4;
}

const bubble = {
  initial: { opacity: 0, y: 14, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

function Typing() {
  return (
    <motion.div className={`${s.msg} ${s.in} ${s.typing}`} {...bubble} aria-label="TemPix está digitando">
      <i />
      <i />
      <i />
    </motion.div>
  );
}

function Time({ clock, read }) {
  return (
    <span className={s.time}>
      {clock}
      {read !== undefined && <CheckCheck size={14} className={read ? s.read : undefined} aria-label={read ? 'lida' : 'entregue'} />}
    </span>
  );
}

export default function PhoneChat({ running = true, reduced = false }) {
  const [scene, setScene] = useState(0);
  const [p, setP] = useState(reduced ? AT.done : -1);
  const clock = useMemo(() => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date()), []);
  const sc = SCENES[scene];

  useEffect(() => {
    if (reduced) {
      setP(AT.done);
      return undefined;
    }
    if (!running) return undefined;
    const from = p < 0 ? 0 : PHASES[p][1];
    if (p >= PHASES.length - 1) {
      const t = setTimeout(() => {
        setScene((n) => (n + 1) % SCENES.length);
        setP(-1);
      }, 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setP(p + 1), PHASES[p + 1][1] - from);
    return () => clearTimeout(t);
  }, [p, running, reduced]);

  const has = (k) => p >= AT[k];
  const typing = p === AT.typing1 || p === AT.typing2 || p === AT.typing3;
  const ending = p === AT.end;
  const step = stepOf(Math.max(p, 0));

  return (
    <div className={s.stage}>
      <ol className={s.steps} aria-label="Como a oportunidade chega até você">
        {STEPS.map(({ Icon, title, text }, i) => (
          <li key={title} className={i === step ? s.stepOn : i < step ? s.stepDone : undefined}>
            <span className={s.stepIcon}>
              <Icon size={16} aria-hidden="true" />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </li>
        ))}
      </ol>

      <div className={s.phone} aria-hidden="true">
        <div className={s.screen}>
          <div className={s.island} />
          <div className={s.status}>
            <span>{clock}</span>
            <span className={s.statusIcons}>
              <Signal size={12} />
              <Wifi size={12} />
              <BatteryFull size={14} />
            </span>
          </div>

          <AnimatePresence>
            {has('banner') && !has('bannerOut') && (
              <motion.div
                key={`banner-${scene}`}
                className={s.banner}
                initial={{ y: -90, opacity: 0 }}
                animate={{ y: 0, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } }}
                exit={{ y: -90, opacity: 0, transition: { duration: 0.35 } }}
              >
                <span className={s.bannerIcon}>
                  <LogoMark size={22} />
                </span>
                <span className={s.bannerText}>
                  <span className={s.bannerTop}>
                    <strong>TemPix</strong> <em>WhatsApp · agora</em>
                  </span>
                  <span>{sc.title}</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <header className={s.head}>
            <ArrowLeft size={18} />
            <span className={s.avatar}>
              <LogoMark size={22} />
            </span>
            <span className={s.who}>
              <strong>
                TemPix <BadgeCheck size={14} className={s.verified} />
              </strong>
              <small>{typing ? 'digitando…' : 'conta comercial'}</small>
            </span>
            <Video size={18} />
            <Phone size={16} />
          </header>

          <div className={s.body}>
            <motion.div key={scene} className={s.thread} animate={{ opacity: ending ? 0 : 1 }} transition={{ duration: 0.35 }}>
              <span className={s.day}>HOJE</span>
              <AnimatePresence initial={false}>
                {has('hello') && (
                  <motion.div key={`hello-${scene}`} className={`${s.msg} ${s.in}`} {...bubble}>
                    {sc.hello}
                    <Time clock={clock} />
                  </motion.div>
                )}
                {has('card') && (
                  <motion.div key={`card-${scene}`} className={`${s.msg} ${s.in} ${s.card}`} {...bubble}>
                    <strong className={s.cardTitle}>🎉 {sc.title}</strong>
                    <ul>
                      {sc.lines.map((l) => (
                        <li key={l}><BRLText>{l}</BRLText></li>
                      ))}
                    </ul>
                    <span className={s.cardFoot}>
                      <ShieldCheck size={13} /> {sc.foot}
                    </span>
                    <Time clock={clock} />
                  </motion.div>
                )}
                {has('buttons') && (
                  <motion.div key={`btns-${scene}`} className={s.buttons} {...bubble}>
                    <span className={`${s.btn} ${has('tap') ? s.btnTapped : ''}`}>
                      <Reply size={14} /> Aceitar
                      {has('tap') && !has('reply') && <span className={s.finger} />}
                    </span>
                    <span className={s.btn}>
                      <Reply size={14} /> Recusar
                    </span>
                  </motion.div>
                )}
                {has('reply') && (
                  <motion.div key={`reply-${scene}`} className={`${s.msg} ${s.out}`} {...bubble}>
                    Aceitar
                    <Time clock={clock} read={has('read')} />
                  </motion.div>
                )}
                {has('done') && (
                  <motion.div key={`done-${scene}`} className={`${s.msg} ${s.in}`} {...bubble}>
                    ✅ {sc.done}
                    <Time clock={clock} />
                  </motion.div>
                )}
                {typing && <Typing key={`typing-${p}`} />}
              </AnimatePresence>
            </motion.div>
          </div>

          <footer className={s.input}>
            <span className={s.field}>Mensagem</span>
            <span className={s.mic}>
              <Mic size={16} />
            </span>
          </footer>
        </div>
      </div>

      <div className={s.stepNow} aria-hidden="true">
        <span className={s.stepBar}>
          {STEPS.map((x, i) => (
            <i key={x.title} className={i <= step ? s.barOn : undefined} />
          ))}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={step} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }}>
            {STEPS[step].title}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

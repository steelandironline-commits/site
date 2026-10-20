import { useEffect, useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ClipboardList, MessageCircle, UserRound } from 'lucide-react';
import { EmptyState } from '@autopix/ui';
import { ActivityStream } from '../../components/activity/ActivityStream.jsx';
import { greeting } from '../../lib/time.js';
import s from '../../pages/app/app.module.css';
import o from './overview.module.css';

// Painel da área de pessoas. Não tem indicadores de empresa (oportunidades, busca, agentes): o painel
// é o atalho para o perfil, para o perfil operacional e para o Social, mais a atividade da conta.

const SHORTCUTS = [
  { to: '/app/perfil', title: 'Meu perfil', text: 'Seus dados, o trabalho que você faz e onde você mora.', Icon: UserRound },
  { to: '/app/operacao', title: 'Perfil operacional', text: 'O que você faz, o que possui e os certificados que tem.', Icon: ClipboardList },
  { to: '/app/social', title: 'Social', text: 'Compartilhe sua opinião sobre serviços concluídos.', Icon: MessageCircle },
];

export default function Overview() {
  const { stream, me } = useOutletContext();
  const firstName = useMemo(() => me.user.name.split(' ')[0], [me.user.name]);

  useEffect(() => {
    document.title = 'Visão Geral';
  }, []);

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>
            {greeting()}, {firstName}.
          </h1>
          <p className={s.pageSub}>Seu cadastro está ativo. Complete o perfil para receber vagas e serviços da sua região.</p>
        </div>
      </header>

      <div className={o.shortcuts}>
        {SHORTCUTS.map(({ to, title, text, Icon }) => (
          <Link key={to} to={to} className={o.shortcut}>
            <Icon size={20} aria-hidden="true" />
            <strong>{title}</strong>
            <span>{text}</span>
          </Link>
        ))}
      </div>

      <div className={s.section}>
        <ActivityStream
          events={stream.events}
          mode={stream.mode}
          loading={stream.loading}
          max={14}
          compact
          empty={<EmptyState title="Aguardando atividade" message="Os eventos da sua conta aparecem aqui em tempo real." />}
        />
      </div>
    </>
  );
}

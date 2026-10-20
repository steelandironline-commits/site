import { useEffect } from 'react';
import { Button, Logo, useBrand, useSession } from '@autopix/ui';
import s from './home.module.css';
import { HOME } from './copy.js';

/**
 * Página inicial mínima e neutra da área de pessoas. A home completa é das ETAPAS 5 e 6:
 * por enquanto só nomeia a marca e leva ao cadastro e ao acesso.
 */
export default function Home() {
  const { name, slogan } = useBrand();
  const { isAuthenticated } = useSession();

  useEffect(() => {
    document.title = name;
  }, [name]);

  return (
    <>
    <main className={s.home}>
      <div className={s.card}>
        <Logo size={34} />
        <h1 className={s.title}>{name}</h1>
        <p className={s.slogan}>{slogan}</p>
        <div className={s.actions}>
          {isAuthenticated ? (
            <Button to="/app" size="lg" block>
              Abrir painel
            </Button>
          ) : (
            <>
              <Button to="/onboarding" size="lg" block>
                Criar conta
              </Button>
              <Button to="/login" size="lg" variant="outline" block>
                Entrar
              </Button>
            </>
          )}
        </div>
      </div>
    </main>
    <footer className={s.footer}>
      <p>{HOME.disclaimer}</p>
    </footer>
    </>
  );
}

import { Logo } from '../components/brand/Logo.jsx';
import { Button } from '../components/ui/ui.jsx';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <Logo />
        <p className="eyebrow">Erro 404</p>
        <h1 style={{ fontSize: '2rem' }}>Página não encontrada.</h1>
        <p style={{ color: 'var(--muted)' }}>O endereço pode ter mudado ou não existe.</p>
        <Button to="/">Voltar ao início</Button>
      </div>
    </main>
  );
}

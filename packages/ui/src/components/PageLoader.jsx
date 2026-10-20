import { LogoMark } from '../brand/Logo.jsx';

export function PageLoader() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }} role="status" aria-label="Carregando">
      <LogoMark size={36} animated />
    </div>
  );
}

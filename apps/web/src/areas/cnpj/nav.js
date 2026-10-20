// Menu da área de empresas. Cada item aponta para uma página de PAGES.CNPJ (há teste de deriva).
import {
  Activity as ActivityIcon,
  Building2,
  ClipboardList,
  Cpu,
  CreditCard,
  HardHat,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  Network,
  Radar,
  Settings,
  Target,
  Truck,
} from 'lucide-react';
import { LogoMark } from '@autopix/ui';

/** `tab` leva o item à barra do celular; os demais ficam em "Mais". */
export const NAV = [
  { to: '/app', label: 'Visão Geral', shortLabel: 'Visão', icon: LayoutDashboard, end: true, tab: true },
  { to: '/app/radar', label: 'Radar', icon: Radar },
  { to: '/app/opportunities', label: 'Oportunidades', shortLabel: 'Oportun.', icon: Target, tab: true },
  { to: '/app/licitacoes', label: 'Licitações', icon: Landmark },
  { to: '/app/intermediacao', label: 'Intermediação', icon: Network },
  { to: '/app/social', label: 'Social', icon: MessageCircle, tab: true },
  { to: '/app/activity', label: 'Atividade', icon: ActivityIcon },
  // O símbolo da marca faz o papel de ícone do atalho de Pagamentos.
  { to: '/app/pay', label: 'Pagamentos', icon: LogoMark, tab: true },
  { to: '/app/freight', label: 'Cargas', icon: Truck },
  { to: '/app/workforce', label: 'Equipes', icon: HardHat },
  { to: '/app/agents', label: 'Agentes', icon: Cpu },
  { to: '/app/company', label: 'Empresa', icon: Building2 },
  { to: '/app/operacao', label: 'Perfil operacional', icon: ClipboardList },
  { to: '/app/subscription', label: 'Plano', icon: CreditCard },
  { to: '/app/settings', label: 'Configurações', icon: Settings },
];

/** Para onde vai uma sessão que ainda está no cadastro: com pagamento pendente, o checkout; senão, o cadastro. */
export const onboardingPath = (me) => (me.user.status === 'PENDING_PAYMENT' ? '/checkout' : '/onboarding');

/** Páginas internas ganham um cabeçalho de volta no celular: [caminho, destino, rótulo]. */
export const BACK = [
  [/^\/app\/opportunities\/[^/]+$/, '/app/opportunities', 'Oportunidades'],
  [/^\/app\/payments\/[^/]+$/, '/app/pay', 'Pagamentos'],
  [/^\/app\/pay\/transactions\/[^/]+$/, '/app/pay', 'Pagamentos'],
  [/^\/app\/freight\/matches\/[^/]+$/, '/app/freight', 'Cargas'],
  [/^\/app\/workforce\/matches\/[^/]+$/, '/app/workforce', 'Equipes'],
  [/^\/app\/confirm\/[^/]+$/, '/app', 'Painel'],
];

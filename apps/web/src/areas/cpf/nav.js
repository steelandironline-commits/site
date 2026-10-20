// Menu da área de pessoas. Cada item aponta para uma página de PAGES.CPF (há teste de deriva).
import { Activity as ActivityIcon, ClipboardList, LayoutDashboard, MessageCircle, Settings } from 'lucide-react';

/** `tab` leva o item à barra do celular; os demais ficam em "Mais". */
export const NAV = [
  { to: '/app', label: 'Visão Geral', shortLabel: 'Visão', icon: LayoutDashboard, end: true, tab: true },
  { to: '/app/social', label: 'Social', icon: MessageCircle, tab: true },
  { to: '/app/activity', label: 'Atividade', icon: ActivityIcon, tab: true },
  { to: '/app/operacao', label: 'Perfil operacional', icon: ClipboardList },
  { to: '/app/settings', label: 'Configurações', icon: Settings },
];

/** Sessão ainda no cadastro: sempre o cadastro. A área de pessoas não tem cobrança, então não tem checkout. */
export const onboardingPath = () => '/onboarding';

/** Páginas internas ganham um cabeçalho de volta no celular: [caminho, destino, rótulo]. */
export const BACK = [[/^\/app\/confirm\/[^/]+$/, '/app', 'Painel']];

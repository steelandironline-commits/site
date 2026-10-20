// @autopix/ui: template comum das áreas (componentes, utilitários e estilos genéricos).
// Sem texto, rota ou endpoint específico de área. Cada bloco abaixo reexporta um grupo de módulos.

// Componentes de interface
export * from './components/ui.jsx';
export * from './components/PageLoader.jsx';

// Marca (contexto fornecido pela entrada do app), logo e símbolo do real
export * from './brand/BrandContext.jsx';
export * from './brand/BRLIcon.jsx';
export * from './brand/Logo.jsx';

// Layout e campos de autenticação
export * from './auth/AuthShell.jsx';
export * from './auth/PasswordInput.jsx';

// Cliente HTTP, hooks e sessão
export * from './lib/api.js';
export * from './lib/hooks.js';
export * from './lib/session.jsx';

// PWA (service worker, instalação, push) e fluxo de atividade
export * from './lib/pwa.js';
export * from './lib/activityStream.js';

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ROOT_DIR, buildPlatform } from '@autopix/core';
import { buildLimiters, csrfGuard } from './middleware/security.js';
import { ANY_AREA, areaOrigins, hostArea, initAreaMounts, mountArea } from './middleware/area.js';
import { areaSpa } from './middleware/spa.js';
import { loadSession } from './middleware/session.js';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { companyRoutes } from './routes/company.js';
import { profileRoutes } from './routes/profile.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { activityRoutes } from './routes/activity.js';
import { agentRoutes } from './routes/agents.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { paymentRoutes } from './routes/payments.js';
import { webhookRoutes } from './routes/webhooks.js';
import { subscriptionRoutes } from './routes/subscription.js';
import { teamRoutes } from './routes/team.js';
import { cepRoutes, configRoutes, healthRoutes, sessionRoutes } from './routes/system.js';
import { actionRoutes, challengeRoutes } from './routes/actions.js';
import { whatsappRoutes, whatsappWebhookRoutes } from './routes/whatsapp.js';
import { notificationRoutes } from './routes/notifications.js';
import { freightRoutes, workforceRoutes, eventRoutes } from './routes/domains.js';
import { tenderRoutes } from './routes/tenders.js';
import { payRoutes, adminRoutes } from './routes/pay.js';
import { socialRoutes } from './routes/social.js';
import { intermediationRoutes } from './routes/intermediation.js';

/** All business services come from the shared platform composition root. */
export function buildServices(opts = {}) {
  return buildPlatform(opts);
}

export function createApp({ services = buildServices(), hub = null, serveWeb = true, webDist = path.join(ROOT_DIR, 'apps/web/dist') } = {}) {
  const { config } = services;
  const app = express();
  const limiters = buildLimiters(config);
  const ctx = { ...services, hub, limiters };

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway / reverse proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.isProduction ? undefined : false,
    }),
  );

  // Right after helmet (ARQUITETURA 6.4): picks the area by host, or 301/404. Legacy mode: no-op.
  app.use(hostArea(config));
  // Every API mount below goes through mountArea, which declares its areas (404 before auth).
  initAreaMounts(app, config);

  // CORS: only the origin of the request's own area (area mode) or APP_URL (legacy). No wildcard.
  const corsBase = {
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'Last-Event-ID', 'Authorization', 'X-TemPix-Client'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  };
  const ownOrigins = areaOrigins(config);
  app.use(
    '/api',
    cors(
      config.areas.enabled
        ? (req, cb) => {
            const own = ownOrigins.get(req.area);
            cb(null, { ...corsBase, origin: (origin, ok) => ok(null, !origin || (own !== undefined && origin === own)) });
          }
        : { ...corsBase, origin: (origin, cb) => cb(null, !origin || origin === new URL(config.appUrl).origin) },
    ),
  );

  // Webhooks need the raw body → mounted before the JSON parser.
  mountArea(app, '/api/webhooks', ANY_AREA, whatsappWebhookRoutes(ctx));
  mountArea(app, '/api/webhooks', ANY_AREA, webhookRoutes(ctx));

  app.use('/api/actions/PUBLISH_SOCIAL_POST', express.json({ limit: '750kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', limiters.api);
  app.use('/api', csrfGuard(config));
  app.use('/api', loadSession(ctx));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Hosts in which each mount exists (ARQUITETURA 6.5). Anywhere else: 404, before authentication.
  // Keep packages/areas/src/manifest.js (API_MOUNTS) in step: a drift test compares both.
  const CNPJ_ONLY = ['CNPJ'];
  const CPF_ONLY = ['CPF'];
  const BOTH = ['CNPJ', 'CPF'];
  const ALL = ['CNPJ', 'CPF', 'ADMIN'];
  // Q6: admin lives on ADMIN_HOST; without it, on the CNPJ host (platform-admin sessions only).
  const ADMIN_MOUNT = config.areas.hosts.ADMIN ? ['ADMIN'] : ['CNPJ', 'ADMIN'];

  mountArea(app, '/api/health', ANY_AREA, healthRoutes(ctx));
  mountArea(app, '/api/session', ALL, sessionRoutes(ctx));
  mountArea(app, '/api/cep', BOTH, cepRoutes(ctx));
  mountArea(app, '/api/config', BOTH, configRoutes(ctx));
  mountArea(app, '/api/auth', ALL, authRoutes(ctx));
  mountArea(app, '/api/me', ALL, meRoutes(ctx));
  mountArea(app, '/api/onboarding', BOTH, onboardingRoutes(ctx));
  mountArea(app, '/api/company', CNPJ_ONLY, companyRoutes(ctx));
  // The person's profile (ETAPA 5): only the CPF host. The company route above does not exist there.
  mountArea(app, '/api/profile', CPF_ONLY, profileRoutes(ctx));
  mountArea(app, '/api/opportunities', CNPJ_ONLY, opportunityRoutes(ctx));
  mountArea(app, '/api/activity', BOTH, activityRoutes(ctx));
  mountArea(app, '/api/agents', CNPJ_ONLY, agentRoutes(ctx));
  mountArea(app, '/api/dashboard', BOTH, dashboardRoutes(ctx));
  mountArea(app, '/api/payments', CNPJ_ONLY, paymentRoutes(ctx));
  mountArea(app, '/api/subscription', CNPJ_ONLY, subscriptionRoutes(ctx));
  mountArea(app, '/api/team', CNPJ_ONLY, teamRoutes(ctx));
  // Actions of another area answer 404 "Ação desconhecida" (ActionEngine, by the user's area).
  mountArea(app, '/api/actions', ALL, actionRoutes(ctx));
  mountArea(app, '/api/challenges', ALL, challengeRoutes(ctx));
  mountArea(app, '/api/whatsapp', BOTH, whatsappRoutes(ctx));
  mountArea(app, '/api/notifications', BOTH, notificationRoutes(ctx));
  mountArea(app, '/api/freight', CNPJ_ONLY, freightRoutes(ctx));
  mountArea(app, '/api/tenders', CNPJ_ONLY, tenderRoutes(ctx));
  mountArea(app, '/api/workforce', CNPJ_ONLY, workforceRoutes(ctx));
  mountArea(app, '/api/events', BOTH, eventRoutes(ctx));
  mountArea(app, '/api/pay', CNPJ_ONLY, payRoutes(ctx));
  mountArea(app, '/api/social', BOTH, socialRoutes(ctx));
  mountArea(app, '/api/intermediation', CNPJ_ONLY, intermediationRoutes(ctx));
  mountArea(app, '/api/admin', ADMIN_MOUNT, adminRoutes(ctx));
  app.use('/api', notFoundApi);

  // Area mode: each host gets only its own build, apps/web/dist-<area> (next to `webDist`).
  if (serveWeb && config.areas.enabled) {
    app.use(areaSpa({ webDist, areas: config.areas }));
  } else if (serveWeb && fs.existsSync(path.join(webDist, 'index.html'))) {
    // Legacy mode: serve the built SPA from the same origin (`webDist` is overridable for tests).
    app.use(
      '/assets',
      express.static(path.join(webDist, 'assets'), { immutable: true, maxAge: '1y', index: false }),
    );
    // The service worker and manifest must always be revalidated so updates ship.
    app.get(['/sw.js', '/manifest.webmanifest'], (req, res, next) => {
      res.set('Cache-Control', 'no-cache');
      next();
    });
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (/(sw\.js|manifest\.webmanifest)$/.test(filePath)) res.set('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('/{*splat}', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}


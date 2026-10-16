import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ROOT_DIR, buildPlatform } from '@autopix/core';
import { buildLimiters, csrfGuard } from './middleware/security.js';
import { loadSession } from './middleware/session.js';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { companyRoutes } from './routes/company.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { activityRoutes } from './routes/activity.js';
import { agentRoutes } from './routes/agents.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { paymentRoutes } from './routes/payments.js';
import { webhookRoutes } from './routes/webhooks.js';
import { subscriptionRoutes } from './routes/subscription.js';
import { teamRoutes } from './routes/team.js';
import { systemRoutes } from './routes/system.js';
import { actionRoutes } from './routes/actions.js';
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

export function createApp({ services = buildServices(), hub = null, serveWeb = true } = {}) {
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

  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || origin === new URL(config.appUrl).origin),
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'Last-Event-ID', 'Authorization', 'X-TemPix-Client'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );

  // Webhooks need the raw body → mounted before the JSON parser.
  app.use('/api/webhooks', whatsappWebhookRoutes(ctx));
  app.use('/api/webhooks', webhookRoutes(ctx));

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

  app.use('/api', systemRoutes(ctx));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/me', meRoutes(ctx));
  app.use('/api/onboarding', onboardingRoutes(ctx));
  app.use('/api/company', companyRoutes(ctx));
  app.use('/api/opportunities', opportunityRoutes(ctx));
  app.use('/api/activity', activityRoutes(ctx));
  app.use('/api/agents', agentRoutes(ctx));
  app.use('/api/dashboard', dashboardRoutes(ctx));
  app.use('/api/payments', paymentRoutes(ctx));
  app.use('/api/subscription', subscriptionRoutes(ctx));
  app.use('/api/team', teamRoutes(ctx));
  app.use('/api', actionRoutes(ctx));
  app.use('/api/whatsapp', whatsappRoutes(ctx));
  app.use('/api/notifications', notificationRoutes(ctx));
  app.use('/api/freight', freightRoutes(ctx));
  app.use('/api/tenders', tenderRoutes(ctx));
  app.use('/api/workforce', workforceRoutes(ctx));
  app.use('/api/events', eventRoutes(ctx));
  app.use('/api/pay', payRoutes(ctx));
  app.use('/api/social', socialRoutes(ctx));
  app.use('/api/intermediation', intermediationRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', notFoundApi);

  // Production: serve the built SPA from the same origin.
  const webDist = path.join(ROOT_DIR, 'apps/web/dist');
  if (serveWeb && fs.existsSync(path.join(webDist, 'index.html'))) {
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


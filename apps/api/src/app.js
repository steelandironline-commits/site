import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import {
  getConfig,
  getPrisma,
  ROOT_DIR,
  EmailService,
  ActivityService,
  AuthService,
  CompanyService,
  OnboardingService,
  OpportunityService,
  PaymentService,
  SubscriptionService,
  DashboardService,
  AgentService,
  JobQueue,
} from '@autopix/core';
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
import { systemRoutes } from './routes/system.js';

export function buildServices({ config = getConfig(), prisma = getPrisma(), email } = {}) {
  email ??= new EmailService({ config });
  return {
    config,
    prisma,
    email,
    activity: new ActivityService({ prisma }),
    auth: new AuthService({ prisma, config, email }),
    companies: new CompanyService({ prisma, config }),
    onboarding: new OnboardingService({ prisma, config }),
    opportunities: new OpportunityService({ prisma }),
    payments: new PaymentService({ prisma, config, email }),
    subscriptions: new SubscriptionService({ prisma, config }),
    dashboard: new DashboardService({ prisma }),
    agents: new AgentService({ prisma, config }),
    queue: new JobQueue({ prisma }),
  };
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
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'Last-Event-ID'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );

  // Webhooks need the raw body → mounted before the JSON parser.
  app.use('/api/webhooks', webhookRoutes(ctx));

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
  app.use('/api', notFoundApi);

  // Production: serve the built SPA from the same origin.
  const webDist = path.join(ROOT_DIR, 'apps/web/dist');
  if (serveWeb && fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(
      '/assets',
      express.static(path.join(webDist, 'assets'), { immutable: true, maxAge: '1y', index: false }),
    );
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

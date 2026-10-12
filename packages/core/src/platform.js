import { getPrisma } from './db.js';
import { getConfig } from './config.js';
import { EmailService } from './email/emailService.js';
import { EventEngine } from './events/EventEngine.js';
import { ActionEngine } from './actions/ActionEngine.js';
import { ChallengeService } from './actions/ChallengeService.js';
import { registerCoreActions } from './actions/definitions.js';
import { ActivityService } from './services/activityService.js';
import { AuthService } from './services/authService.js';
import { CompanyService } from './services/companyService.js';
import { OnboardingService } from './services/onboardingService.js';
import { OpportunityService } from './services/opportunityService.js';
import { PaymentService } from './services/paymentService.js';
import { SubscriptionService } from './services/subscriptionService.js';
import { DashboardService } from './services/dashboardService.js';
import { AgentService } from './services/agentService.js';
import { JobQueue } from './engine/jobQueue.js';
import { FreightService } from './domains/freightService.js';
import { WorkforceService } from './domains/workforceService.js';
import { PreferenceService } from './notifications/PreferenceService.js';
import { PushService } from './notifications/PushService.js';
import { NotificationRouter } from './notifications/NotificationRouter.js';
import { getWhatsAppProvider } from './whatsapp/index.js';
import { WhatsAppMessenger, WhatsAppNotifier } from './whatsapp/WhatsAppMessenger.js';
import { WhatsAppConnectionService } from './whatsapp/WhatsAppConnectionService.js';
import { WhatsAppCommandService } from './whatsapp/WhatsAppCommandService.js';
import { WhatsAppInboundService } from './whatsapp/WhatsAppInboundService.js';
import { RuleBasedIntentParser, LlmIntentParser } from './whatsapp/IntentParser.js';

/**
 * Composition root: ONE business logic layer shared by every client
 * (web/PWA, WhatsApp, future native apps) and by the worker.
 */
export function buildPlatform({ prisma = getPrisma(), config = getConfig(), email, whatsappProvider, push, llmGenerate } = {}) {
  email ??= new EmailService({ config });
  // Tests drive dispatch explicitly; elsewhere requests kick it and the worker is the safety net.
  const events = new EventEngine({ prisma, autoDispatch: !config.isTest });
  const s = {
    config,
    prisma,
    email,
    events,
    activity: new ActivityService({ prisma }),
    auth: new AuthService({ prisma, config, email }),
    companies: new CompanyService({ prisma, config }),
    onboarding: new OnboardingService({ prisma, config }),
    opportunities: new OpportunityService({ prisma, events }),
    payments: new PaymentService({ prisma, config, email, events }),
    subscriptions: new SubscriptionService({ prisma, config }),
    dashboard: new DashboardService({ prisma }),
    agents: new AgentService({ prisma, config }),
    queue: new JobQueue({ prisma }),
    freight: new FreightService({ prisma, config, events }),
    workforce: new WorkforceService({ prisma, config, events }),
    preferences: new PreferenceService({ prisma }),
    push: push ?? new PushService({ prisma, config }),
  };

  s.actions = registerCoreActions(new ActionEngine({ prisma, config, services: s }));
  s.challenges = new ChallengeService({ prisma, engine: s.actions });

  s.whatsappProvider = whatsappProvider ?? getWhatsAppProvider(config);
  s.whatsappMessenger = new WhatsAppMessenger({ prisma, provider: s.whatsappProvider });
  s.whatsappConnections = new WhatsAppConnectionService({ prisma, config, events, provider: s.whatsappProvider });
  const parser = config.intentParser === 'llm' && llmGenerate ? new LlmIntentParser({ generate: llmGenerate }) : new RuleBasedIntentParser();
  s.whatsappCommands = new WhatsAppCommandService({ prisma, parser, engine: s.actions, messenger: s.whatsappMessenger });
  s.whatsappInbound = new WhatsAppInboundService({
    prisma,
    provider: s.whatsappProvider,
    connections: s.whatsappConnections,
    commands: s.whatsappCommands,
    engine: s.actions,
    messenger: s.whatsappMessenger,
  });

  events.use(
    new NotificationRouter({
      prisma,
      config,
      preferences: s.preferences,
      whatsapp: new WhatsAppNotifier({ messenger: s.whatsappMessenger }),
      email,
      push: s.push,
    }),
  );
  return s;
}

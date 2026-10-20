export { getConfig, loadConfig, setConfig, ROOT_DIR } from './config.js';
export { getPrisma, disconnectPrisma } from './db.js';
export * from './errors.js';
export { logger } from './logger.js';
export { generateToken, hashToken, safeEqual, hmacHex } from './security/tokens.js';
export { areaOfUser, acceptedAreas, hostAccepts, accountTypeForHost, loginMessages } from './security/area.js';
export { hashPassword, verifyPassword } from './security/password.js';
export { EmailService } from './email/emailService.js';
export { CepService } from './geo/cepService.js';
export { TenderService } from './tenders/tenderService.js';
export { PncpClient, toTender } from './tenders/pncpClient.js';
export { ACTIVITY_CHANNEL } from './realtime/channel.js';

export { ActivityService, ACTIVITY_SELECT } from './services/activityService.js';
export { AuthService } from './services/authService.js';
export { CompanyService } from './services/companyService.js';
export { OnboardingService } from './services/onboardingService.js';
export { TeamService } from './services/teamService.js';
export { OpportunityService } from './services/opportunityService.js';
export { PaymentService } from './services/paymentService.js';
export { SubscriptionService } from './services/subscriptionService.js';
export { DashboardService } from './services/dashboardService.js';
export { AgentService } from './services/agentService.js';
export { ensureAgents, getAgentMap, resetAgentCache } from './services/agentRegistry.js';

export * from './payments/index.js';

export { JobQueue } from './engine/jobQueue.js';
export { Scheduler } from './engine/scheduler.js';
export { AgentOrchestrator } from './engine/AgentOrchestrator.js';
export { startWorker } from './engine/worker.js';
export { OpportunityDiscoveryService } from './engine/OpportunityDiscoveryService.js';
export { CompanyResearchService } from './engine/CompanyResearchService.js';
export { SignalDetectionService } from './engine/SignalDetectionService.js';
export { OpportunityScoringService } from './engine/OpportunityScoringService.js';
export { SalesIntelligenceService } from './engine/SalesIntelligenceService.js';
export * from './engine/sources/index.js';

export { buildPlatform } from './platform.js';
export { EventEngine } from './events/EventEngine.js';
export { ActionEngine } from './actions/ActionEngine.js';
export { ChallengeService } from './actions/ChallengeService.js';
export { registerCoreActions, describeResult } from './actions/definitions.js';
export { FreightService, DemoFreightSource } from './domains/freightService.js';
export { WorkforceService, DemoWorkforceSource } from './domains/workforceService.js';
export { PreferenceService } from './notifications/PreferenceService.js';
export { PushService } from './notifications/PushService.js';
export { NotificationRouter, composeNotification } from './notifications/NotificationRouter.js';
export * from './whatsapp/index.js';
export { WhatsAppMessenger, WhatsAppNotifier } from './whatsapp/WhatsAppMessenger.js';
export { WhatsAppConnectionService } from './whatsapp/WhatsAppConnectionService.js';
export { WhatsAppCommandService, HELP_TEXT } from './whatsapp/WhatsAppCommandService.js';
export { WhatsAppInboundService } from './whatsapp/WhatsAppInboundService.js';
export { RuleBasedIntentParser, LlmIntentParser, intentSchema, parseAmountCents, parseDate } from './whatsapp/IntentParser.js';

// TemPix Pay (financial layer)
export { FinancialAuditService, auditSourceFor } from './finance/FinancialAuditService.js';
export { CommissionService, DEFAULT_COMMISSION_RULES } from './finance/CommissionService.js';
export { MarketplaceTransactionService, TX_TITLES } from './finance/MarketplaceTransactionService.js';
export { ProtectedPaymentService } from './finance/ProtectedPaymentService.js';
export { RefundService } from './finance/RefundService.js';
export { DisputeService, EvidenceSummarizer, OPEN_DISPUTE_STATUSES } from './finance/DisputeService.js';
export { TripService, haversineM, geocodeCity, normalizeCity, ARRIVAL_RADIUS_M, NEAR_RADIUS_M } from './finance/TripService.js';
export { ReconciliationService } from './finance/ReconciliationService.js';
export { AdminService } from './finance/AdminService.js';
export { createPlatformAdmin } from './services/platformAdminService.js';

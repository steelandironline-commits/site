/** Map an authenticated HTTP request to an ActionEngine actor + channel. */
export function actorOf(req) {
  // Client hint for the financial audit trail only (never for authorization).
  const client = req.get?.('x-autopix-client') === 'pwa' ? 'pwa' : 'web';
  return { userId: req.user?.id, sessionId: req.session?.id, sessionScope: req.session?.scope, client };
}

export function channelOf(req) {
  return req.authVia === 'bearer' ? 'API' : 'WEB';
}

export function runAction(actions, req, action, input) {
  return actions.execute({ action, input, channel: channelOf(req), actor: actorOf(req), meta: { ip: req.ip, userAgent: req.get?.('user-agent') } });
}

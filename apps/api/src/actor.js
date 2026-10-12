/** Map an authenticated HTTP request to an ActionEngine actor + channel. */
export function actorOf(req) {
  return { userId: req.user?.id, sessionId: req.session?.id, sessionScope: req.session?.scope };
}

export function channelOf(req) {
  return req.authVia === 'bearer' ? 'API' : 'WEB';
}

export function runAction(actions, req, action, input) {
  return actions.execute({ action, input, channel: channelOf(req), actor: actorOf(req), meta: { ip: req.ip } });
}

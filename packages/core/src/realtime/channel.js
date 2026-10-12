// Postgres LISTEN/NOTIFY channel used to fan out activity events from any
// process (API or worker) to the API instances holding SSE connections.
export const ACTIVITY_CHANNEL = 'autopix_activity';

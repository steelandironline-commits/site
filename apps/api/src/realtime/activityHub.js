import pg from 'pg';
import { ACTIVITY_CHANNEL, logger } from '@autopix/core';

/**
 * ActivityHub — fans out stored activity events to SSE subscribers.
 *
 * Primary: Postgres LISTEN/NOTIFY (works across API replicas and the
 * separate worker service). Fallback: polling the ActivityEvent table, used
 * automatically when LISTEN is unavailable (e.g. some connection poolers).
 */
export class ActivityHub {
  constructor({ activity, databaseUrl, pollMs = 3000 }) {
    this.activity = activity;
    this.databaseUrl = databaseUrl;
    this.pollMs = pollMs;
    this.subscribers = new Map(); // companyId -> Set<fn>
    this.mode = 'off';
    this.client = null;
    this.pollTimer = null;
    this.cursor = new Map(); // companyId -> Date (polling mode)
    this.stopped = false;
  }

  async start() {
    if (!this.databaseUrl) return this.#startPolling();
    try {
      await this.#connect();
    } catch (err) {
      logger.warn('LISTEN unavailable, falling back to polling', { err });
      this.#startPolling();
    }
    return this;
  }

  async #connect() {
    const client = new pg.Client({ connectionString: this.databaseUrl });
    client.on('error', (err) => {
      logger.warn('activity listener error', { err });
      this.#reconnect();
    });
    client.on('notification', (msg) => this.#onNotify(msg.payload));
    await client.connect();
    await client.query(`LISTEN ${ACTIVITY_CHANNEL}`);
    this.client = client;
    this.mode = 'listen';
    this.#stopPolling();
  }

  #reconnect() {
    if (this.stopped) return;
    this.client?.end().catch(() => {});
    this.client = null;
    this.#startPolling();
    setTimeout(() => {
      if (this.stopped) return;
      this.#connect().catch(() => this.#reconnect());
    }, 5000).unref?.();
  }

  #startPolling() {
    this.mode = 'poll';
    if (this.pollTimer) return this;
    const tick = async () => {
      for (const companyId of this.subscribers.keys()) {
        const since = this.cursor.get(companyId) || new Date();
        try {
          const events = await this.activity.since(companyId, since);
          for (const e of events) this.#dispatch(e);
          if (events.length) this.cursor.set(companyId, events[events.length - 1].createdAt);
        } catch (err) {
          logger.warn('activity poll failed', { err });
        }
      }
    };
    this.pollTimer = setInterval(tick, this.pollMs);
    this.pollTimer.unref?.();
    return this;
  }

  #stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async #onNotify(payload) {
    let msg;
    try {
      msg = JSON.parse(payload);
    } catch {
      return;
    }
    if (!msg?.id || !this.subscribers.has(msg.companyId)) return;
    const event = await this.activity.getById(msg.id).catch(() => null);
    if (event) this.#dispatch(event);
  }

  #dispatch(event) {
    const subs = this.subscribers.get(event.companyId);
    if (!subs) return;
    for (const fn of subs) {
      try {
        fn(event);
      } catch {
        /* a broken socket must not affect others */
      }
    }
  }

  subscribe(companyId, fn) {
    if (!this.subscribers.has(companyId)) {
      this.subscribers.set(companyId, new Set());
      this.cursor.set(companyId, new Date());
    }
    this.subscribers.get(companyId).add(fn);
    return () => {
      const subs = this.subscribers.get(companyId);
      if (!subs) return;
      subs.delete(fn);
      if (!subs.size) {
        this.subscribers.delete(companyId);
        this.cursor.delete(companyId);
      }
    };
  }

  async stop() {
    this.stopped = true;
    this.#stopPolling();
    await this.client?.end().catch(() => {});
  }
}

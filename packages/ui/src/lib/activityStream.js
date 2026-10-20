import { useEffect, useRef, useState } from 'react';
import { api, API_BASE } from './api.js';

/**
 * Live activity for the signed-in company.
 * Primary transport: Server-Sent Events. Fallback: polling /api/activity.
 * Only events stored in the database are ever shown.
 */
export function useActivityStream({ enabled = true, initialLimit = 30, type } = {}) {
  const [events, setEvents] = useState([]);
  const [mode, setMode] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [latest, setLatest] = useState(null);
  const seen = useRef(new Set());

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let es;
    let pollTimer;
    let failures = 0;

    // `list` is chronological (oldest first); newest ends up on top.
    const ingest = (list, { prepend = true } = {}) => {
      const fresh = list.filter((e) => !seen.current.has(e.id) && (!type || e.type === type));
      fresh.forEach((e) => seen.current.add(e.id));
      if (!fresh.length) return;
      setEvents((prev) => (prepend ? [...fresh.reverse(), ...prev] : [...prev, ...fresh]).slice(0, 300));
      if (prepend) setLatest(fresh[0]);
    };

    const startPolling = () => {
      setMode('polling');
      const tick = async () => {
        try {
          const qs = new URLSearchParams({ limit: '30', ...(type ? { type } : {}) });
          const data = await api(`/api/activity?${qs}`, { quiet401: true });
          ingest([...data.items].reverse()); // oldest → newest
        } catch {
          /* keep polling */
        }
        if (!cancelled) pollTimer = setTimeout(tick, document.hidden ? 15000 : 5000);
      };
      pollTimer = setTimeout(tick, 5000);
    };

    (async () => {
      try {
        const qs = new URLSearchParams({ limit: String(initialLimit), ...(type ? { type } : {}) });
        const data = await api(`/api/activity?${qs}`);
        if (cancelled) return;
        data.items.forEach((e) => seen.current.add(e.id));
        setEvents(data.items);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      }
      if (cancelled) return;
      if (typeof EventSource === 'undefined') return startPolling();
      es = new EventSource(`${API_BASE}/api/activity/stream`, { withCredentials: true });
      es.addEventListener('ready', () => {
        failures = 0;
        setMode('live');
      });
      es.addEventListener('activity', (msg) => {
        try {
          ingest([JSON.parse(msg.data)]);
        } catch {
          /* ignore malformed */
        }
      });
      es.onerror = () => {
        failures += 1;
        if (failures >= 3 || es.readyState === EventSource.CLOSED) {
          es.close();
          startPolling();
        } else setMode('connecting');
      };
      return undefined;
    })();

    return () => {
      cancelled = true;
      es?.close();
      clearTimeout(pollTimer);
    };
  }, [enabled, initialLimit, type]);

  return { events, mode, loading, error, latest, setEvents };
}

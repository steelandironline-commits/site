import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patch } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

/** Shared handlers for the opportunity card buttons. */
export function useOpportunityActions({ onUpdated } = {}) {
  const [busy, setBusy] = useState({});
  const toast = useToast();
  const navigate = useNavigate();

  const run = useCallback(
    async (o, kind, body, success) => {
      setBusy((b) => ({ ...b, [o.id]: kind }));
      try {
        const { opportunity } = await patch(`/api/opportunities/${o.id}`, body);
        toast.success(success);
        onUpdated?.(opportunity);
        return opportunity;
      } catch (err) {
        toast.error(err.message || 'Não foi possível executar esta ação.');
        return null;
      } finally {
        setBusy((b) => ({ ...b, [o.id]: undefined }));
      }
    },
    [toast, onUpdated],
  );

  const generateApproach = useCallback(
    async (o) => {
      const updated = await run(o, 'approach', { generateApproach: true }, 'Abordagem gerada.');
      if (updated) navigate(`/app/opportunities/${o.id}#abordagem`);
    },
    [run, navigate],
  );
  const markContacted = useCallback((o) => run(o, 'contact', { status: 'CONTACTED' }, 'Marcada como em contato.'), [run]);

  return { busy, generateApproach, markContacted };
}

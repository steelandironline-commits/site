import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { executeAction } from '../../lib/actions.js';
import { useToast } from '../../lib/toast.jsx';

/** Card buttons → backend ActionEngine (no business logic in the client). */
export function useOpportunityActions({ onUpdated } = {}) {
  const [busy, setBusy] = useState({});
  const toast = useToast();
  const navigate = useNavigate();

  const run = useCallback(
    async (o, kind, action, success) => {
      setBusy((b) => ({ ...b, [o.id]: kind }));
      try {
        const out = await executeAction(action, { id: o.id });
        toast.success(success);
        onUpdated?.(out.result.opportunity);
        return out.result.opportunity;
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
      const updated = await run(o, 'approach', 'GENERATE_APPROACH', 'Abordagem gerada.');
      if (updated) navigate(`/app/opportunities/${o.id}#abordagem`);
    },
    [run, navigate],
  );
  const markContacted = useCallback((o) => run(o, 'contact', 'CONTACT_OPPORTUNITY', 'Marcada como em contato.'), [run]);
  const archive = useCallback((o) => run(o, 'archive', 'ARCHIVE_OPPORTUNITY', 'Oportunidade descartada.'), [run]);

  return { busy, generateApproach, markContacted, archive };
}

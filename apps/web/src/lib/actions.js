import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '@autopix/ui';
import { useToast } from './toast.jsx';

/**
 * Every business mutation goes through the backend ActionEngine:
 *   POST /api/actions/:name { input } → { status, result | challenge }
 * The client never reimplements business rules.
 */
export function executeAction(name, input = {}) {
  return post(`/api/actions/${name}`, { input });
}

/** Hook with toasts and automatic step-up redirect for sensitive actions. */
export function useAction() {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const run = useCallback(
    async (name, input, { success, key } = {}) => {
      setBusy(key || name);
      try {
        const out = await executeAction(name, input);
        if (out.status === 'CONFIRMATION_REQUIRED') {
          toast.info('Confirmação de segurança necessária.');
          navigate(out.challenge.confirmPath);
          return out;
        }
        if (success) toast.success(success);
        return out;
      } catch (err) {
        toast.error(err.message || 'Não foi possível executar esta ação.');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [navigate, toast],
  );
  return { run, busy };
}

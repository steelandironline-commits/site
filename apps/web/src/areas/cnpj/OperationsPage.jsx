import { Link } from 'react-router-dom';
import { Network } from 'lucide-react';
import { Button } from '@autopix/ui';
import { executeAction } from '../../lib/actions.js';
import Operations from '../../pages/app/Operations.jsx';
import { COPY } from './copy.js';

// Perfil operacional da empresa: lê /api/company e grava pela ação UPDATE_COMPANY_PROFILE.
export const SOURCE = {
  path: '/api/company',
  select: (data) => data.company,
  accountType: () => 'COMPANY',
  save: async (operationalProfile) => (await executeAction('UPDATE_COMPANY_PROFILE', { operationalProfile })).result.company,
  merge: (data, company) => ({ ...data, company: { ...data.company, ...company } }),
};

export default function OperationsPage() {
  return (
    <Operations
      source={SOURCE}
      copy={COPY.operations}
      headerAction={
        <Button to="/app/intermediacao" variant="outline" icon={Network}>
          Intermediação
        </Button>
      }
      note={
        <>
          Cidade, regiões, produtos e cliente ideal ficam em <Link to="/app/company">Empresa</Link>.
        </>
      }
    />
  );
}

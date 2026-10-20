import { Link } from 'react-router-dom';
import { put } from '@autopix/ui';
import Operations from '../../pages/app/Operations.jsx';
import { COPY } from './copy.js';

// Perfil operacional da pessoa: lê e grava só GET/PUT /api/profile. A rota de empresa não existe neste host.
const SOURCE = {
  path: '/api/profile',
  select: (data) => data.profile,
  accountType: () => 'PERSON',
  save: async (operationalProfile) => (await put('/api/profile', { operationalProfile })).profile,
  merge: (data, profile) => ({ ...data, profile: { ...data.profile, ...profile } }),
};

export default function OperationsPage() {
  return (
    <Operations
      source={SOURCE}
      copy={COPY.operations}
      note={
        <>
          CEP, cidade e serviços ficam em <Link to="/app/perfil">Meu perfil</Link>.
        </>
      }
    />
  );
}

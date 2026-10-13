import { useEffect, useState } from 'react';
import CrudPage from './components/CrudPage';
import { api } from '../../lib/api';
import type { Branch } from '../../lib/types';

export default function CashiersPage() {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    api<{ items: Branch[] }>('/api/admin/branches', { role: 'admin' })
      .then((res) => setBranches(res.items))
      .catch(() => undefined);
  }, []);

  return (
    <CrudPage
      title="Cajeros(as)"
      subtitle="Personal que opera las cajas. Elige quién está trabajando al iniciar la tablet."
      endpoint="/api/admin/cashiers"
      newLabel="Nuevo cajero(a)"
      nameLabel={(row) => row.name}
      fields={[
        {
          key: 'branch_id',
          label: 'Sucursal',
          type: 'select',
          options: branches.map((b) => ({ value: b.id, label: b.name })),
        },
        { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Ej. Ana López' },
      ]}
      columns={[
        { key: 'name', label: 'Cajero(a)' },
        { key: 'branch_name', label: 'Sucursal' },
      ]}
    />
  );
}

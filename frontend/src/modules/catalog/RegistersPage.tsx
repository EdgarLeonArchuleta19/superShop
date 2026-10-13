import { useEffect, useState } from 'react';
import CrudPage from './components/CrudPage';
import { api } from '../../lib/api';
import type { Branch } from '../../lib/types';

export default function RegistersPage() {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    api<{ items: Branch[] }>('/api/admin/branches', { role: 'admin' })
      .then((res) => setBranches(res.items))
      .catch(() => undefined);
  }, []);

  return (
    <CrudPage
      title="Cajas"
      subtitle="Cajas físicas de cada sucursal. A cada caja se le asigna una cajero(a) al iniciar sesión."
      endpoint="/api/admin/registers"
      newLabel="Nueva caja"
      nameLabel={(row) => row.name}
      fields={[
        {
          key: 'branch_id',
          label: 'Sucursal',
          type: 'select',
          options: branches.map((b) => ({ value: b.id, label: b.name })),
        },
        { key: 'name', label: 'Nombre de la caja', type: 'text', placeholder: 'Ej. Caja 1' },
      ]}
      columns={[
        { key: 'name', label: 'Caja' },
        { key: 'branch_name', label: 'Sucursal' },
      ]}
    />
  );
}

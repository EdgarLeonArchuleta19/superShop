import CrudPage from './components/CrudPage';

export default function BranchesPage() {
  return (
    <CrudPage
      title="Sucursales"
      subtitle="Todas las tiendas registradas. Puedes crear más aunque solo exista una por ahora."
      endpoint="/api/admin/branches"
      newLabel="Nueva sucursal"
      nameLabel={(row) => row.name}
      fields={[
        {
          key: 'name',
          label: 'Nombre de la sucursal',
          type: 'text',
          placeholder: 'Ej. Mi Tienda Centro',
        },
      ]}
      columns={[
        { key: 'name', label: 'Nombre' },
        {
          key: 'registers',
          label: 'Cajas',
          render: (row) => (
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {row.registers ?? 0} cajas
            </span>
          ),
        },
      ]}
    />
  );
}
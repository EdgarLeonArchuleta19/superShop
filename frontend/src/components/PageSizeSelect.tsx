import Select from './Select';

export const PAGE_SIZES = [10, 20, 30];

export default function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-muted">
      <span className="hidden text-[13px] sm:inline">Ver</span>
      <Select
        size="sm"
        className="w-[72px]"
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
      />
      <span className="hidden text-[13px] sm:inline">por página</span>
    </div>
  );
}
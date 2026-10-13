export default function Splash({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-ink">
      <div className="flex flex-col items-center gap-4">
        <span className="anim-spin-slow h-10 w-10 rounded-full border-[3px] border-brand-200 border-t-brand-600" />
        <p className="text-sm text-muted">{label}</p>
      </div>
    </div>
  );
}
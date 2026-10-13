import type { Survey } from './types';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toRows(surveys: Survey[]) {
  return surveys.map((s) => ({
    Fecha: fmtDate(s.created_at),
    Sucursal: s.branch_name || '—',
    Caja: s.register_name || '—',
    Cajera: s.cashier_name || '—',
    'Áreas a mejorar': s.areas.join(', '),
    'No gustó': s.dislikes.join(', '),
    'Por qué les gusta': s.likes.join(', '),
    Calificación: s.rating,
  }));
}

export async function exportExcel(
  surveys: Survey[],
  filename = `encuestas-super-nallely-${stamp()}`
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(toRows(surveys));
  ws['!cols'] = [
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 },
    { wch: 34 },
    { wch: 34 },
    { wch: 34 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Encuestas');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export interface PdfOptions {
  title?: string;
  subtitle?: string;
  summary?: { label: string; value: string }[];
  filename?: string;
}

let logoPromise: Promise<string | null> | null = null;

function loadLogo(): Promise<string | null> {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 180;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = '/logo-tienda.jpg';
  });
  return logoPromise;
}

export async function exportPdf(surveys: Survey[], opts: PdfOptions = {}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const logo = await loadLogo();
  let textX = 40;
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 40, 24, 38, 38);
      textX = 88;
    } catch {
      textX = 40;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(43, 70, 196);
  doc.text('Super Nallely – Encuestas de satisfacción', textX, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(opts.title || 'Reporte de encuestas', textX, 56);
  doc.text(`Generado: ${fmtDate(new Date().toISOString())}`, textX, 68);
  if (opts.subtitle) doc.text(`Filtros: ${opts.subtitle}`, textX, 80);

  let startY = opts.subtitle ? 96 : 84;

  if (opts.summary?.length) {
    const colWidth = (pageWidth - 80) / opts.summary.length;
    opts.summary.forEach((item, i) => {
      const x = 40 + i * colWidth;
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(x, startY, colWidth - 10, 46, 6, 6, 'F');
      doc.setTextColor(43, 70, 196);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(item.value, x + 10, startY + 22);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(item.label, x + 10, startY + 37);
    });
    startY += 60;
  }

  const body = surveys.map((s) => [
    fmtDate(s.created_at),
    s.branch_name || '—',
    s.register_name || '—',
    s.cashier_name || '—',
    s.areas.join(', '),
    s.dislikes.join(', '),
    s.likes.join(', '),
    String(s.rating),
  ]);

  autoTable(doc, {
    startY,
    head: [
      ['Fecha', 'Sucursal', 'Caja', 'Cajera', 'Áreas a mejorar', 'No gustó', 'Por qué les gusta', '★'],
    ],
    body,
    styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [43, 70, 196], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 95 },
      2: { cellWidth: 60 },
      3: { cellWidth: 85 },
      7: { cellWidth: 30, halign: 'center' },
    },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${opts.filename || `encuestas-super-nallely-${stamp()}`}.pdf`);
}

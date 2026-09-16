import {
  exportCsvText,
  type ExportFileInput,
} from "@/domains/ledger-ai/domain/exportFileTool";

const PDF_MARGIN = 40;
const PDF_BODY_WIDTH = 595 - PDF_MARGIN * 2; // A4 portrait, points

/** Build the Blob for an export_file call. PDF deps load on first use. */
export async function buildExportFile(input: ExportFileInput): Promise<Blob> {
  if (input.format === "csv") {
    return new Blob([exportCsvText(input)], {
      type: "text/csv;charset=utf-8",
    });
  }
  return buildPdf(input);
}

async function buildPdf(input: ExportFileInput): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = PDF_MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const title = input.title?.trim() || input.filename;
  doc.text(title, PDF_MARGIN, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  const subtitle = input.subtitle?.trim() || `Piggy · ${new Date().toLocaleDateString()}`;
  doc.text(subtitle, PDF_MARGIN, y);
  doc.setTextColor(0);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [input.columns],
    body: input.rows,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [236, 72, 153], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 245, 248] },
  });

  const notes = (input.notes ?? []).map((note) => note.trim()).filter(Boolean);
  if (notes.length > 0) {
    const table = (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable;
    y = (table?.finalY ?? y) + 22;
    doc.setFontSize(10);
    for (const note of notes) {
      const lines = doc.splitTextToSize(note, PDF_BODY_WIDTH) as string[];
      const height = lines.length * 13;
      if (y + height > doc.internal.pageSize.getHeight() - PDF_MARGIN) {
        doc.addPage();
        y = PDF_MARGIN;
      }
      doc.text(lines, PDF_MARGIN, y);
      y += height + 8;
    }
  }

  return doc.output("blob");
}

/** Trigger a browser download for a built file. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

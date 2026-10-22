import * as XLSX from 'xlsx';

/**
 * Export an array of flat objects to a .xlsx file and trigger browser download.
 * @param data    Array of plain objects (one per row)
 * @param filename  Desired filename WITHOUT extension
 * @param sheetName Optional sheet tab name (defaults to "Data")
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = 'Data',
): void {
  if (data.length === 0) {
    alert('No data to export.');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-size columns based on header + content widths
  const cols = Object.keys(data[0]).map(key => ({
    wch: Math.max(
      key.length,
      ...data.map(row => String(row[key] ?? '').length),
    ) + 2,
  }));
  ws['!cols'] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

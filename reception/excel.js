import ExcelJS from 'exceljs';
export async function readExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  let count = 0;
  const sheets = workbook.worksheets.map(sheet => {
    const rows = [];
    if (sheet.columnCount > 100 || sheet.rowCount > 5001) throw new Error('Máximo 5.000 filas de datos y 100 columnas por hoja.');
    sheet.eachRow((row, number) => {
      if (++count > 15000) throw new Error('El archivo contiene demasiadas filas.');
      const cells = [];
      for (let i=1;i<=sheet.columnCount;i++) {
        const cell = row.getCell(i), value = cell.value;
        // No ejecutar fórmulas ni usar sus resultados cacheados como datos de invitados.
        cells.push(value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value) ? '' : cell.text.trim());
      }
      if (cells.some(Boolean)) rows.push({number,cells});
    });
    return {name:sheet.name,rows};
  });
  if (!sheets.some(s=>s.rows.length>1)) throw new Error('No se encontraron filas de invitados.');
  return sheets;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {readExcel} from '../src/excel.js';
test('lee la hoja sin ejecutar fórmulas ni aceptar resultados cacheados',async()=>{
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Invitados');
 sheet.addRow(['nombre','correo','institución']);sheet.addRow(['Ana','ana@example.cl','UC']);sheet.addRow(['Luis',{formula:'"luis@example.cl"',result:'luis@example.cl'},'Instituto']);
 const result=await readExcel(await workbook.xlsx.writeBuffer());assert.equal(result[0].rows[1].cells[0],'Ana');assert.equal(result[0].rows[2].cells[1],'');
});

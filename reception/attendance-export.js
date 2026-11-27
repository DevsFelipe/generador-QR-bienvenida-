import ExcelJS from 'exceljs';
export async function attendanceWorkbook(event,guests){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Asistencia y transporte');
 sheet.addRow(['Evento','Trabajador','RUT','Institución','Menú','Grupo familiar','Número de niños y niñas','Llegada al evento','Fecha llegada (Chile)','Inscrito en bus','Personas previstas en bus (incluye trabajador)','Acompañantes previstos en bus','Viaje en bus registrado','Acompañantes que viajaron','Personas que viajaron (incluye trabajador)','Diferencia de acompañantes (real - previsto)','Fecha registro bus (Chile)']);
 const date=value=>value?new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Santiago'}).format(new Date(value)):'';
 for(const g of guests){const plan=g.transportPlan?.total,trip=g.transportCheckIn;
  sheet.addRow([event.nombre,g.nombre,g.rut,g.institucion||'',g.menu||'',g.grupoFamiliar||'',g.numeroNinos??'',g.checkIn?.at?'Sí':'Sin registro',date(g.checkIn?.at),plan!=null?'Sí':'Sin inscripción',plan??'',plan!=null?plan-1:'',trip?'Sí':'Sin registro',trip?.companions??'',trip?trip.companions+1:'',trip&&plan!=null?trip.companions-(plan-1):'',date(trip?.at)]);
 }
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123B68'}};
 sheet.columns.forEach((c,i)=>c.width=[0,1,5].includes(i)?36:26);sheet.getRow(1).height=60;sheet.getRow(1).alignment={wrapText:true,vertical:'middle'};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:'Q1'};
 return Buffer.from(await book.xlsx.writeBuffer());
}

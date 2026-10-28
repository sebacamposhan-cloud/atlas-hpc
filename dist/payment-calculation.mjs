export function calculatePayment(items,percent){
 if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('La retención debe estar entre 0 y 100 %.');
 const lines=items.map(i=>{if(!i.code||!Number.isFinite(i.quantity)||i.quantity<0||!Number.isFinite(i.unitPrice)||i.unitPrice<0)throw Error('Selecciona partida e ingresa una cantidad válida.');const amount=Math.round(i.quantity*i.unitPrice);if(!Number.isSafeInteger(amount))throw Error('Monto fuera de rango');return {...i,amount};});
 const amount=lines.reduce((n,i)=>n+i.amount,0);if(!Number.isSafeInteger(amount))throw Error('Total fuera de rango');const retention=Math.round(amount*percent/100);return {items:lines,amount,retentionPercent:percent,retention,net:amount-retention};
}

// Transcripción de las dos capturas suministradas por el usuario, más STI (Clima).
// Los nombres son etiquetas de consulta; no implican una razón social ni RUT verificados.
export const paymentContractors=[
 ['CallFire','Gases Limpios'],['Canalinox','Barandas y Pasamanos'],['Conpres','Yesos'],['Convergint','Detección'],['CS Energy','Clima'],['DAC-Controls','CDE'],['ECIM','Electricidad'],['Eleva Group','Ascensores'],['EMT','Andamios'],['Falcold','Clima'],['Forpec','Fachada'],['Heavy Duty','Andamios'],['Huennebeck','Andamios'],['JMIE','Electricidad'],['Linde','Gases Clínicos'],['Loginteg','Bodegas'],['Lza Ingeniería','Data Center'],['Metalcar','Montaje Greating'],['Optiva',''],['Pavitec','Sanitario'],['Pestkiller','Control de Plagas'],['Pua Diseño',''],['QCLASS','Biolimpias'],['Quijote','Pintura'],['Rafcon','Fachadas'],['Rentokil','Control de Plagas'],['RMF Miccono','Sanitario'],['STI','Clima']
].map(([name,specialty])=>({name,specialty,label:name+(specialty?' ('+specialty+')':'')}));

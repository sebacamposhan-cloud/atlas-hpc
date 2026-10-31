import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calibrate,orientedEdges,recommend} from './dist/lastplanner-intelligence.mjs';
for(const folder of ['', 'n01/','n02/','n03/']){
 const grid=JSON.parse(fs.readFileSync('dist/'+folder+'ejes.json')),c=calibrate(grid,{file:folder+'ejes.json'});assert.ok(c);assert.ok(c.north[1]<0);assert.ok(c.east[0]>0);
 const points=[[0,0],[100,0],[100,100],[0,100]];assert.deepEqual(orientedEdges(points,c).map(e=>e.direction),['Norte','Este','Sur','Oeste']);
 const rotate=([x,y])=>[-y,x];const rotated={...grid,ejes:grid.ejes.map(e=>({...e,a:rotate(e.a),b:rotate(e.b)}))};assert.deepEqual(orientedEdges(points.map(rotate),calibrate(rotated,{})).map(e=>e.direction),['Norte','Este','Sur','Oeste']);assert.equal(orientedEdges(points,null)[0].direction,'Orientación pendiente de verificación');
}
const input={quantity:100,unit:'m²',rate:5,rateUnit:'m²',basis:'persona-dia',days:5,source:'Ensayo provisional'};
assert.equal(recommend(input).resources,4);assert.equal(recommend(input).state,'provisional');assert.equal(recommend({...input,unit:'ml'}).state,'unavailable');assert.equal(recommend({...input,rate:0}).state,'unavailable');assert.equal(recommend({...input,days:0}).state,'unavailable');
assert.equal(recommend({...input,quantity:320,rate:40,basis:'cuadrilla-dia',crew:[{role:'Pintor',count:2},{role:'Ayudante',count:1}]}).people,6);assert.equal(recommend({...input,basis:'cuadrilla-dia'}).state,'unavailable');assert.equal(recommend({...input,basis:'persona-hora',hours:4}).resources,1);
console.log('Orientación de cuatro pisos, rotación, datos ausentes, bases de productividad, unidades y redondeo aprobados');

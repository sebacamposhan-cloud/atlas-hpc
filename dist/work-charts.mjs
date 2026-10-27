// Mutually exclusive work states use a pie; overlapping documentary categories remain bars.
import {technicalStates,dimensionNames} from './construction-store.mjs';
const palette=['#356e88','#8a9eaa','#bd944e','#8d7c9f','#527f6b','#a26b68'];
const group=values=>{const counts=new Map();for(const value of values)counts.set(value,(counts.get(value)||0)+1);return [...counts].map(([key,n],i)=>({key,n,color:palette[i%palette.length]}));};
export function workDistributions(zones,events,protocols){
 const unique=list=>[...new Map(list.map(row=>[row.id,row])).values()];
 const zs=unique(zones),ps=unique(protocols),latest=new Map();
 for(const event of [...events].sort((a,b)=>(a.at||a.date||'').localeCompare(b.at||b.date||'')))latest.set(event.zoneId+'|'+event.dimension,event.state);
 const state=(zone,dimension)=>latest.get(zone.id+'|'+dimension)||'Sin registrar';
 return {zones:zs,protocols:ps,state,protocolStates:technicalStates.map((key,i)=>({key,n:ps.filter(p=>p.technical===key).length,color:palette[i]})),administrative:group(ps.map(p=>p.administrative||'Sin registrar')),zoneTypes:group(zs.map(z=>z.specialty==='ceilings'?'Cielos':z.specialty==='floors'?'Pavimentos':'Sin especialidad')),dimensions:Object.entries(dimensionNames).map(([dimension,title])=>({dimension,title,items:group(zs.filter(z=>dimension==='floor'?z.specialty==='floors':dimension==='inspection'?['ceilings','floors'].includes(z.specialty):z.specialty==='ceilings').map(z=>state(z,dimension)))}))};
}
const point=(angle,r=78)=>[100+r*Math.cos(angle),100+r*Math.sin(angle)];
export function workChart({title,items,kind='bar',filter='',subtitle='',emptyText='Sin registros. El gráfico aparecerá cuando se guarden datos de obra.'},esc){
 const values=items.filter(item=>item.n>0),total=values.reduce((n,item)=>n+item.n,0),max=Math.max(1,...values.map(item=>item.n));
 const attrs=item=>filter?`data-work-filter="${esc(filter)}" data-work-state="${esc(item.key)}"`:'';
 let graphic='';
 if(kind==='pie'&&total){let angle=-Math.PI/2;graphic=`<svg viewBox="0 0 200 200" class="workPie" role="group" aria-label="${esc(title)}: ${total} registros">${values.map(item=>{const start=angle;angle+=item.n/total*Math.PI*2;const a=point(start),b=point(angle);return values.length===1?`<circle cx="100" cy="100" r="78" fill="${item.color}" ${attrs(item)} ${filter?'tabindex="0" role="button" aria-label="'+esc(item.key)+': '+item.n+' registros"':''}><title>${esc(item.key)}: ${item.n}</title></circle>`:`<path d="M100 100L${a.join(' ')}A78 78 0 ${item.n/total>.5?1:0} 1 ${b.join(' ')}Z" fill="${item.color}" stroke="white" stroke-width="2" ${attrs(item)} ${filter?'tabindex="0" role="button" aria-label="'+esc(item.key)+': '+item.n+' registros"':''}><title>${esc(item.key)}: ${item.n}</title></path>`;}).join('')}</svg>`;}
 return `<section class="chartCard workChart"><div class="chartHeading"><h3>${esc(title)}</h3><span>${total} registros</span></div>${subtitle?`<p class="chartSubtitle">${esc(subtitle)}</p>`:''}${!total?'<p class="chartEmpty">'+esc(emptyText)+'</p>':`<div class="${kind==='pie'?'workPieLayout':'workBarLayout'}">${graphic}<div class="workChartRows">${values.map(item=>`<${filter?'button':'div'} class="workChartRow" ${attrs(item)} ${filter?'type="button"':''}><i style="background:${item.color}"></i><span>${esc(item.key)}</span><b>${item.n}</b>${kind==='bar'?`<em class="workBar"><span style="width:${item.n/max*100}%;background:${item.color}"></span></em>`:''}</${filter?'button':'div'}>`).join('')}</div></div>`}</section>`;
}

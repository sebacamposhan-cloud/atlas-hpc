// Candidate observations remain distinct from approved room associations.
export function withReviewObservations(base,review) {
  if(review.schema!==1)throw Error('Versión de observaciones de revisión no compatible');
  const ids=new Set(base.observations.map(r=>r.id));
  for(const r of review.observations){
    const d=base.documents.find(d=>d.id===r.sheetId);
    if(!d||d.specialty!==r.specialty||d.sha256!==r.source?.sha256||d.page!==r.source?.page||ids.has(r.id)||r.associationStatus!=='unverified'||!Array.isArray(r.position)||r.position.length!==2||!r.position.every(Number.isFinite)||r.position[0]<0||r.position[1]<0||r.position[0]>d.width||r.position[1]>d.height)throw Error('Observación de revisión incompatible con su fuente');
    ids.add(r.id);
  }
  return {...base,observations:[...base.observations,...review.observations]};
}

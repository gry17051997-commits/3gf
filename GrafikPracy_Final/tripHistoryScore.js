export const MAX_GAP_MS = 120000;
export const MAX_JUMP_M = 2000;

export function countTripGaps(points) {
  const ordered=(points||[]).filter(p=>Number.isFinite(Date.parse(p?.observedAt))&&Number.isFinite(Number(p?.latitude))&&Number.isFinite(Number(p?.longitude))).slice().sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  let gaps=0;
  const meters=(a,b)=>{const rad=v=>v*Math.PI/180,dl=rad(Number(b.longitude)-Number(a.longitude)),dp=rad(Number(b.latitude)-Number(a.latitude)),h=Math.sin(dp/2)**2+Math.cos(rad(Number(a.latitude)))*Math.cos(rad(Number(b.latitude)))*Math.sin(dl/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));};
  for(let i=1;i<ordered.length;i++){const dt=Date.parse(ordered[i].observedAt)-Date.parse(ordered[i-1].observedAt);if(dt<=0||dt>MAX_GAP_MS||meters(ordered[i-1],ordered[i])>MAX_JUMP_M)gaps++;}
  return gaps;
}
export function scoreTrip(trip={}) {
  let score=8;
  const max=Number(trip.maxSpeedKmh)||0,points=Number(trip.pointCount??trip.points?.length)||0,avg=Number(trip.averageSpeedKmh)||0,km=Number(trip.distanceKm)||0;
  if(max>160)score-=2.5;else if(max>140)score-=1.5;
  if(points<5)score-=1;
  score-=Math.min(2,countTripGaps(trip.points)*0.5);
  if(km>2&&avg>=30&&avg<=110)score+=0.5;
  return Math.round(Math.min(10,Math.max(1,score))*10)/10;
}
export function scoreColor(score){return score>=7?'#22c55e':score>=5?'#f59e0b':'#ef4444';}

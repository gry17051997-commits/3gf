const TRIP_GAP_MS = 30 * 60 * 1000;
const MAX_SEGMENT_GAP_MS = 2 * 60 * 1000;
const MIN_MOVING_SPEED_KMH = 5;
const MAX_ACCURACY_METERS = 35;
const MAX_TRIP_SPEED_KMH = 180;
const MIN_EFFECTIVE_SEGMENT_METERS = 8;

const asMillis = value => {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
};
const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const speedKmh = value => {
  const speed = numeric(value);
  return speed == null || speed < 0 ? null : speed * 3.6;
};
const radians = value => value * Math.PI / 180;

export function distanceMeters(a, b) {
  if (!a || !b) return 0;
  const lat1 = numeric(a.latitude), lon1 = numeric(a.longitude);
  const lat2 = numeric(b.latitude), lon2 = numeric(b.longitude);
  if ([lat1, lon1, lat2, lon2].some(value => value == null)) return 0;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

const pointAccuracy = point => numeric(point?.accuracy);
const reliablePoint = point => { const accuracy=pointAccuracy(point); return accuracy!=null&&accuracy>0&&accuracy<=MAX_ACCURACY_METERS; };
const bearingDegrees = (a,b) => { const p1=radians(a.latitude),p2=radians(b.latitude),dl=radians(b.longitude-a.longitude),y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl); return (Math.atan2(y,x)*180/Math.PI+360)%360; };
const angleDifference = (a,b) => Math.abs(((a-b+540)%360)-180);
function segmentMetrics(a,b) {
 const dt=asMillis(b.observedAt)-asMillis(a.observedAt);
 if(dt<=0||dt>MAX_SEGMENT_GAP_MS||!reliablePoint(a)||!reliablePoint(b))return null;
 const rawDistance=distanceMeters(a,b),accuracyFloor=Math.max(12,(pointAccuracy(a)+pointAccuracy(b))*0.8),effectiveDistance=Math.max(0,rawDistance-accuracyFloor),derivedSpeed=rawDistance/(dt/1000)*3.6;
 const speedA=a.speedKmh,speedB=b.speedKmh,bothStopped=speedA!=null&&speedB!=null&&speedA<3&&speedB<3;
 if(bothStopped||rawDistance<=accuracyFloor||effectiveDistance<MIN_EFFECTIVE_SEGMENT_METERS||derivedSpeed<MIN_MOVING_SPEED_KMH||derivedSpeed>MAX_TRIP_SPEED_KMH)return null;
 return {distanceMeters:effectiveDistance,durationMs:dt,derivedSpeedKmh:derivedSpeed,bearing:bearingDegrees(a,b),reportedMoving:(speedA??0)>=8&&(speedB??0)>=8};
}

function pointView(row) {
  return {
    id: String(row.id),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracy: numeric(row.accuracy),
    altitude: numeric(row.altitude),
    speedKmh: speedKmh(row.speed),
    heading: numeric(row.heading),
    observedAt: new Date(row.observed_at).toISOString(),
    receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null
  };
}

function confirmMovementSegments(segments) {
 return segments.map((segment,index)=>{
  if(!segment)return false;
  if(segment.reportedMoving)return true;
  const previous=segments[index-1],next=segments[index+1];
  return Boolean((previous&&angleDifference(previous.bearing,segment.bearing)<=85)||(next&&angleDifference(segment.bearing,next.bearing)<=85));
 });
}
function summarizeTrip(rows,vehicleId,includePoints) {
 const points=rows.map(p=>({...p})),first=points[0],last=points[points.length-1],startMs=asMillis(first.observedAt),endMs=asMillis(last.observedAt);
 const segments=points.slice(1).map((point,index)=>segmentMetrics(points[index],point));
 const confirmed=confirmMovementSegments(segments);
 const routePointIds=new Set();confirmed.forEach((ok,index)=>{if(ok){routePointIds.add(points[index].id);routePointIds.add(points[index+1].id);}});
 const routePoints=points.filter(point=>routePointIds.has(point.id));
 let distance=0,drivingMs=0,maxSpeed=0,speedSum=0,speedCount=0,stopStart=null,previous=null;const stops=[];
 for(let i=0;i<points.length;i++){
  const point=points[i];
  if(previous){
   const segment=confirmed[i-1]?segments[i-1]:null;
   if(segment){distance+=segment.distanceMeters;drivingMs+=segment.durationMs;const speed=point.speedKmh??segment.derivedSpeedKmh;maxSpeed=Math.max(maxSpeed,speed);speedSum+=speed;speedCount++;}
   const stopped=point.speedKmh!=null&&point.speedKmh<3&&reliablePoint(point);
   if(stopped&&stopStart==null)stopStart=point.observedAt;
   if(!stopped&&stopStart!=null){const stopEnd=asMillis(previous.observedAt),stopBegin=asMillis(stopStart);if(stopEnd!=null&&stopBegin!=null&&stopEnd-stopBegin>=120000)stops.push({startedAt:stopStart,endedAt:previous.observedAt,durationSeconds:Math.round((stopEnd-stopBegin)/1000),latitude:previous.latitude,longitude:previous.longitude});stopStart=null;}
  }
  previous=point;
 }
 if(stopStart!=null&&last){const stopBegin=asMillis(stopStart);if(stopBegin!=null&&endMs-stopBegin>=120000)stops.push({startedAt:stopStart,endedAt:last.observedAt,durationSeconds:Math.round((endMs-stopBegin)/1000),latitude:last.latitude,longitude:last.longitude});}
 const elapsedSeconds=Math.max(0,Math.round((endMs-startMs)/1000)),drivingSeconds=Math.min(elapsedSeconds,Math.round(drivingMs/1000)),distanceKm=distance/1000;
 const trip={id:`trip-${first.id}`,vehicleId,startedAt:first.observedAt,endedAt:last.observedAt,start:{latitude:first.latitude,longitude:first.longitude},end:{latitude:last.latitude,longitude:last.longitude},pointCount:points.length,distanceKm:Number(distanceKm.toFixed(2)),durationSeconds:elapsedSeconds,drivingSeconds,stopSeconds:Math.max(0,elapsedSeconds-drivingSeconds),averageSpeedKmh:Number((speedCount?speedSum/speedCount:0).toFixed(1)),averageIncludingStopsKmh:Number((elapsedSeconds>0?distanceKm/(elapsedSeconds/3600):0).toFixed(1)),maxSpeedKmh:Number(maxSpeed.toFixed(1)),stops};
 if(includePoints){trip.points=points;trip.routePoints=routePoints;}
 return trip;
}

/**
 * Derive stable, independently selectable trips from retained GPS history.
 * A trip is split after a long telemetry gap; point IDs make its ID stable
 * across requests and do not require a new database migration.
 */
export function buildTrips(rows,{vehicleId='',includePoints=false,gapMs=TRIP_GAP_MS,stationarySplitMs=12*60*1000}={}) {
 const valid=(Array.isArray(rows)?rows:[]).filter(row=>row&&row.id!=null&&asMillis(row.observed_at)!=null&&Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude))&&Number(row.latitude)>=-90&&Number(row.latitude)<=90&&Number(row.longitude)>=-180&&Number(row.longitude)<=180&&numeric(row.accuracy)!=null&&numeric(row.accuracy)>0&&numeric(row.accuracy)<=MAX_ACCURACY_METERS).slice().sort((a,b)=>asMillis(a.observed_at)-asMillis(b.observed_at)||Number(a.id)-Number(b.id)).map(pointView);
 if(valid.length<2)return [];
 const segments=valid.slice(1).map((point,index)=>segmentMetrics(valid[index],point));
 const confirmed=confirmMovementSegments(segments);
 const groups=[];let current=[],pending=[],lastMovingAt=0;
 const flush=()=>{if(current.length>=2)groups.push(current);current=[];pending=[];lastMovingAt=0;};
 for(let i=0;i<segments.length;i++){
  const a=valid[i],b=valid[i+1],at=asMillis(b.observedAt);
  if(confirmed[i]){
   if(!current.length)current=[a,b];
   else if(pending.length){const pause=at-lastMovingAt;if(pause>stationarySplitMs||pause>gapMs){flush();current=[a,b];}else current.push(...pending,b);pending=[];}
   else if(current[current.length-1].id!==a.id)current.push(a,b);
   else current.push(b);
   lastMovingAt=at;
  }else if(current.length){
   if(!pending.length&&current[current.length-1].id!==a.id)pending.push(a);
   pending.push(b);
   if(at-lastMovingAt>=stationarySplitMs)flush();
  }
 }
 if(current.length){if(pending.length&&asMillis(pending[pending.length-1].observedAt)-lastMovingAt<stationarySplitMs)current.push(...pending);flush();}
 return groups.map(group=>summarizeTrip(group,vehicleId,includePoints)).reverse();
}

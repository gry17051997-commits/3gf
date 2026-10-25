import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL_CONFIG=String(process.env.EXPO_PUBLIC_API_URL||'').trim().replace(/\/+$/,'');
const API_ORIGIN=API_URL_CONFIG.replace(/\/api$/i,'').replace(/\/+$/,'');
const API_URL_VALID=(()=>{if(!API_ORIGIN)return false;try{const u=new URL(API_ORIGIN);return (u.protocol==='https:'||u.protocol==='http:')&&!!u.host&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}})();
// EXPO_PUBLIC_API_URL is an origin only, for example https://example.com. Never append /api twice.
export const API_BASE_URL=API_URL_VALID ? API_ORIGIN+'/api' : '';
export const API_TOKEN_KEY='grafik-pracy-api-token-v1';

async function token(){return AsyncStorage.getItem(API_TOKEN_KEY);}
export async function api(path,{method='GET',body,headers={}}={}){
  if(!API_BASE_URL)throw new Error('Nieprawidłowe EXPO_PUBLIC_API_URL. Ustaw adres serwera jako origin, np. https://example.com lub http://192.168.1.10:8787, bez ścieżki /api.');

  const controller=new AbortController();
  let timeoutId;
  let timedOut=false;
  let timeoutError;

  try{
    const timeout=new Promise((_,reject)=>{
      timeoutId=setTimeout(()=>{
        timedOut=true;
        timeoutError=new Error('API_TIMEOUT');
        timeoutError.code='API_TIMEOUT';
        timeoutError.status=408;
        reject(timeoutError);
        controller.abort();
      },15000);
    });

    const operation=(async()=>{
      try{
        const t=await token();
        const h={'Content-Type':'application/json',...headers};
        if(t)h.Authorization='Bearer '+t;
        const r=await fetch(API_BASE_URL+path,{
          method,
          headers:h,
          body:body===undefined?undefined:JSON.stringify(body),
          signal:controller.signal
        });
        let data=null;
        try{data=await r.json();}catch{}
        if(!r.ok){
          const e=new Error(data?.error||'API_ERROR');
          e.status=r.status;
          if(data?.error!==undefined)e.code=data.error;
          throw e;
        }
        return data;
      }catch(error){
        if(timedOut)throw timeoutError;
        throw error;
      }
    })();

    return await Promise.race([operation,timeout]);
  }finally{
    if(timeoutId!==undefined)clearTimeout(timeoutId);
  }
}
export async function apiLogin(email,password){const data=await api('/auth/login',{method:'POST',body:{email,password}});await AsyncStorage.setItem(API_TOKEN_KEY,data.token);return data.user;}
export async function apiLogout(){try{await api('/auth/logout',{method:'POST'});}finally{await AsyncStorage.removeItem(API_TOKEN_KEY);}}
export async function apiMe(){return (await api('/me')).user;}
export async function apiGetGps(){return (await api('/gps/vehicles')).vehicles;}
export async function apiGetMyGps(){return (await api('/gps/mine')).vehicle;}
export async function apiPostGps(payload,deviceToken){
  if(!API_BASE_URL)throw new Error('Nieprawidłowe EXPO_PUBLIC_API_URL. Podaj adres serwera bez końcowego /api.');
  const controller=new AbortController();
  let timeoutId;
  try{
    const timeout=new Promise((_,reject)=>{
      timeoutId=setTimeout(()=>{
        controller.abort();
        reject(new Error('GPS_API_TIMEOUT'));
      },12000);
    });
    const request=fetch(API_BASE_URL+'/gps',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Device-Token':deviceToken},
      body:JSON.stringify(payload),
      signal:controller.signal
    });
    const r=await Promise.race([request,timeout]);
    let data=null;
    try{data=await r.json();}catch{throw new Error('GPS_API_INVALID_RESPONSE');}
    if(!r.ok)throw new Error(data?.error||'GPS_API_ERROR');
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('GPS_API_TIMEOUT');
    throw error;
  }finally{
    if(timeoutId)clearTimeout(timeoutId);
  }
}

export const serverTimestamp=()=>new Date().toISOString();
export const deleteField=()=>({__apiDeleteField:true});
export const Timestamp={fromMillis(ms){return {toMillis:()=>Number(ms),toDate:()=>new Date(Number(ms))};}};
const ref=(kind,name,id=null)=>({kind,name,id});
export const collection=(_db,name)=>ref('collection',name);
export const doc=(_db,name,id)=>ref('doc',name,id);
export const where=(field,op,value)=>({type:'where',field,op,value});
export const orderBy=(field,direction='asc')=>({type:'orderBy',field,direction});
export const limit=n=>({type:'limit',value:n});
export const query=(base,...constraints)=>({...base,constraints});
const cleanDeletes=(obj)=>{if(!obj||typeof obj!=='object')return obj;const out={};for(const [k,v] of Object.entries(obj)){if(v&&v.__apiDeleteField)continue;out[k]=v&&typeof v==='object'&&!Array.isArray(v)?cleanDeletes(v):v;}return out;};
const pathFor=r=>r.kind==='doc'?'/store/'+encodeURIComponent(r.name)+'/'+encodeURIComponent(r.id):'/store/'+encodeURIComponent(r.name);
export async function getDoc(r){const raw=await api(pathFor(r));if(r.kind==='doc'){if(!raw.exists)return {exists:()=>false,data:()=>({}),id:r.id,metadata:{hasPendingWrites:false}};return {exists:()=>true,data:()=>raw.data||{},id:raw.id||r.id,metadata:{hasPendingWrites:false},updatedAt:raw.updatedAt,revision:raw.revision};}return raw;}
export async function setDoc(r,data,options={}){const body={payload:cleanDeletes(data)};if(Number.isInteger(options.expectedRevision)&&options.expectedRevision>0)body.expectedRevision=options.expectedRevision;return api(pathFor(r)+'?merge='+(options.merge!==false?'true':'false'),{method:'PUT',body});}
const updateQueues=new Map();

export function updateDoc(r,data){
  const queueKey=pathFor(r);
  const previous=updateQueues.get(queueKey)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    const patch=Object.entries(data||{});
    let lastError=null;
    for(let attempt=0;attempt<4;attempt++){
      try{
        const current=await getDoc(r);
        const base=current.exists()?current.data():{};
        const next={...base};
        for(const [key,value] of patch){
          const parts=key.split('.');
          let target=next;
          for(let i=0;i<parts.length-1;i++){
            const p=parts[i];
            if(!target[p]||typeof target[p]!=='object'||Array.isArray(target[p]))target[p]={};
            target=target[p];
          }
          const leaf=parts[parts.length-1];
          if(value&&value.__apiDeleteField)delete target[leaf];
          else target[leaf]=cleanDeletes(value);
        }
        return await setDoc(r,next,{merge:false,expectedRevision:Number(current.revision)||undefined});
      }catch(e){
        lastError=e;
        if(e?.code!=='REVISION_CONFLICT' || attempt===3) throw e;
        await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
      }
    }
    throw lastError||new Error('UPDATE_FAILED');
  });
  updateQueues.set(queueKey,task);
  task.finally(()=>{
    if(updateQueues.get(queueKey)===task)updateQueues.delete(queueKey);
  }).catch(()=>{});
  return task;
}
export async function addDoc(r,data){return api(pathFor(r),{method:'POST',body:{payload:cleanDeletes(data)}});}
export async function deleteDoc(r){return api(pathFor(r),{method:'DELETE'});}
export async function getDocs(qr){const constraints=qr.constraints||[],params=new URLSearchParams();const w=constraints.find(x=>x.type==='where');if(w&&w.op==='=='){params.set('whereField',w.field);params.set('whereValue',w.value);}const o=constraints.find(x=>x.type==='orderBy');if(o){params.set('orderField',o.field);params.set('orderDirection',o.direction);}const l=constraints.find(x=>x.type==='limit');if(l)params.set('limit',String(l.value));const suffix=params.toString()?'?'+params.toString():'';const d=await api(pathFor(qr)+suffix);return {docs:(d.docs||[]).map(x=>({id:x.id,data:()=>{const y={...x};delete y.id;delete y._revision;delete y._updatedAt;delete y._updatedBy;return y;},metadata:{hasPendingWrites:false},exists:()=>true}))};}
export function onSnapshot(target,options,callback,errorCallback){
  if(typeof options==='function'){errorCallback=callback;callback=options;options={};}
  let stopped=false,last='';
  const poll=async()=>{if(stopped)return;try{const snap=target.kind==='doc'?await getDoc(target):await getDocs(target);const key=target.kind==='doc'?JSON.stringify({exists:snap.exists(),data:snap.exists()?snap.data():null,revision:snap.revision||0,updatedAt:snap.updatedAt||null}):JSON.stringify({docs:(snap.docs||[]).map(d=>({id:d.id,data:d.data(),metadata:d.metadata||{}}))});if(key!==last){last=key;callback(snap);}}catch(e){errorCallback?.(e);}};
  poll();const timer=setInterval(poll,4000);return()=>{stopped=true;clearInterval(timer);};
}
export async function runTransaction(_db,fn){const pending=[];const tx={get:getDoc,update:(r,d)=>{const p=updateDoc(r,d);pending.push(p);return p;},set:(r,d)=>{const p=setDoc(r,d);pending.push(p);return p;}};const result=await fn(tx);await Promise.all(pending);return result;}

const unwrapGpsResponse = response => {
  let value = response;
  for (let i = 0; i < 3 && value && typeof value === 'object' && !Array.isArray(value); i++) {
    if (value.trips !== undefined || value.trip !== undefined) return value;
    if (value.data !== undefined) { value = value.data; continue; }
    break;
  }
  return value;
};
const normalizeGpsTripsResponse = response => {
  const value = unwrapGpsResponse(response);
  const rows = Array.isArray(value) ? value : Array.isArray(value?.trips) ? value.trips : null;
  if (!rows) return [];
  return rows.filter(row => row && typeof row === 'object' && !Array.isArray(row))
    .map(row => {
      const id = row.id ?? row.tripId ?? row.trip_id;
      const startedAt = row.startedAt ?? row.started_at;
      const endedAt = row.endedAt ?? row.ended_at;
      const distance = Number(row.distanceKm ?? row.distance_km ?? row.distance);
      const duration = Number(row.durationSeconds ?? row.duration_seconds ?? row.duration);
      return {
        ...row,
        id: id == null ? '' : String(id),
        startedAt: startedAt ?? null,
        endedAt: endedAt ?? startedAt ?? null,
        distanceKm: Number.isFinite(distance) ? distance : 0,
        durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : 0
      };
    })
    .filter(row => row.id !== ''
      && row.startedAt != null && Number.isFinite(Date.parse(row.startedAt))
      && row.endedAt != null && Number.isFinite(Date.parse(row.endedAt))
      && row.distanceKm >= 0);
};
const normalizeGpsTripResponse = response => {
  const value = unwrapGpsResponse(response);
  const candidate = value?.trip ?? value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const rawPoints = Array.isArray(candidate.points) ? candidate.points
    : Array.isArray(candidate.route) ? candidate.route
    : Array.isArray(candidate.trip?.points) ? candidate.trip.points
    : Array.isArray(candidate.trip?.route) ? candidate.trip.route
    : [];
  const points = rawPoints.map(point => {
    if (Array.isArray(point) && point.length >= 2) {
      return { latitude: Number(point[0]), longitude: Number(point[1]) };
    }
    if (point && typeof point === 'object') {
      const latitude = point.latitude ?? point.lat;
      const longitude = point.longitude ?? point.lon ?? point.lng;
      return { ...point, latitude: Number(latitude), longitude: Number(longitude) };
    }
    return null;
  }).filter(point => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
  const id = candidate.id ?? candidate.tripId ?? candidate.trip_id;
  if (id == null || String(id).trim() === '') return null;
  const rawDistance = Number(candidate.distanceKm ?? candidate.distance_km ?? candidate.distance);
  const rawDuration = Number(candidate.durationSeconds ?? candidate.duration_seconds ?? candidate.duration);
  return {
    ...candidate,
    id: String(id),
    distanceKm: Number.isFinite(rawDistance) && rawDistance >= 0 ? rawDistance : 0,
    durationSeconds: Number.isFinite(rawDuration) && rawDuration >= 0 ? rawDuration : 0,
    points
  };
};
export async function apiGetGpsTrips(vehicleId) {
  if (vehicleId == null || String(vehicleId).trim() === '') return [];
  try {
    return normalizeGpsTripsResponse(await api('/gps/' + encodeURIComponent(vehicleId) + '/trips'));
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) throw error;
    if (error?.status != null) return [];
    throw error;
  }
}
export async function apiGetGpsTrip(vehicleId, tripId) {
  if (vehicleId == null || String(vehicleId).trim() === '' || tripId == null || String(tripId).trim() === '') return null;
  try {
    return normalizeGpsTripResponse(await api('/gps/' + encodeURIComponent(vehicleId) + '/trips/' + encodeURIComponent(tripId)));
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) throw error;
    if (error?.status != null) return null;
    throw error;
  }
}

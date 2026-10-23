import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {Platform, AppState} from 'react-native';
import {API_BASE_URL, apiPostGps} from './apiClient';

export const LOCATION_TASK_NAME='grafik-pracy-vehicle-location-v2';
export const LOCATION_CONFIG_KEY='grafik-pracy-location-config-v2';
export const LOCATION_CURRENT_KEY='grafik-pracy-location-current-v2';
export const LOCATION_DEVICE_TOKEN_KEY='grafik-pracy-location-device-token-v1';
export const LOCATION_DIAGNOSTICS_KEY='grafik-pracy-location-diagnostics-v1';
const LOCATION_OPTIONS_VERSION=4;
const STALE_THRESHOLD_MS = 2.5 * 60 * 1000; // 2.5 minuty
const LOCATION_PENDING_QUEUE_KEY = 'grafik-pracy-location-pending-queue-v1';
const MAX_PENDING_GPS_POINTS = 250;
const MAX_GPS_QUEUE_FLUSH_PER_PASS = 20;

export const normalizeVehicleId=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40)||'SLUZBOWY';

const getConfig=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_CONFIG_KEY);return raw?JSON.parse(raw):{};}catch{return{};}};
export const getLocationDeviceToken=()=>AsyncStorage.getItem(LOCATION_DEVICE_TOKEN_KEY);
export const getLocationDiagnostics=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_DIAGNOSTICS_KEY);return raw?JSON.parse(raw):{};}catch{return{};}};
const patchDiagnostics=async patch=>{try{const old=await getLocationDiagnostics();await AsyncStorage.setItem(LOCATION_DIAGNOSTICS_KEY,JSON.stringify({...old,...patch}));}catch(error){console.log('LOCATION_DIAGNOSTICS_WRITE_ERROR',error?.message||error);}};

const readPendingGpsQueue=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_PENDING_QUEUE_KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.filter(x=>x&&x.payload&&Number.isFinite(Number(x.payload.observedAt))):[];}catch{return[];}};
const writePendingGpsQueue=async queue=>{await AsyncStorage.setItem(LOCATION_PENDING_QUEUE_KEY,JSON.stringify(queue));await patchDiagnostics({pendingGpsQueueLength:queue.length});};
const enqueuePendingGps=async(payload,vehicleId)=>{
  const normalizedVehicleId=normalizeVehicleId(vehicleId);
  let queue=await readPendingGpsQueue();
  const before=queue.length;
  queue=queue.filter(item=>normalizeVehicleId(item.vehicleId)===normalizedVehicleId);
  const discarded=before-queue.length;
  if(queue.length>=MAX_PENDING_GPS_POINTS){queue.shift();await patchDiagnostics({pendingGpsQueueDropped:(Number((await getLocationDiagnostics()).pendingGpsQueueDropped)||0)+1});}
  queue.push({payload,vehicleId:normalizedVehicleId,queuedAt:Date.now()});
  await writePendingGpsQueue(queue);
  if(discarded)await patchDiagnostics({pendingGpsQueueAssignmentDiscarded:(Number((await getLocationDiagnostics()).pendingGpsQueueAssignmentDiscarded)||0)+discarded});
};
const flushPendingGpsQueue=async(token,vehicleId)=>{
  let queue=await readPendingGpsQueue();
  if(!queue.length){await patchDiagnostics({pendingGpsQueueLength:0});return true;}
  const normalizedVehicleId=normalizeVehicleId(vehicleId);
  const before=queue.length;
  queue=queue.filter(item=>normalizeVehicleId(item.vehicleId)===normalizedVehicleId);
  const discarded=before-queue.length;
  if(discarded)await patchDiagnostics({pendingGpsQueueAssignmentDiscarded:(Number((await getLocationDiagnostics()).pendingGpsQueueAssignmentDiscarded)||0)+discarded});
  await writePendingGpsQueue(queue);
  let sentThisPass=0;
  while(queue.length && sentThisPass < MAX_GPS_QUEUE_FLUSH_PER_PASS){
    try{
      await apiPostGps(queue[0].payload,token);
      queue.shift();
      sentThisPass++;
      await writePendingGpsQueue(queue);
      await patchDiagnostics({lastQueueUploadAt:Date.now()});
    }catch(error){
      const message=String(error?.message||error||'unknown');
      await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now(),pendingGpsQueueLength:queue.length});
      return false;
    }
  }
  return queue.length === 0;
};
export const setLocationDeviceToken=async token=>{const value=String(token||'').trim();if(value)await AsyncStorage.setItem(LOCATION_DEVICE_TOKEN_KEY,value);else await AsyncStorage.removeItem(LOCATION_DEVICE_TOKEN_KEY);return value;};

const distanceMeters=(a,b)=>{if(!a||!b)return Infinity;const R=6371000,p1=a.latitude*Math.PI/180,p2=b.latitude*Math.PI/180,dp=(b.latitude-a.latitude)*Math.PI/180,dl=(b.longitude-a.longitude)*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};

const getDeviceAssignment=async token=>{
  if(!API_BASE_URL||!token)throw new Error('GPS_DEVICE_CONFIGURATION_MISSING');
  let response;
  try{
    const controller=new AbortController();
    let timeoutId;
    try{
      response=await Promise.race([
        fetch(API_BASE_URL+'/gps/device',{headers:{'X-Device-Token':token},signal:controller.signal}),
        new Promise((_,reject)=>{timeoutId=setTimeout(()=>{controller.abort();reject(new Error('GPS_ASSIGNMENT_TIMEOUT'));},8000);})
      ]);
    }finally{
      if(timeoutId!==undefined)clearTimeout(timeoutId);
    }
  }catch(error){
    // Błąd sieci/API lub timeout nie jest dowodem, że urządzenie utraciło przypisanie.
    // Nie wolno z jego powodu zatrzymywać działającego foreground service.
    throw new Error('GPS_ASSIGNMENT_NETWORK_ERROR: '+String(error?.message||error));
  }
  if(response.status===401||response.status===404)return null;
  if(!response.ok)throw new Error('GPS_ASSIGNMENT_HTTP_'+response.status);
  let assignment;
  try{assignment=await response.json();}catch{throw new Error('GPS_ASSIGNMENT_INVALID_RESPONSE');}
  if(!assignment?.vehicleId)return null;
  return assignment;
};

const LOCATION_OPTIONS={
  accuracy:Location.Accuracy.High,
  timeInterval:5000,
  distanceInterval:5,
  deferredUpdatesInterval:0,
  deferredUpdatesDistance:0,
  pausesUpdatesAutomatically:false,
  showsBackgroundLocationIndicator:true,
  foregroundService:{
    notificationTitle:'Grafik Pracy • GPS aktywny',
    notificationBody:'Lokalizacja auta jest udostępniana również przy zablokowanym ekranie.',
    notificationColor:'#467ff1',
    killServiceOnDestroy:false
  }
};

let saveQueue=Promise.resolve();
async function saveLocationInternal(location){
  if(!location?.coords||!API_BASE_URL)return;
  const cfg=await getConfig();
  if(cfg.enabled!==true)return;
  const deviceToken=await getLocationDeviceToken();
  if(!deviceToken)return;
  const c=location.coords,now=Date.now();
  const payload={
    latitude:Number(c.latitude),
    longitude:Number(c.longitude),
    accuracy:Number(c.accuracy||0),
    altitude:Number(c.altitude||0),
    speed:Number.isFinite(c.speed)?Number(c.speed):null,
    heading:Number.isFinite(c.heading)?Number(c.heading):null,
    observedAt:Number(location.timestamp||now)
  };

  // Preserve FIFO order while offline; don't let new points leapfrog old ones.
  const queueFlushed=await flushPendingGpsQueue(deviceToken,cfg.vehicleId);
  if(!queueFlushed){
    await enqueuePendingGps(payload,cfg.vehicleId);
    return;
  }

  let result=null,lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    try{result=await apiPostGps(payload,deviceToken);lastError=null;break;}
    catch(error){lastError=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));}
  }
  if(!result){
    const message=String(lastError?.message||lastError||'unknown');
    await enqueuePendingGps(payload,cfg.vehicleId);
    await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now(),pendingGpsQueueLength:(await readPendingGpsQueue()).length});
    console.log('LOCATION_API_WRITE_ERROR_AFTER_RETRIES',message);
    return;
  }
  try{
    await patchDiagnostics({lastUploadAt:Date.now(),lastLiveUploadAt:Date.now(),lastUploadError:null,lastUploadErrorAt:null});
    const assignedVehicleId=normalizeVehicleId(result.vehicleId||result.registration||cfg.vehicleId);
    const local={...payload,vehicleId:assignedVehicleId,registration:result.registration||cfg.registration||'',receivedAt:Date.now()};
    let previous=null;try{const raw=await AsyncStorage.getItem(LOCATION_CURRENT_KEY);previous=raw?JSON.parse(raw):null;}catch{}
    const moved=previous?distanceMeters(previous,payload):Infinity;
    const historyAt=Number(previous?.historyAt||0);
    local.historyAt=!previous||moved>=80||now-historyAt>=120000?now:historyAt;
    await AsyncStorage.setItem(LOCATION_CURRENT_KEY,JSON.stringify(local));
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...cfg,enabled:true,vehicleId:assignedVehicleId,registration:local.registration}));
  }catch(error){
    const message=String(error?.message||error||'unknown');
    await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now()});
    console.log('LOCATION_LOCAL_SAVE_ERROR',message);
  }
}
function saveLocation(location){const run=saveQueue.then(()=>saveLocationInternal(location));saveQueue=run.catch(()=>{});return run;}

// Background tasks are native-only. Avoid calling TaskManager APIs in web builds.
if(Platform.OS!=='web'&&!TaskManager.isTaskDefined(LOCATION_TASK_NAME)){
  TaskManager.defineTask(LOCATION_TASK_NAME,async({data,error})=>{
    if(error){
      await patchDiagnostics({lastTaskError:String(error.message||error).slice(0,240),lastTaskErrorAt:Date.now()});
      return;
    }
    if(!data?.locations?.length)return;
    for(const location of data.locations){
      const coords=location?.coords||{};
      await patchDiagnostics({lastTaskAt:Date.now(),lastTaskError:null,lastTaskErrorAt:null,lastLocalLatitude:Number(coords.latitude)||null,lastLocalLongitude:Number(coords.longitude)||null,lastLocalObservedAt:Number(location.timestamp)||Date.now()});
      await saveLocation(location);
    }
  });
}

export async function saveVehicleLocationAssignment(registration){
  const reg=String(registration||'').trim().toUpperCase();
  if(!reg)throw new Error('Brak numeru rejestracyjnego.');
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,vehicleId:normalizeVehicleId(reg),registration:reg}));
  return {ok:true,vehicleId:normalizeVehicleId(reg),registration:reg};
}

export async function startVehicleLocationTracking({vehicleId,registration}={}){
  if(Platform.OS==='web')return {ok:false,reason:'web'};
  if(AppState.currentState!=='active')return {ok:false,reason:'app-not-active'};
  if(!API_BASE_URL)return {ok:false,reason:'api-not-configured'};
  const token=await getLocationDeviceToken();
  if(!token)return {ok:false,reason:'device-token-missing'};
  const assignment=await getDeviceAssignment(token);
  if(!assignment?.vehicleId)return {ok:false,reason:'device-not-assigned'};
  // Centralne przypisanie z API jest jedynym źródłem prawdy.
  // Lokalnie zapisany numer auta może być nieaktualny po zmianie przypisania
  // przez administratora, dlatego nie blokujemy startu GPS porównaniem z cache.
  const fg=await Location.requestForegroundPermissionsAsync();
  if(fg.status!=='granted')return {ok:false,reason:'foreground-permission'};
  if(!(await Location.hasServicesEnabledAsync()))return {ok:false,reason:'location-services-disabled'};
  const bg=await Location.requestBackgroundPermissionsAsync();
  if(bg.status!=='granted')return {ok:false,reason:'background-permission'};
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:true,optionsVersion:LOCATION_OPTIONS_VERSION,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||registration||''}));
  const alreadyRunning=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if(alreadyRunning && old.optionsVersion!==LOCATION_OPTIONS_VERSION){
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  if(!alreadyRunning || old.optionsVersion!==LOCATION_OPTIONS_VERSION){
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
  }
  try{await saveLocation(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Highest,mayShowUserSettingsDialog:true}));}catch(e){console.log('LOCATION_INITIAL_FIX_ERROR',e);}
  return {ok:true,vehicleId:assignment.vehicleId,registration:assignment.registration||''};
}

export async function stopVehicleLocationTracking(){
  if(Platform.OS!=='web'&&await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME))await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  const old=await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:false}));
  await AsyncStorage.removeItem(LOCATION_CURRENT_KEY);
}

export async function ensureVehicleLocationTracking() {
  if (Platform.OS === 'web' || !API_BASE_URL) return { ok: false, reason: 'unsupported' };

  const cfg = await getConfig();
  if (cfg.enabled !== true) return { ok: false, reason: 'disabled' };

  const token = await getLocationDeviceToken();
  if (!token) return { ok: false, reason: 'device-token-missing' };

  let assignment;
  try {
    assignment = await getDeviceAssignment(token);
  } catch (e) {
    // Chwilowy błąd sieci nie powinien wyłączać GPS ani kasować przypisania.
    assignment = { vehicleId: cfg.vehicleId, registration: cfg.registration };
    await patchDiagnostics({
      lastAssignmentFallbackAt: Date.now(),
      lastAssignmentFallbackError: String(e?.message || e).slice(0, 240),
    });
  }

  if (!assignment?.vehicleId) {
    await patchDiagnostics({ lastEnsureError: 'device-not-assigned', lastEnsureErrorAt: Date.now() });
    await stopVehicleLocationTracking();
    return { ok: false, reason: 'device-not-assigned' };
  }

  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  if (fg.status !== 'granted' || bg.status !== 'granted') {
    return { ok: false, reason: 'permission' };
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    return { ok: false, reason: 'location-services-disabled' };
  }

  const diagnostics = await getLocationDiagnostics();
  const now = Date.now();
  if (!Number(diagnostics.lastTrackingStartedAt || 0)) {
    diagnostics.lastTrackingStartedAt = now;
    await patchDiagnostics({ lastTrackingStartedAt: now });
  }
  const trackingSince = Number(diagnostics.lastTrackingStartedAt || now);
  const lastTaskAt = Number(diagnostics.lastTaskAt || 0);
  const lastUploadAt = Number(diagnostics.lastUploadAt || 0);
  // Check local fixes and server uploads independently; a fresh local fix
  // must not mask a broken upload path to the second device.
  const taskStale = lastTaskAt > 0 ? now - lastTaskAt > STALE_THRESHOLD_MS : now - trackingSince > STALE_THRESHOLD_MS;
  const lastLiveUploadAt = Number(diagnostics.lastLiveUploadAt || 0);
  const uploadStale = lastLiveUploadAt > 0 ? now - lastLiveUploadAt > STALE_THRESHOLD_MS : now - trackingSince > STALE_THRESHOLD_MS;
  const isStale = taskStale || uploadStale;
  const recoveryCooldown = now - Number(diagnostics.lastRecoveryAt || 0) < 60 * 1000;
  const restartForStale = isStale && !recoveryCooldown;

  let running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  let restarted = false;
  const optionsChanged = Number(cfg.optionsVersion || 0) !== LOCATION_OPTIONS_VERSION;

  if (running && (optionsChanged || restartForStale)) {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (e) {
      await patchDiagnostics({
        lastRestartStopError: String(e?.message || e).slice(0, 200),
        lastRestartStopErrorAt: Date.now(),
      });
    }
    running = false;
  }

  if (!running) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, LOCATION_OPTIONS);
    restarted = true;
    await patchDiagnostics({ lastRecoveryAt: Date.now(), lastTrackingStartedAt: Date.now() });
  }

  // Zapisz bieżące przypisanie i wersję opcji niezależnie od tego, czy task już działał.
  await AsyncStorage.setItem(
    LOCATION_CONFIG_KEY,
    JSON.stringify({
      ...cfg,
      enabled: true,
      optionsVersion: LOCATION_OPTIONS_VERSION,
      vehicleId: normalizeVehicleId(assignment.vehicleId),
      registration: assignment.registration || cfg.registration || '',
    })
  );

  // Don't force a high-accuracy GPS fix on every 5-second assignment poll.
  // Request one after a restart or if native updates have not delivered a fix for 30s.
  const shouldRequestFreshFix = restarted || isStale || !lastTaskAt || now - lastTaskAt > 30 * 1000;
  if (shouldRequestFreshFix) {
    try {
      await saveLocation(
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      );
    } catch (e) {
      console.log('LOCATION_REFRESH_ERROR', e);
    }
  }

  await patchDiagnostics({
    lastEnsureAt: Date.now(),
    lastEnsureError: null,
    lastEnsureErrorAt: null,
    lastEnsureRestarted: restarted,
    lastEnsureRestartReason: isStale ? 'stale' : optionsChanged ? 'options-outdated' : restarted ? 'task-missing' : 'healthy',
  });

  return {
    ok: true,
    restarted,
    wasStale: isStale,
    vehicleId: assignment.vehicleId,
    registration: assignment.registration || '',
  };
}

/**
 * Twarde wymuszenie restartu trackingu (używane przy powrocie do aplikacji).
 */
export async function forceRestartVehicleLocationTracking() {
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };

  const cfg = await getConfig();
  if (cfg.enabled !== true) return { ok: false, reason: 'disabled' };

  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (e) {
    await patchDiagnostics({
      lastForceRestartStopError: String(e?.message || e).slice(0, 200),
      lastForceRestartStopErrorAt: Date.now(),
    });
  }

  // Krótka przerwa pomaga urządzeniom, które opóźniają restart usług lokalizacji.
  await new Promise((resolve) => setTimeout(resolve, 400));

  return ensureVehicleLocationTracking();
}

export async function getVehicleLocationConfig(){
  const cfg=await getConfig();
  const token=await getLocationDeviceToken();
  if(token&&API_BASE_URL){try{const assignment=await getDeviceAssignment(token);if(assignment)return {...cfg,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||'',enabled:cfg.enabled===true};}catch{}}
  return cfg;
}

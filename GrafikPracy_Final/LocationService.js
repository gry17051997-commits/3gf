import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {Platform, AppState} from 'react-native';
import {API_BASE_URL, apiPostGps} from './apiClient';
import {missingAssignmentAction, mergePendingGpsPoints} from './gpsLifecycle';

export const LOCATION_TASK_NAME='grafik-pracy-vehicle-location-v2';
export const LOCATION_CONFIG_KEY='grafik-pracy-location-config-v2';
export const LOCATION_CURRENT_KEY='grafik-pracy-location-current-v2';
export const LOCATION_DEVICE_TOKEN_KEY='grafik-pracy-location-device-token-v1';
export const LOCATION_DIAGNOSTICS_KEY='grafik-pracy-location-diagnostics-v1';
export const LOCATION_PENDING_QUEUE_KEY='grafik-pracy-location-pending-v1';
const MAX_PENDING_GPS_POINTS=1000;
const MAX_PENDING_GPS_AGE_MS=7*24*60*60*1000;
const MAX_PENDING_GPS_FLUSH_PER_PASS=20;
const LOCATION_OPTIONS_VERSION=3;

export const normalizeVehicleId=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40)||'SLUZBOWY';

const getConfig=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_CONFIG_KEY);return raw?JSON.parse(raw):{};}catch{return{};}};
export const getLocationDeviceToken=()=>AsyncStorage.getItem(LOCATION_DEVICE_TOKEN_KEY);
export const getLocationDiagnostics=async()=>{try{const raw=await AsyncStorage.getItem(LOCATION_DIAGNOSTICS_KEY);return raw?JSON.parse(raw):{};}catch{return{};}};
const patchDiagnostics=async patch=>{try{const old=await getLocationDiagnostics();await AsyncStorage.setItem(LOCATION_DIAGNOSTICS_KEY,JSON.stringify({...old,...patch}));}catch(error){console.log('LOCATION_DIAGNOSTICS_WRITE_ERROR',error?.message||error);}};
export const setLocationDeviceToken=async token=>{const value=String(token||'').trim();if(value)await AsyncStorage.setItem(LOCATION_DEVICE_TOKEN_KEY,value);else await AsyncStorage.removeItem(LOCATION_DEVICE_TOKEN_KEY);return value;};

const distanceMeters=(a,b)=>{if(!a||!b)return Infinity;const R=6371000,p1=a.latitude*Math.PI/180,p2=b.latitude*Math.PI/180,dp=(b.latitude-a.latitude)*Math.PI/180,dl=(b.longitude-a.longitude)*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};

const getDeviceAssignment=async token=>{
  if(!API_BASE_URL||!token)throw new Error('GPS_DEVICE_CONFIGURATION_MISSING');
  let response;
  const controller=new AbortController();
  const timeoutId=setTimeout(()=>controller.abort(),8000);
  try{
    response=await fetch(API_BASE_URL+'/gps/device',{
      headers:{'X-Device-Token':token},
      signal:controller.signal
    });
  }catch(error){
    // Błąd sieci/API nie jest dowodem, że urządzenie utraciło przypisanie.
    // Nie wolno z jego powodu zatrzymywać działającego foreground service.
    const reason=error?.name==='AbortError'?'GPS_ASSIGNMENT_TIMEOUT':'GPS_ASSIGNMENT_NETWORK_ERROR';
    throw new Error(reason+': '+String(error?.message||error));
  }finally{
    clearTimeout(timeoutId);
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
  timeInterval:10000,
  distanceInterval:0,
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
async function readPendingGpsQueue(){
  try{
    const raw=await AsyncStorage.getItem(LOCATION_PENDING_QUEUE_KEY);
    const parsed=raw?JSON.parse(raw):[];
    return Array.isArray(parsed)?parsed:[];
  }catch{return [];}
}
async function writePendingGpsQueue(queue){
  await AsyncStorage.setItem(LOCATION_PENDING_QUEUE_KEY,JSON.stringify(queue));
  await patchDiagnostics({pendingUploadCount:queue.length,pendingUploadUpdatedAt:Date.now()});
}
async function saveCurrentLocationFromUploadedSample(payload,result,cfg){
  try{
    const assignedVehicleId=normalizeVehicleId(result.vehicleId||result.registration||cfg.vehicleId);
    let previous=null;
    try{const raw=await AsyncStorage.getItem(LOCATION_CURRENT_KEY);previous=raw?JSON.parse(raw):null;}catch{}
    // An older queued sample may arrive after a newer live point. Never move the local current position backwards.
    if(Number(previous?.observedAt||0)>Number(payload.observedAt||0))return;
    const local={...payload,vehicleId:assignedVehicleId,registration:result.registration||cfg.registration||'',receivedAt:Date.now()};
    const moved=previous?distanceMeters(previous,payload):Infinity;
    const historyAt=Number(previous?.historyAt||0);
    local.historyAt=!previous||moved>=80||Date.now()-historyAt>=120000?Date.now():historyAt;
    await AsyncStorage.setItem(LOCATION_CURRENT_KEY,JSON.stringify(local));
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...cfg,enabled:true,vehicleId:assignedVehicleId,registration:local.registration}));
  }catch(error){
    const message=String(error?.message||error||'unknown');
    await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now()});
    console.log('LOCATION_LOCAL_SAVE_ERROR',message);
  }
}
async function flushPendingGpsQueue(deviceToken,cfg){
  if(!deviceToken)return;
  let queue=mergePendingGpsPoints(await readPendingGpsQueue(),[],Date.now(),MAX_PENDING_GPS_POINTS,MAX_PENDING_GPS_AGE_MS);
  await writePendingGpsQueue(queue);
  let uploaded=0;
  while(queue.length&&uploaded<MAX_PENDING_GPS_FLUSH_PER_PASS){
    const sample=queue[0];
    await patchDiagnostics({lastUploadAttemptAt:Date.now(),lastUploadAttemptObservedAt:sample.observedAt,lastUploadAttemptError:null});
    let result=null,lastError=null;
    for(let attempt=0;attempt<3;attempt++){
      try{result=await apiPostGps(sample,deviceToken);lastError=null;break;}
      catch(error){lastError=error;if(String(error?.message||error)==='GPS_ASSIGNMENT_CHANGED')break;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));}
    }
    if(!result&&String(lastError?.message||lastError)==='GPS_ASSIGNMENT_CHANGED'){
      queue=queue.slice(1);
      await writePendingGpsQueue(queue);
      await patchDiagnostics({lastStaleAssignmentSampleDroppedAt:Date.now(),lastStaleAssignmentSampleObservedAt:sample.observedAt,lastUploadError:null});
      uploaded++;
      continue;
    }
    if(!result){
      const message=String(lastError?.message||lastError||'unknown');
      await patchDiagnostics({lastUploadError:message.slice(0,240),lastUploadErrorAt:Date.now(),lastUploadAttemptError:message.slice(0,240),pendingUploadCount:queue.length});
      console.log('LOCATION_API_WRITE_ERROR_AFTER_RETRIES',message);
      return;
    }
    queue=queue.slice(1);
    await writePendingGpsQueue(queue);
    await patchDiagnostics({lastUploadAt:Date.now(),lastUploadError:null,lastUploadErrorAt:null,lastUploadAttemptError:null,lastUploadSucceededObservedAt:sample.observedAt});
    await saveCurrentLocationFromUploadedSample(sample,result,cfg);
    uploaded++;
  }
}
async function saveLocationInternal(location){
  if(!location?.coords||!API_BASE_URL)return;
  const cfg=await getConfig();
  if(cfg.enabled!==true)return;
  const c=location.coords,now=Date.now(),observedAt=Number(location.timestamp||now);
  if(!Number.isFinite(Number(c.latitude))||!Number.isFinite(Number(c.longitude))||!Number.isFinite(observedAt))return;
  const payload={
    sampleId:String(cfg.assignedVehicleServerId||'unassigned')+'-'+String(Math.round(observedAt))+'-'+Number(c.latitude).toFixed(6)+'-'+Number(c.longitude).toFixed(6),
    assignedVehicleId:cfg.assignedVehicleServerId||null,
    latitude:Number(c.latitude),
    longitude:Number(c.longitude),
    accuracy:Number.isFinite(Number(c.accuracy))?Number(c.accuracy):null,
    altitude:Number.isFinite(Number(c.altitude))?Number(c.altitude):null,
    speed:Number.isFinite(c.speed)?Number(c.speed):null,
    heading:Number.isFinite(c.heading)?Number(c.heading):null,
    observedAt
  };
  const queue=mergePendingGpsPoints(await readPendingGpsQueue(),[payload],now,MAX_PENDING_GPS_POINTS,MAX_PENDING_GPS_AGE_MS);
  await writePendingGpsQueue(queue);
  const deviceToken=await getLocationDeviceToken();
  if(!deviceToken){
    await patchDiagnostics({lastUploadError:'GPS_DEVICE_TOKEN_MISSING',lastUploadErrorAt:Date.now()});
    return;
  }
  await flushPendingGpsQueue(deviceToken,cfg);
}
function saveLocation(location){const run=saveQueue.then(()=>saveLocationInternal(location));saveQueue=run.catch(()=>{});return run;}

// Background tasks are native-only. Avoid calling TaskManager APIs in web builds.
if(Platform.OS!=='web'&&!TaskManager.isTaskDefined(LOCATION_TASK_NAME)){
  TaskManager.defineTask(LOCATION_TASK_NAME,async({data,error})=>{
    const invokedAt=Date.now();
    if(error){
      await patchDiagnostics({lastTaskInvocationAt:invokedAt,lastTaskInvocationStatus:'error',lastTaskError:String(error.message||error).slice(0,240),lastTaskErrorAt:invokedAt});
      return;
    }
    const locations=Array.isArray(data?.locations)?data.locations:[];
    await patchDiagnostics({lastTaskInvocationAt:invokedAt,lastTaskInvocationStatus:locations.length?'locations-received':'empty-batch',lastTaskLocationCount:locations.length,lastTaskError:null,lastTaskErrorAt:null});
    if(!locations.length)return;
    for(const location of locations){
      const coords=location?.coords||{};
      await patchDiagnostics({lastTaskAt:Date.now(),lastTaskError:null,lastTaskErrorAt:null,lastLocalLatitude:Number(coords.latitude)||null,lastLocalLongitude:Number(coords.longitude)||null,lastLocalObservedAt:Number(location.timestamp)||Date.now()});
      try{
        await saveLocation(location);
        await patchDiagnostics({lastTaskLocationProcessedAt:Date.now(),lastTaskLocationProcessedObservedAt:Number(location.timestamp)||Date.now(),lastTaskLocationProcessError:null});
      }catch(taskError){
        await patchDiagnostics({lastTaskLocationProcessError:String(taskError?.message||taskError).slice(0,240),lastTaskLocationProcessErrorAt:Date.now()});
      }
    }
    await patchDiagnostics({lastTaskInvocationCompletedAt:Date.now()});
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
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...old,enabled:true,optionsVersion:LOCATION_OPTIONS_VERSION,vehicleId:normalizeVehicleId(assignment.vehicleId),assignedVehicleServerId:assignment.vehicleId,registration:assignment.registration||registration||''}));
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

export async function ensureVehicleLocationTracking(){
  if(Platform.OS==='web'||!API_BASE_URL)return {ok:false,reason:'unsupported'};
  // Funkcja może być wywołana przy wznowieniu aplikacji. Nie zatrzymuj ani nie
  // uznawaj działającego nadajnika za wyłączony tylko dlatego, że ekran był zablokowany.
  const cfg=await getConfig();
  if(cfg.enabled!==true)return {ok:false,reason:'disabled'};
  const token=await getLocationDeviceToken();
  if(!token)return {ok:false,reason:'device-token-missing'};
  const assignment=await getDeviceAssignment(token);
  if(!assignment?.vehicleId){
    // Brak przypisania nie oznacza, że użytkownik wyłączył GPS.
    // Zatrzymaj zbieranie punktów do czasu przypisania, ale zachowaj zgodę
    // enabled=true, aby kolejna synchronizacja mogła automatycznie wznowić usługę.
    const action=missingAssignmentAction(cfg.enabled);
    if(action==='pause-preserve-enabled'){
      if(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)){
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
      await patchDiagnostics({lastAssignmentStatus:'unassigned',lastAssignmentCheckedAt:Date.now(),lastAssignmentError:null});
      return {ok:false,reason:'device-not-assigned',recoverable:true};
    }
    await patchDiagnostics({lastAssignmentStatus:'unassigned',lastAssignmentCheckedAt:Date.now(),lastAssignmentError:null});
    return {ok:false,reason:'disabled'};
  }
  await patchDiagnostics({lastAssignmentStatus:'assigned',lastAssignmentCheckedAt:Date.now(),lastAssignmentError:null});
  const fg=await Location.getForegroundPermissionsAsync(),bg=await Location.getBackgroundPermissionsAsync();
  if(fg.status!=='granted'||bg.status!=='granted')return {ok:false,reason:'permission'};
  if(!(await Location.hasServicesEnabledAsync()))return {ok:false,reason:'location-services-disabled'};
  let running=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  let restarted=false;
  if(running && Number(cfg.optionsVersion||0)!==LOCATION_OPTIONS_VERSION){
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    running=false;
  }
  if(!running){
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME,LOCATION_OPTIONS);
    restarted=true;
  }
  if(!running || Number(cfg.optionsVersion||0)!==LOCATION_OPTIONS_VERSION || cfg.assignedVehicleServerId!==assignment.vehicleId){
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY,JSON.stringify({...cfg,enabled:true,optionsVersion:LOCATION_OPTIONS_VERSION,vehicleId:normalizeVehicleId(assignment.vehicleId),assignedVehicleServerId:assignment.vehicleId,registration:assignment.registration||cfg.registration||''}));
  }
  try{await saveLocation(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}));}catch(e){console.log('LOCATION_REFRESH_ERROR',e);}
  return {ok:true,restarted,vehicleId:assignment.vehicleId,registration:assignment.registration||''};
}

export async function getVehicleLocationRuntimeStatus(){
  const checkedAt=Date.now();
  const cfg=await getConfig();
  const diagnostics=await getLocationDiagnostics();
  let taskDefined=false,taskRunning=false,foregroundPermission='unknown',backgroundPermission='unknown',locationServicesEnabled=null,statusError=null;
  try{
    taskDefined=Platform.OS!=='web'&&TaskManager.isTaskDefined(LOCATION_TASK_NAME);
    if(Platform.OS!=='web'){
      taskRunning=await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      const fg=await Location.getForegroundPermissionsAsync();
      const bg=await Location.getBackgroundPermissionsAsync();
      foregroundPermission=fg.status;
      backgroundPermission=bg.status;
      locationServicesEnabled=await Location.hasServicesEnabledAsync();
    }
  }catch(error){
    statusError=String(error?.message||error||'unknown').slice(0,240);
  }
  const lastTaskAt=Number(diagnostics.lastTaskAt||0);
  const lastUploadAt=Number(diagnostics.lastUploadAt||0);
  return {
    ...diagnostics,
    runtimeCheckedAt:checkedAt,
    trackingConfigured:cfg.enabled===true,
    nativeTaskDefined:taskDefined,
    nativeTaskRunning:taskRunning,
    foregroundPermission,
    backgroundPermission,
    locationServicesEnabled,
    lastTaskAgeMs:lastTaskAt?Math.max(0,checkedAt-lastTaskAt):null,
    lastUploadAgeMs:lastUploadAt?Math.max(0,checkedAt-lastUploadAt):null,
    runtimeStatusError:statusError
  };
}

export async function getVehicleLocationConfig(){
  const cfg=await getConfig();
  const token=await getLocationDeviceToken();
  if(token&&API_BASE_URL){try{const assignment=await getDeviceAssignment(token);if(assignment)return {...cfg,vehicleId:normalizeVehicleId(assignment.vehicleId),registration:assignment.registration||'',enabled:cfg.enabled===true};}catch{}}
  return cfg;
}

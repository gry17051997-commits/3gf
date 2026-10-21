import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {Platform} from 'react-native';
import {API_BASE_URL, apiPostGps} from './apiClient';

export const LOCATION_TASK_NAME = 'grafik-pracy-vehicle-location-v2';
export const LOCATION_CONFIG_KEY = 'grafik-pracy-location-config-v2';
export const LOCATION_CURRENT_KEY = 'grafik-pracy-location-current-v2';
export const LOCATION_DEVICE_TOKEN_KEY = 'grafik-pracy-location-device-token-v1';
export const LOCATION_DIAGNOSTICS_KEY = 'grafik-pracy-location-diagnostics-v1';
const LOCATION_GPS_QUEUE_KEY = 'grafik-pracy-location-gps-queue-v1';
const LOCATION_OPTIONS_VERSION = 4;
const LOCATION_TASK_STALE_AFTER_MS = 90000;

export const normalizeVehicleId = value =>
  String(value || '').trim().toUpperCase()
    .replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi, '_').slice(0, 40) || 'SLUZBOWY';

const getConfig = async () => {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const getLocationDeviceToken = () => AsyncStorage.getItem(LOCATION_DEVICE_TOKEN_KEY);

export const getLocationDiagnostics = async () => {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_DIAGNOSTICS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const patchDiagnostics = async patch => {
  try {
    const old = await getLocationDiagnostics();
    await AsyncStorage.setItem(LOCATION_DIAGNOSTICS_KEY, JSON.stringify({...old, ...patch}));
  } catch (error) {
    console.log('[LOCATION_DIAGNOSTICS_PATCH_ERROR]', error);
  }
};

export const setLocationDeviceToken = async token => {
  const value = String(token || '').trim();
  if (value) await AsyncStorage.setItem(LOCATION_DEVICE_TOKEN_KEY, value);
  else await AsyncStorage.removeItem(LOCATION_DEVICE_TOKEN_KEY);
  return value;
};

const distanceMeters = (a, b) => {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const p1 = a.latitude * Math.PI / 180;
  const p2 = b.latitude * Math.PI / 180;
  const dp = (b.latitude - a.latitude) * Math.PI / 180;
  const dl = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const getDeviceAssignment = async token => {
  if (!API_BASE_URL || !token) throw new Error('GPS_DEVICE_CONFIGURATION_MISSING');
  let response;
  try {
    response = await fetch(API_BASE_URL + '/gps/device', {headers: {'X-Device-Token': token}});
  } catch (error) {
    throw new Error('GPS_ASSIGNMENT_NETWORK_ERROR: ' + String(error?.message || error));
  }
  if (response.status === 401 || response.status === 404) return null;
  if (!response.ok) throw new Error('GPS_ASSIGNMENT_HTTP_' + response.status);
  let assignment;
  try {
    assignment = await response.json();
  } catch {
    throw new Error('GPS_ASSIGNMENT_INVALID_RESPONSE');
  }
  if (!assignment?.vehicleId) return null;
  return assignment;
};

const LOCATION_OPTIONS = {
  accuracy: Location.Accuracy.High,
  timeInterval: 10000,
  distanceInterval: 0,
  deferredUpdatesInterval: 0,
  deferredUpdatesDistance: 0,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Grafik Pracy • GPS aktywny',
    notificationBody: 'Lokalizacja auta jest udostępniana również przy zablokowanym ekranie.',
    notificationColor: '#467ff1',
    killServiceOnDestroy: false
  }
};

const getGpsQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_GPS_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    await patchDiagnostics({queueReadErrorAt: Date.now()});
    return [];
  }
};

const saveGpsQueue = queue =>
  AsyncStorage.setItem(LOCATION_GPS_QUEUE_KEY, JSON.stringify(queue));

const enqueueGpsPayload = async payload => {
  const queue = await getGpsQueue();
  const observedAt = Number(payload.observedAt || Date.now());
  const duplicate = queue.some(item =>
    Number(item.observedAt) === observedAt &&
    Number(item.latitude) === Number(payload.latitude) &&
    Number(item.longitude) === Number(payload.longitude)
  );
  if (duplicate) return;
  try {
    queue.push({...payload, observedAt, queuedAt: Date.now(), attempts: 0});
    await saveGpsQueue(queue);
    await patchDiagnostics({queuedGpsCount: queue.length, lastQueuedAt: Date.now(), queueWriteError: null});
  } catch (error) {
    await patchDiagnostics({
      queueWriteError: String(error?.message || error).slice(0, 240),
      queueWriteErrorAt: Date.now()
    });
    console.log('LOCATION_QUEUE_WRITE_ERROR', error);
  }
};

let queueFlushPromise = null;
const flushGpsQueue = async () => {
  if (queueFlushPromise) return queueFlushPromise;
  queueFlushPromise = (async () => {
    const token = await getLocationDeviceToken();
    if (!token || !API_BASE_URL) return;
    let queue = await getGpsQueue();
    while (queue.length) {
      const item = queue[0];
      try {
        const uploadResult = await apiPostGps({
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          accuracy: Number(item.accuracy || 0),
          altitude: Number(item.altitude || 0),
          speed: item.speed ?? null,
          heading: item.heading ?? null,
          observedAt: Number(item.observedAt || item.queuedAt || Date.now())
        }, token);
        if (!uploadResult) throw new Error('GPS_QUEUE_UPLOAD_EMPTY_RESPONSE');
        queue = queue.slice(1);
        await saveGpsQueue(queue);
        await patchDiagnostics({queuedGpsCount: queue.length, lastQueueFlushAt: Date.now(), queueWriteError: null});
      } catch (error) {
        const attempts = Number(item.attempts || 0) + 1;
        queue[0] = {...item, attempts, lastAttemptAt: Date.now(),
          lastError: String(error?.message || error).slice(0, 200)};
        await saveGpsQueue(queue).catch(async saveError => {
          await patchDiagnostics({queueWriteError: String(saveError?.message || saveError).slice(0, 240)});
        });
        await patchDiagnostics({
          queuedGpsCount: queue.length,
          lastQueueFlushError: String(error?.message || error).slice(0, 240),
          lastQueueFlushErrorAt: Date.now()
        });
        break;
      }
    }
  })().finally(() => { queueFlushPromise = null; });
  return queueFlushPromise;
};

let saveQueue = Promise.resolve();

async function saveLocationInternal(location) {
  if (!location?.coords || !API_BASE_URL) return;
  const cfg = await getConfig();
  if (cfg.enabled !== true) return;
  const deviceToken = await getLocationDeviceToken();
  if (!deviceToken) return;
  const c = location.coords;
  const now = Date.now();
  const payload = {
    latitude: Number(c.latitude),
    longitude: Number(c.longitude),
    accuracy: Number(c.accuracy || 0),
    altitude: Number(c.altitude || 0),
    speed: Number.isFinite(c.speed) ? Number(c.speed) : null,
    heading: Number.isFinite(c.heading) ? Number(c.heading) : null,
    observedAt: Number(location.timestamp || now)
  };

  let result = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await apiPostGps(payload, deviceToken);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }

  if (!result) {
    const message = String(lastError?.message || lastError || 'unknown');
    await enqueueGpsPayload(payload);
    await patchDiagnostics({lastUploadError: message.slice(0, 240), lastUploadErrorAt: Date.now()});
    console.log('LOCATION_API_WRITE_ERROR_AFTER_RETRIES', message);
    return;
  }

  try {
    await patchDiagnostics({lastUploadAt: Date.now(), lastUploadError: null, lastUploadErrorAt: null});
    const assignedVehicleId = normalizeVehicleId(result.vehicleId || result.registration || cfg.vehicleId);
    const local = {
      ...payload,
      vehicleId: assignedVehicleId,
      registration: result.registration || cfg.registration || '',
      receivedAt: Date.now()
    };
    let previous = null;
    try {
      const raw = await AsyncStorage.getItem(LOCATION_CURRENT_KEY);
      previous = raw ? JSON.parse(raw) : null;
    } catch {}
    const moved = previous ? distanceMeters(previous, payload) : Infinity;
    const historyAt = Number(previous?.historyAt || 0);
    local.historyAt = !previous || moved >= 80 || now - historyAt >= 120000 ? now : historyAt;
    await AsyncStorage.setItem(LOCATION_CURRENT_KEY, JSON.stringify(local));
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY, JSON.stringify({
      ...cfg, enabled: true, vehicleId: assignedVehicleId, registration: local.registration
    }));
  } catch (error) {
    const message = String(error?.message || error || 'unknown');
    await patchDiagnostics({lastUploadError: message.slice(0, 240), lastUploadErrorAt: Date.now()});
    console.log('LOCATION_LOCAL_SAVE_ERROR', message);
  }

  // Po udanej transmisji bieżącego punktu próbujemy wysłać starsze pomiary.
  await flushGpsQueue();
}

function saveLocation(location) {
  const run = saveQueue.then(() => saveLocationInternal(location));
  saveQueue = run.catch(() => {});
  return run;
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({data, error}) => {
    if (error) {
      await patchDiagnostics({
        lastTaskError: String(error.message || error).slice(0, 240),
        lastTaskErrorAt: Date.now()
      });
      return;
    }
    if (!data?.locations?.length) return;
    for (const location of data.locations) {
      const coords = location?.coords || {};
      await patchDiagnostics({
        lastTaskAt: Date.now(),
        lastTaskError: null,
        lastTaskErrorAt: null,
        lastLocalLatitude: Number(coords.latitude) || null,
        lastLocalLongitude: Number(coords.longitude) || null,
        lastLocalAccuracy: Number(coords.accuracy) || null,
        lastLocalObservedAt: Number(location.timestamp) || Date.now()
      });
      await saveLocation(location);
    }
  });
}

export async function saveVehicleLocationAssignment(registration) {
  const reg = String(registration || '').trim().toUpperCase();
  if (!reg) throw new Error('Brak numeru rejestracyjnego.');
  const old = await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY, JSON.stringify({
    ...old, vehicleId: normalizeVehicleId(reg), registration: reg
  }));
  return {ok: true, vehicleId: normalizeVehicleId(reg), registration: reg};
}

const verifyTaskStarted = async () => {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
};

export async function startVehicleLocationTracking({vehicleId, registration} = {}) {
  if (Platform.OS === 'web') return {ok: false, reason: 'web'};
  if (!API_BASE_URL) return {ok: false, reason: 'api-not-configured'};
  try {
    const token = await getLocationDeviceToken();
    if (!token) return {ok: false, reason: 'device-token-missing'};
    const assignment = await getDeviceAssignment(token);
    if (!assignment?.vehicleId) return {ok: false, reason: 'device-not-assigned'};

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return {ok: false, reason: 'foreground-permission'};
    if (!(await Location.hasServicesEnabledAsync())) return {ok: false, reason: 'location-services-disabled'};
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return {ok: false, reason: 'background-permission'};

    const old = await getConfig();
    const resolvedVehicleId = normalizeVehicleId(assignment.vehicleId || vehicleId || registration || old.vehicleId);
    const resolvedRegistration = String(assignment.registration || registration || old.registration || '').trim().toUpperCase();
    await AsyncStorage.setItem(LOCATION_CONFIG_KEY, JSON.stringify({
      ...old, enabled: true, optionsVersion: LOCATION_OPTIONS_VERSION,
      vehicleId: resolvedVehicleId, registration: resolvedRegistration
    }));

    let running = await verifyTaskStarted();
    if (running && Number(old.optionsVersion || 0) !== LOCATION_OPTIONS_VERSION) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      running = false;
    }
    if (!running) await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, LOCATION_OPTIONS);
    if (!(await verifyTaskStarted())) {
      await patchDiagnostics({lastTaskError: 'TASK_NOT_RUNNING_AFTER_START', lastTaskErrorAt: Date.now()});
      return {ok: false, reason: 'task-start-failed'};
    }

    try {
      await saveLocation(await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest, mayShowUserSettingsDialog: true
      }));
    } catch (error) {
      console.log('LOCATION_INITIAL_FIX_ERROR', error);
    }
    await flushGpsQueue();
    return {ok: true, vehicleId: resolvedVehicleId, registration: resolvedRegistration};
  } catch (error) {
    await patchDiagnostics({
      lastTaskError: String(error?.message || error).slice(0, 240),
      lastTaskErrorAt: Date.now()
    });
    console.log('LOCATION_START_ERROR', error);
    return {ok: false, reason: 'task-start-failed', error: String(error?.message || error).slice(0, 180)};
  }
}

export async function stopVehicleLocationTracking() {
  if (Platform.OS !== 'web') {
    try {
      if (await verifyTaskStarted()) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (error) {
      console.log('LOCATION_STOP_ERROR', error);
    }
  }
  const old = await getConfig();
  await AsyncStorage.setItem(LOCATION_CONFIG_KEY, JSON.stringify({...old, enabled: false}));
  await AsyncStorage.removeItem(LOCATION_CURRENT_KEY);
}

export async function ensureVehicleLocationTracking() {
  if (Platform.OS === 'web' || !API_BASE_URL) return {ok: false, reason: 'unsupported'};
  try {
    const cfg = await getConfig();
    if (cfg.enabled !== true) return {ok: false, reason: 'disabled'};
    const token = await getLocationDeviceToken();
    if (!token) return {ok: false, reason: 'device-token-missing'};
    const assignment = await getDeviceAssignment(token);
    if (!assignment?.vehicleId) {
      await stopVehicleLocationTracking();
      return {ok: false, reason: 'device-not-assigned'};
    }

    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    if (fg.status !== 'granted' || bg.status !== 'granted') return {ok: false, reason: 'permission'};
    if (!(await Location.hasServicesEnabledAsync())) return {ok: false, reason: 'location-services-disabled'};

    let running = await verifyTaskStarted();
    const diagnostics = await getLocationDiagnostics();
    const lastTaskAt = Number(diagnostics.lastTaskAt || 0);
    // Stary zapis diagnostyczny po restarcie procesu nie wystarcza sam w sobie
    // do uznania taska za zawieszony. Najpierw próbujemy uzyskać świeży pomiar.
    const staleTask = lastTaskAt > 0 && Date.now() - lastTaskAt > LOCATION_TASK_STALE_AFTER_MS;
    const versionMismatch = Number(cfg.optionsVersion || 0) !== LOCATION_OPTIONS_VERSION;
    let restarted = false;

    if (running && (staleTask || versionMismatch)) {
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (error) {
        await patchDiagnostics({lastTaskStopError: String(error?.message || error).slice(0, 240), lastTaskStopErrorAt: Date.now()});
      }
      running = await verifyTaskStarted();
      if (running) return {ok: false, reason: 'task-stop-failed'};
    }

    if (!running) {
      try {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, LOCATION_OPTIONS);
        restarted = true;
      } catch (error) {
        await patchDiagnostics({lastTaskError: String(error?.message || error).slice(0, 240), lastTaskErrorAt: Date.now()});
        return {ok: false, reason: 'task-start-failed'};
      }
    }

    if (!(await verifyTaskStarted())) {
      await patchDiagnostics({lastTaskError: 'TASK_NOT_RUNNING_AFTER_START', lastTaskErrorAt: Date.now()});
      return {ok: false, reason: 'task-start-failed'};
    }

    await AsyncStorage.setItem(LOCATION_CONFIG_KEY, JSON.stringify({
      ...cfg, enabled: true, optionsVersion: LOCATION_OPTIONS_VERSION,
      vehicleId: normalizeVehicleId(assignment.vehicleId),
      registration: assignment.registration || cfg.registration || ''
    }));

    try {
      const fresh = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High});
      await saveLocation(fresh);
      await flushGpsQueue();
    } catch (error) {
      console.log('LOCATION_REFRESH_ERROR', error);
    }

    return {ok: true, restarted, vehicleId: assignment.vehicleId, registration: assignment.registration || ''};
  } catch (error) {
    await patchDiagnostics({lastTaskError: String(error?.message || error).slice(0, 240), lastTaskErrorAt: Date.now()});
    return {ok: false, reason: 'ensure-failed', error: String(error?.message || error).slice(0, 180)};
  }
}

export async function getVehicleLocationConfig() {
  const cfg = await getConfig();
  const token = await getLocationDeviceToken();
  if (token && API_BASE_URL) {
    try {
      const assignment = await getDeviceAssignment(token);
      if (assignment) return {
        ...cfg,
        vehicleId: normalizeVehicleId(assignment.vehicleId),
        registration: assignment.registration || '',
        enabled: cfg.enabled === true
      };
    } catch {}
  }
  return cfg;
}

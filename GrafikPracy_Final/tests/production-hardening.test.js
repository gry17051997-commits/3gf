import fs from 'node:fs';
import test from 'node:test';
import gpsLifecycle from '../gpsLifecycle.js';
const {missingAssignmentAction} = gpsLifecycle;
import assert from 'node:assert/strict';
import {
  canAssignPersonToDay,
  maxAdditionalAssignments,
  buildWeekDocument,
  isValidWeekId,
  isValidWeekIdMap,
  isValidScheduleWeekMap,
  isValidScheduleConditions,
  serverTimestampMillis,
  addHourEpoch,
  getShiftEndEpoch
} from '../scheduleEngine.js';

test('24h disabled blocks a second shift for the same person', () => {
  const day = [{person:'P'}, {person:null}];
  assert.equal(canAssignPersonToDay(day,'P',false), false);
  assert.equal(canAssignPersonToDay(day,'M',false), true);
});

test('24h enabled allows the same person on both shifts', () => {
  const day = [{person:'P'}, {person:null}];
  assert.equal(canAssignPersonToDay(day,'P',true), true);
});

test('24h mode does not bypass an unrelated empty-slot restriction', () => {
  const day = [{person:'M'}, {person:null}];
  assert.equal(canAssignPersonToDay(day,'P',true), true);
});

test('24h capacity counts both shifts per day only when explicitly enabled', () => {
  const slots = Array.from({length:7},(_,dayIndex)=>[
    {dayIndex,shiftIndex:0},
    {dayIndex,shiftIndex:1}
  ]).flat();
  const isAvailable = () => true;

  assert.equal(maxAdditionalAssignments(slots,false,isAvailable),7);
  assert.equal(maxAdditionalAssignments(slots,true,isAvailable),14);
});

test('week documents are isolated by weekId', () => {
  const weekA = buildWeekDocument('2026-09-28', [{dayIndex:0,shifts:[{person:'P'}]}], {hours:10});
  const weekB = buildWeekDocument('2026-10-05', [{dayIndex:0,shifts:[{person:'M'}]}], {hours:12});

  assert.equal(weekA.weekId, '2026-09-28');
  assert.equal(weekB.weekId, '2026-10-05');
  assert.notDeepEqual(weekA.week, weekB.week);
  assert.equal(Object.hasOwn(weekA, 'weeks'), false);
  assert.equal(Object.hasOwn(weekB, 'weeks'), false);
});

test('backup schedule validation rejects malformed week shapes and unknown assignees', () => {
  const emptyWeek = Array.from({length:7},(_,dayIndex)=>({
    dayIndex,
    shifts:[{person:null},{person:null}]
  }));
  assert.equal(isValidScheduleWeekMap({}), true);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':emptyWeek}), true);
  assert.equal(isValidScheduleWeekMap({'bad-week':emptyWeek}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':emptyWeek.slice(1)}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':[
    {...emptyWeek[0],shifts:[{person:'admin'},{person:null}]},
    ...emptyWeek.slice(1)
  ]}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':[
    {...emptyWeek[0],dayIndex:1},
    ...emptyWeek.slice(1)
  ]}), false);
  assert.equal(isValidScheduleWeekMap({'2026-09-28':[
    {...emptyWeek[0],shifts:[{person:null,shift:2},{person:null,shift:1}]},
    ...emptyWeek.slice(1)
  ]}), false);
});

test('backup validation rejects unsafe or contradictory generator condition shapes', () => {
  assert.equal(isValidScheduleConditions([
    {type:'must',person:'L',dayIndex:6,shift:2},
    {type:'count',person:'P',value:'8'},
    {type:'off',person:null}
  ]), true);
  assert.equal(isValidScheduleConditions([{type:'must',person:'admin',dayIndex:0,shift:1}]), false);
  assert.equal(isValidScheduleConditions([{type:'must',person:'P',dayIndex:7,shift:1}]), false);
  assert.equal(isValidScheduleConditions([{type:'forbid',person:'P',dayIndex:0}]), false);
  assert.equal(isValidScheduleConditions([{type:'count',person:'P',value:15}]), false);
  assert.equal(isValidScheduleConditions([{type:'unknown',person:'P'}]), false);
});

test('invalid week identifiers are rejected before persistence', () => {
  assert.throws(
    () => buildWeekDocument('main', [], {}),
    /Invalid weekId/
  );
});

test('week identifiers and backup week maps reject impossible calendar dates', () => {
  assert.equal(isValidWeekId('2026-09-28'), true);
  assert.equal(isValidWeekId('2026-02-30'), false);
  assert.equal(isValidWeekId('2026-13-01'), false);
  assert.equal(isValidWeekIdMap({'2026-09-28':{hours:10}}), true);
  assert.equal(isValidWeekIdMap({'2026-02-30':{hours:10}}), false);
});

test('Central API timestamps use server time', () => {
  const timestamp = {toMillis: () => 1234567890};
  assert.equal(serverTimestampMillis(timestamp),1234567890);
  assert.equal(serverTimestampMillis(123),123);
  assert.equal(serverTimestampMillis(undefined),0);
});

test('hourly notification stepping uses absolute epoch time', () => {
  const start = Date.UTC(2026, 9, 25, 0, 30);
  assert.equal(addHourEpoch(start) - start, 3600000);
  assert.equal(addHourEpoch(addHourEpoch(start)) - start, 7200000);
});

test('hourly stepping is independent of local DST transitions', () => {
  const before = Date.UTC(2026, 9, 25, 0, 30);
  const after = addHourEpoch(before);
  assert.equal(after - before, 3600000);
});

test('week payload cannot accidentally carry the complete multi-week state', () => {
  const payload = buildWeekDocument(
    '2026-09-28',
    [{dayIndex:0,shifts:[{person:'P'}]}],
    {hours:12,rotation:'P'}
  );
  assert.deepEqual(Object.keys(payload).sort(), ['config','week','weekId']);
});

test('runtime dashboards do not use interval-driven React tickers', async () => {
  const fs = await import('node:fs/promises');
  const paths = [
    '../Dashboard.js',
    '../NowDashboard.js',
    '../LiveLocationDashboard.js'
  ];
  for (const relative of paths) {
    const source = await fs.readFile(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.match(source, /useSecondTicker\(/);
  }
});

test('shared ticker uses requestAnimationFrame and cancels on unmount', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../hooks/useSecondTicker.js', import.meta.url), 'utf8');
  assert.match(source, /requestAnimationFrame\(/);
  assert.match(source, /cancelAnimationFrame\(/);
});

test('schedule cloud persistence uses a fresh transaction snapshot and updates only dirty shift fields', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  const blockStart = source.indexOf("const scheduleRef=doc(db,'schedules',weekKeyAtSave);");
  const blockEnd = source.indexOf("    },250);", blockStart);
  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.match(block, /const localMap=weekToShiftMap\(localWeek,weekKeyAtSave\)/);
  assert.ok(block.includes('transactionUpdate[`shifts.${key}`]'));
  assert.ok(block.includes('runTransaction(db, async tx =>'));
  assert.ok(block.includes('tx.get(scheduleRef)'));
  assert.ok(block.includes('tx.update(scheduleRef,transactionUpdate)'));
  assert.doesNotMatch(block, /tx\.set\(settingsRef/);
});

test('schedule listener ignores optimistic local snapshots and hydrates flat shift maps', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /includeMetadataChanges:true/);
  assert.match(source, /hasPendingWrites/);
  assert.match(source, /shiftMapToWeek/);
  assert.match(source, /weekToShiftMap/);
});

test('GPS stop failures prevent logout/reset from clearing its local assignment', async () => {
  const fs = await import('node:fs/promises');
  const service = await fs.readFile(new URL('../LocationService.js', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  const stopStart = service.indexOf('export async function stopVehicleLocationTracking()');
  const stopEnd = service.indexOf('export async function ensureVehicleLocationTracking()', stopStart);
  const stopBlock = service.slice(stopStart, stopEnd);
  assert.match(stopBlock, /await Location\.stopLocationUpdatesAsync\(LOCATION_TASK_NAME\)/);
  assert.doesNotMatch(stopBlock, /catch\s*\(/);

  const resetStart = app.indexOf('const resetAll = () => {');
  const resetEnd = app.indexOf('const buildBackupPayload =', resetStart);
  const resetBlock = app.slice(resetStart, resetEnd);
  assert.match(resetBlock, /await stopVehicleLocationTracking\(\)/);
  assert.match(resetBlock, /await cancelReportNotifications\(\)/);
  assert.match(resetBlock, /Nie udało się bezpiecznie zatrzymać GPS lub powiadomień/);
  assert.match(resetBlock, /return;/);
  const cancelStart = app.indexOf('const cancelReportNotifications = async () => {');
  const cancelEnd = app.indexOf('const scheduleReportNotifications = async () => {', cancelStart);
  const cancelBlock = app.slice(cancelStart, cancelEnd);
  assert.match(cancelBlock, /if \(Platform\.OS !== 'web'\)/);
  assert.match(cancelBlock, /AsyncStorage\.removeItem\(REPORT_NOTIFICATION_IDS_KEY\)/);
});

test('local schedule persistence is serialized and surfaces storage failures', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /const localSaveQueueRef = useRef\(Promise\.resolve\(\)\)/);
  assert.match(source, /localSaveQueueRef\.current = localSaveQueueRef\.current\s*\.then\(\(\) => AsyncStorage\.setItem\(KEY,JSON\.stringify\(data\)\)\)/);
  assert.match(source, /console\.error\('Nie udało się zapisać lokalnego grafiku:', error\)/);
  assert.match(source, /setLocalStorageError\('Nie udało się zapisać grafiku na tym urządzeniu\.'\)/);
  assert.match(source, /⚠️ \{localStorageError\}/);
});

test('shared generator settings and recovery ledger persist through the central API store', () => {
  const app = fs.readFileSync(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.match(app,/from '\.\/apiClient'/);
  assert.ok(app.includes("setDoc(doc(db,'settings','main')"));
  assert.doesNotMatch(app,/from ['"]firebase\/firestore/);
});

test('GPS dashboards use the central API instead of Firestore', () => {
  const dashboard = fs.readFileSync(new URL('../LiveLocationDashboard.js', import.meta.url), 'utf8');
  const now = fs.readFileSync(new URL('../NowDashboard.js', import.meta.url), 'utf8');
  assert.match(dashboard,/from '\.\/apiClient'/);
  assert.match(now,/from '\.\/apiClient'/);
  assert.doesNotMatch(dashboard,/firebase\/firestore/);
  assert.doesNotMatch(now,/firebase\/firestore/);
});

test('GPS tracking requires a central device assignment and sends positions through the central API', async () => {
  const fs = await import('node:fs/promises');
  const service = await fs.readFile(new URL('../LocationService.js', import.meta.url), 'utf8');
  assert.match(service, /const getDeviceAssignment=async token=>/);
  assert.ok(service.includes("fetch(API_BASE_URL+'/gps/device'"));
assert.ok(service.includes("if(!assignment?.vehicleId)return null;"));
  assert.ok(service.includes("if(!assignment?.vehicleId)return {ok:false,reason:'device-not-assigned'};"));
  assert.match(service, /apiPostGps\(sample,deviceToken\)/);
  assert.match(service, /normalizeVehicleId\(assignment\.vehicleId\)/);
});

test('fleet assignment UI uses locator uid consistently', async () => {
  const fs = await import('node:fs/promises');
  const panel = await fs.readFile(new URL('../AdminFleetPanel.js', import.meta.url), 'utf8');
  assert.match(panel, /if\(!v\?\.id\|\|!p\?\.id\|\|!u\?\.uid\)/);
  assert.match(panel, /userId:u\.uid/);
  assert.match(panel, /a\.user_id===u\.uid/);
assert.ok(panel.includes('users.filter(u=>u.role===\'locator\').map(u=><TouchableOpacity key={u.id}'));
});
test('App.js stays a thin wrapper and cannot substitute static runtime fixtures', async () => {
  const fs = await import('node:fs/promises');
  const app = await fs.readFile(new URL('../App.js', import.meta.url), 'utf8');
  assert.match(app, /import AppRuntime from '\.\/AppRuntime'/);
assert.ok(app.includes('return <CrashBoundary><AppRuntime /></CrashBoundary>;'));
  assert.doesNotMatch(app, /export const/);
});

test('admin account controls use the central API and never Firebase Auth or Functions', () => {
  const service = fs.readFileSync(new URL('../AdminUserService.js', import.meta.url), 'utf8');
  assert.match(service, /api\('\/users'/);
  assert.match(service, /api\('\/users\/'\+encodeURIComponent\(uid\)/);
  assert.doesNotMatch(service,/firebase\/auth/);
  assert.doesNotMatch(service,/httpsCallable|callable\(/);
});

test('admin role switching clears incompatible employee assignment in the UI', async () => {
  const panel = fs.readFileSync(new URL('../AdminUsersPanel.js', import.meta.url), 'utf8');
  assert.match(panel, /role==='employee'\?f\.personKey:''/);
  assert.ok(panel.includes("personKey:u.role==='employee'?(u.personKey||''):''"));
  assert.match(panel, /DEZAKTYWUJ/);
});



test('central API configuration is enabled and Firebase packages are absent', () => {
  const config = fs.readFileSync(new URL('../firebaseConfig.js', import.meta.url), 'utf8');
  const lock = fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  assert.match(config, /CENTRAL_API_ENABLED\s*=\s*true/);
  assert.doesNotMatch(config, /firebase\/firestore|firebase\/auth/);
  assert.doesNotMatch(lock, /"node_modules\/firebase"/);
});

test('public registration always creates a least-privilege employee account', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  const start = server.indexOf("app.post('/api/auth/register'");
  const end = server.indexOf("app.post('/api/auth/login'", start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /const role='employee'/);
  assert.doesNotMatch(route, /BOOTSTRAP_ADMIN_EMAIL|SELECT COUNT\(\*\)::int AS n FROM users|role='admin'/);
});

test('document store authorization denies unknown collection access by default', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  const readStart = server.indexOf('function canStoreRead(');
  const writeStart = server.indexOf('function canStoreWrite(', readStart);
  const collectionStart = server.indexOf('function assertCollectionName(', writeStart);
  const readBlock = server.slice(readStart, writeStart);
  const writeBlock = server.slice(writeStart, collectionStart);
  assert.match(readBlock, /return false;/);
  assert.match(writeBlock, /return false;/);
  assert.match(readBlock, /name==='chatMessages'\|\|name==='schedules'\|\|name==='settings'\|\|name==='warehouseZones'/);
});

test('release APK build has a safe fallback for the central API URL', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/build-apk.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes("secrets.EXPO_PUBLIC_API_URL || 'https://grafik-pracy-api-fra.onrender.com'"));
});

test('central backend protects document writes with revision checks', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.match(server, /expectedRevision/);
  assert.match(server, /REVISION_CONFLICT/);
  assert.match(server, /AND revision=\$5 RETURNING \*/);
});

test('central backend supports administrator removal of GPS phones', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.delete\('\/api\/phones\/:id',auth,admin/);
  assert.match(server, /PHONE_NOT_FOUND/);
});

test('central document store rejects arbitrary collection names', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.match(server, /STORE_COLLECTIONS=new Set/);
  assert.match(server, /!STORE_COLLECTIONS\.has\(name\)/);
});

test('dashboard GPS mini map keeps a stable WebView and updates the OSM embed without remounting', async () => {
  const fs = await import('node:fs/promises');
  const dashboard = await fs.readFile(new URL('../NowDashboard.js', import.meta.url), 'utf8');
  assert.match(dashboard, /const miniMapHtml=/);
  assert.match(dashboard, /key="gps-mini-map"/);
  assert.match(dashboard, /window\.setGpsPoint=function\(lat,lon\)/);
  assert.match(dashboard, /L\.map\('gpsMap'/);
  assert.match(dashboard, /L\.tileLayer\('https:\/\/api\.maptiler\.com\/maps\/streets-v2/);
  assert.match(dashboard, /process\.env\.EXPO_PUBLIC_MAPTILER_KEY/);
  assert.match(dashboard, /Błąd kafelków MapTiler/);
  assert.match(dashboard, /injectJavaScript\('window\.setGpsPoint\('/);
  assert.doesNotMatch(dashboard, /<iframe id="gpsMapFrame"/);
  assert.doesNotMatch(dashboard, /key=\{Math\.round\(Number\(location\.latitude\)\*10000\)/);
});

test('live GPS map keeps its WebView mounted and updates map data without reloading HTML', async () => {
  const fs = await import('node:fs/promises');
  const dashboard = await fs.readFile(new URL('../LiveLocationDashboard.js', import.meta.url), 'utf8');
  assert.match(dashboard, /key="gps-live-map"/);
  assert.match(dashboard, /source=\{\{html:buildLiveMapHtml\(null,\[\],true\)/);
  assert.match(dashboard, /injectJavaScript\('window\.updateMapData\('/);
  assert.match(dashboard, /window\.updateMapData=function\(json\)/);
  assert.doesNotMatch(dashboard, /key=\{String\(location\.id\|\|location\.registration\)\+'_ '\+/);
});

test('GPS uploads have a finite timeout and always release the timeout timer', () => {
  const source = fs.readFileSync(new URL('../apiClient.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function apiPostGps(');
  const end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /new AbortController\(\)/);
  assert.match(block, /setTimeout\(/);
  assert.match(block, /12000/);
  assert.match(block, /controller\.abort\(\)/);
  assert.match(block, /Promise\.race\(\[request,timeout\]\)/);
  assert.match(block, /clearTimeout\(timeoutId\)/);
  assert.match(block, /GPS_API_TIMEOUT/);
});


test('web startup does not call native-only notification or background-task setup', async () => {
  const fs = await import('node:fs/promises');
  const indexSource = await fs.readFile(new URL('../index.js', import.meta.url), 'utf8');
  const locationSource = await fs.readFile(new URL('../LocationService.js', import.meta.url), 'utf8');
  assert.match(indexSource, /Platform\.OS\s*!==\s*['"]web['"][\s\S]*?Notifications\.setNotificationHandler/);
  assert.match(locationSource, /Platform\.OS\s*!==\s*['"]web['"][\s\S]*?TaskManager\.isTaskDefined/);
});


test('central API client prefixes every endpoint with the backend /api mount', () => {
  const client = fs.readFileSync(new URL('../apiClient.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.ok(client.includes("API_BASE_URL=API_ORIGIN ? API_ORIGIN+'/api' : ''"));
  assert.ok(client.includes("api('/auth/login'"));
  assert.ok(server.includes("app.post('/api/auth/login'"));
});


test('report alarm shift end is calculated from shift duration, not setMinutes overflow', () => {
  const localDate = new Date(2026, 9, 14, 0, 0, 0, 0);
  const morningStart = new Date(localDate);
  morningStart.setHours(6, 0, 0, 0);
  const morningEnd = new Date(getShiftEndEpoch(morningStart.getTime(), 6 * 60, 16 * 60));
  assert.equal(morningEnd.getTime() - morningStart.getTime(), 10 * 60 * 60 * 1000);
  assert.equal(morningEnd.getHours(), 16);

  const nightStart = new Date(localDate);
  nightStart.setHours(18, 0, 0, 0);
  const nightEnd = new Date(getShiftEndEpoch(nightStart.getTime(), 18 * 60, 6 * 60));
  assert.equal(nightEnd.getTime() - nightStart.getTime(), 12 * 60 * 60 * 1000);
  assert.equal(nightEnd.getDate(), localDate.getDate() + 1);
  assert.equal(nightEnd.getHours(), 6);
});

test('report alarm shift end rejects invalid minute values', () => {
  assert.throws(() => getShiftEndEpoch(Date.now(), -1, 60), RangeError);
  assert.throws(() => getShiftEndEpoch(Date.now(), 60, 1440), RangeError);
});


test('missing vehicle assignment pauses GPS without clearing the enabled intent', () => {
  assert.equal(missingAssignmentAction(true), 'pause-preserve-enabled');
  assert.equal(missingAssignmentAction(false), 'stay-disabled');
  assert.equal(missingAssignmentAction(undefined), 'stay-disabled');
});


test('GPS assignment lookup has a finite timeout and does not treat network errors as unassignment', () => {
  const source = fs.readFileSync(new URL('../LocationService.js', import.meta.url), 'utf8');
  const start = source.indexOf('const getDeviceAssignment=async token=>');
  const end = source.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /new AbortController\(\)/);
  assert.match(block, /setTimeout\(\(\)=>controller\.abort\(\),8000\)/);
  assert.match(block, /clearTimeout\(timeoutId\)/);
  assert.match(block, /GPS_ASSIGNMENT_NETWORK_ERROR/);
  assert.match(block, /GPS_ASSIGNMENT_TIMEOUT/);
  assert.match(block, /response\.status===401\|\|response\.status===404/);
});


test('GPS fleet and history endpoints restrict employee access to assigned vehicles', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  const fleetStart = server.indexOf("app.get('/api/gps/vehicles',auth");
  const fleetEnd = server.indexOf("\napp.get('/api/gps/:vehicleId/history'", fleetStart);
  assert.ok(fleetStart >= 0 && fleetEnd > fleetStart);
  const fleetRoute = server.slice(fleetStart, fleetEnd);
  assert.match(fleetRoute, /req\.user\.role==='admin'\|\|req\.user\.role==='locator'/);
  assert.match(fleetRoute, /WHERE a\.user_id=\$1 AND a\.active=true/);

  const historyStart = server.indexOf("app.get('/api/gps/:vehicleId/history',auth");
  const historyEnd = server.indexOf("\napp.get('/api/schedules/:weekId'", historyStart);
  assert.ok(historyStart >= 0 && historyEnd > historyStart);
  const historyRoute = server.slice(historyStart, historyEnd);
  assert.match(historyRoute, /GPS_VEHICLE_FORBIDDEN/);
  assert.match(historyRoute, /a\.user_id=\$1 AND a\.vehicle_id=\$2 AND a\.active=true/);
});


test('fleet inventory and assignment endpoints require administrator authorization', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.ok(server.includes("app.get('/api/vehicles',auth,admin,async("));
  assert.ok(server.includes("app.get('/api/assignments',auth,admin,async("));
});


test('implausible GPS speeds are normalized before display and API persistence', () => {
  assert.equal(gpsLifecycle.normalizeGpsSpeedMps(0), 0);
  assert.equal(gpsLifecycle.normalizeGpsSpeedMps(12.5), 12.5);
  assert.equal(gpsLifecycle.normalizeGpsSpeedMps(96.1), 0);
  assert.equal(gpsLifecycle.normalizeGpsSpeedMps(-1), 0);
  const dashboard = fs.readFileSync(new URL('../LiveLocationDashboard.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.ok(dashboard.includes('normalizeGpsSpeedMps(selectedPoint.speed,MAX_PLAUSIBLE_SPEED_MPS)'));
  assert.ok(server.includes('rawSpeed>=0&&rawSpeed<=55?rawSpeed:null'));
});


test('offline GPS queue is durable-ready, deduplicated, ordered, bounded, and expires old samples', () => {
  const now = Date.UTC(2026, 9, 14, 12, 0, 0);
  const old = {sampleId:'old',observedAt:now-8*24*60*60*1000,latitude:51,longitude:16};
  const later = {sampleId:'later',observedAt:now-1000,latitude:51.1,longitude:16.1};
  const earlier = {sampleId:'earlier',observedAt:now-2000,latitude:51.2,longitude:16.2};
  const result = gpsLifecycle.mergePendingGpsPoints([old,later],[later,earlier],now,10,7*24*60*60*1000);
  assert.deepEqual(result.map(x=>x.sampleId),['earlier','later']);
  assert.equal(gpsLifecycle.mergePendingGpsPoints([],Array.from({length:4},(_,i)=>({sampleId:String(i),observedAt:now-i,latitude:51,longitude:16})),now,2).length,2);
  assert.equal(gpsLifecycle.mergePendingGpsPoints([], [{sampleId:'bad',observedAt:now+10*60*1000,latitude:51,longitude:16}], now).length,0);
});

test('GPS history uploads are idempotent and the pending queue is persisted before upload', () => {
  const service = fs.readFileSync(new URL('../LocationService.js', import.meta.url), 'utf8');
  const schema = fs.readFileSync(new URL('../../backend/schema.sql', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.ok(service.indexOf('await writePendingGpsQueue(queue);') < service.indexOf('await flushPendingGpsQueue(deviceToken,cfg);'));
  assert.ok(service.includes('LOCATION_PENDING_QUEUE_KEY'));
  assert.ok(schema.includes('gps_history_sample_id_idx'));
  assert.ok(server.includes('ON CONFLICT (vehicle_id,sample_id) WHERE sample_id IS NOT NULL DO NOTHING'));
  assert.ok(service.includes("Number(previous?.observedAt||0)>Number(payload.observedAt||0)"));
});


test('offline GPS samples cannot be assigned to a different vehicle after a reassignment', () => {
  const service = fs.readFileSync(new URL('../LocationService.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.ok(service.includes('assignedVehicleId:cfg.assignedVehicleServerId||null'));
  assert.ok(service.includes("String(lastError?.message||lastError)==='GPS_ASSIGNMENT_CHANGED'"));
  assert.ok(server.includes("if(b.assignedVehicleId&&String(b.assignedVehicleId)!==String(v.id))return res.status(409).json({error:'GPS_ASSIGNMENT_CHANGED'})"));
  assert.ok(server.includes('ON CONFLICT (vehicle_id,sample_id) WHERE sample_id IS NOT NULL DO NOTHING'));
});


test('proposal approval and rejection are performed by atomic central API transactions', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.ok(server.includes("app.post('/api/proposals/:proposalId/approve',auth,admin,async"));
  assert.ok(server.includes("app.post('/api/proposals/:proposalId/reject',auth,admin,async"));
  assert.ok(server.includes("SELECT payload,revision FROM documents WHERE collection_name='proposals' AND doc_id=$1 FOR UPDATE"));
  assert.ok(server.includes("SELECT payload,revision FROM documents WHERE collection_name='schedules' AND doc_id=$1 FOR UPDATE"));
  assert.ok(server.includes("await client.query('COMMIT')"));
  assert.ok(app.includes("api('/proposals/'+encodeURIComponent(proposal.id)+'/approve'"));
  assert.ok(app.includes("api('/proposals/'+encodeURIComponent(id)+'/reject'"));
});


test('initial admin bootstrap is private, environment-gated, and never overrides an existing administrator', () => {
  const server = fs.readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  assert.ok(server.includes('async function bootstrapAdminFromEnvironment()'));
  assert.ok(server.includes('ADMIN_BOOTSTRAP_EMAIL'));
  assert.ok(server.includes('ADMIN_BOOTSTRAP_PASSWORD'));
  assert.ok(server.includes("SELECT id FROM users WHERE role='admin' LIMIT 1"));
  assert.ok(server.includes('await bootstrapAdminFromEnvironment();'));
  assert.ok(!server.includes("const role=Number(count.rows[0].n)===0?'admin':'employee'"));
  const bootstrapStart=server.indexOf('async function bootstrapAdminFromEnvironment()');
  const bootstrapEnd=server.indexOf('async function cleanupGpsHistory()',bootstrapStart);
  const bootstrap=server.slice(bootstrapStart,bootstrapEnd);
  assert.match(bootstrap,/SELECT id,password_hash,disabled FROM users WHERE lower\(email\)=lower\(\$1\)/);
  assert.match(bootstrap,/verifyPassword\(password,existingUser\.rows\[0\]\.password_hash\)/);
  assert.match(bootstrap,/ADMIN_BOOTSTRAP_EXISTING_ACCOUNT_MISMATCH/);
  assert.doesNotMatch(bootstrap,/SET role='admin',person_key='',disabled=false,password_hash=/);
});

test('login errors distinguish invalid credentials from server and network failures', () => {
  const app = fs.readFileSync(new URL('../AppRuntime.js', import.meta.url), 'utf8');
  assert.ok(app.includes('Nieprawidłowy e-mail/hasło albo konto jest wyłączone.'));
  assert.ok(app.includes('Centralny serwer zgłosił błąd.'));
  assert.ok(app.includes('Nie można połączyć się z centralnym serwerem.'));
});

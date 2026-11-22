import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrips, distanceMeters } from './tripHistory.js';

const point = (id, at, latitude, longitude, speed = 10) => ({
  id, observed_at: new Date(at).toISOString(), latitude, longitude,
  accuracy: 5, altitude: 100, speed, heading: 90, received_at: new Date(at).toISOString()
});

test('buildTrips separates independent trips after a long GPS gap', () => {
  const rows = [
    point(1, '2026-10-17T08:00:00Z', 51.0, 17.0),
    point(2, '2026-10-17T08:00:10Z', 51.0006, 17.0006),
    point(3, '2026-10-17T09:00:00Z', 51.1, 17.1),
    point(4, '2026-10-17T09:00:10Z', 51.1006, 17.1006)
  ];
  const trips = buildTrips(rows, { vehicleId: 'vehicle-1', includePoints: true });
  assert.equal(trips.length, 2);
  assert.equal(trips[0].id, 'trip-3');
  assert.equal(trips[1].id, 'trip-1');
  assert.equal(trips[0].pointCount, 2);
  assert.equal(trips[0].points[0].speedKmh, 36);
});

test('buildTrips calculates duration, distance and speed statistics', () => {
  const rows = [
    point(10, '2026-10-17T08:00:00Z', 51.0, 17.0, 10),
    point(11, '2026-10-17T08:00:10Z', 51.0006, 17.0006, 12)
  ];
  const [trip] = buildTrips(rows, { vehicleId: 'v' });
  assert.equal(trip.durationSeconds, 10);
  assert.ok(trip.distanceKm > 0);
  assert.ok(trip.maxSpeedKmh >= trip.averageSpeedKmh);
  assert.ok(trip.maxSpeedKmh > 0);
  assert.equal(trip.pointCount, 2);
});

test('invalid rows are ignored and duplicate ordering remains stable', () => {
  const rows = [
    point(2, '2026-10-17T08:00:10Z', 51.0006, 17.0006),
    point(1, '2026-10-17T08:00:00Z', 51.0, 17.0),
    { id: 3, observed_at: 'invalid', latitude: 0, longitude: 0 }
  ];
  const trips = buildTrips(rows);
  assert.equal(trips.length, 1);
  assert.deepEqual(trips[0].points, undefined);
  assert.equal(trips[0].id, 'trip-1');
});

test('distance is zero for identical coordinates', () => {
  assert.equal(distanceMeters({ latitude: 51, longitude: 17 }, { latitude: 51, longitude: 17 }), 0);
});

test('buildTrips closes a trip after a prolonged stationary stop', () => {
  const rows = [
    point(20, '2026-10-17T08:00:00Z', 51.0, 17.0, 10),
    point(21, '2026-10-17T08:00:10Z', 51.0006, 17.0006, 10),
    point(22, '2026-10-17T08:05:00Z', 51.0001, 17.0001, 0),
    point(23, '2026-10-17T08:10:00Z', 51.0001, 17.0001, 0),
    point(24, '2026-10-17T08:15:00Z', 51.0001, 17.0001, 0),
    point(25, '2026-10-17T08:16:00Z', 51.0001, 17.0001, 10),
    point(26, '2026-10-17T08:16:10Z', 51.0016, 17.0016, 10)
  ];
  const trips = buildTrips(rows);
  assert.equal(trips.length, 2);
  assert.equal(trips[0].id, 'trip-25');
  assert.equal(trips[1].id, 'trip-20');
});

test('buildTrips handles newest-first database results without losing chronology', () => {
  const newestFirst = [
    point(4, '2026-10-17T09:00:10Z', 51.1006, 17.1006),
    point(3, '2026-10-17T09:00:00Z', 51.1, 17.1),
    point(2, '2026-10-17T08:00:10Z', 51.0006, 17.0006),
    point(1, '2026-10-17T08:00:00Z', 51.0, 17.0)
  ];
  const trips = buildTrips(newestFirst, { includePoints: true });
  assert.equal(trips.length, 2);
  assert.equal(trips[0].id, 'trip-3');
  assert.equal(trips[0].points[0].id, '3');
  assert.equal(trips[0].points[1].id, '4');
  assert.equal(trips[1].id, 'trip-1');
});

test('buildTrips includes a stop that continues through the last GPS sample', () => {
  const rows = [
    point(30, '2026-10-17T08:00:00Z', 51.0, 17.0, 10),
    point(31, '2026-10-17T08:00:10Z', 51.0006, 17.0006, 10),
    point(32, '2026-10-17T08:01:00Z', 51.0001, 17.0001, 0),
    point(33, '2026-10-17T08:02:00Z', 51.0001, 17.0001, 0),
    point(34, '2026-10-17T08:03:00Z', 51.0001, 17.0001, 0)
  ];
  const [trip] = buildTrips(rows);
  assert.equal(trip.stops.length, 1);
  assert.equal(trip.stops[0].durationSeconds, 120);
  assert.equal(trip.stops[0].endedAt, '2026-10-17T08:03:00.000Z');
});
test('stationary indoor GPS jitter does not create trips or distance', () => {
  const rows = [
    {...point(101,'2026-10-17T08:00:00Z',51.0,17.0,0),accuracy:24},
    {...point(102,'2026-10-17T08:00:10Z',51.00015,17.00012,0),accuracy:28},
    {...point(103,'2026-10-17T08:00:20Z',50.99992,17.00018,0),accuracy:31},
    {...point(104,'2026-10-17T08:00:30Z',51.0002,16.9999,0),accuracy:26},
    {...point(105,'2026-10-17T08:00:40Z',51.00005,17.00025,0),accuracy:29}
  ];
  assert.deepEqual(buildTrips(rows,{includePoints:true}),[]);
});

test('poor-accuracy GPS fixes are excluded even if coordinates jump', () => {
  const rows = [
    {...point(201,'2026-10-17T08:00:00Z',51.0,17.0,15),accuracy:80},
    {...point(202,'2026-10-17T08:00:10Z',51.001,17.001,15),accuracy:90},
    {...point(203,'2026-10-17T08:00:20Z',51.002,17.002,15),accuracy:75}
  ];
  assert.deepEqual(buildTrips(rows),[]);
});

test('trip detail returns the complete ordered route, not a single point', () => {
  const rows = [
    point(301,'2026-10-17T08:00:00Z',51.0,17.0,10),
    point(302,'2026-10-17T08:00:10Z',51.0006,17.0006,10),
    point(303,'2026-10-17T08:00:20Z',51.0012,17.0012,10)
  ];
  const [trip] = buildTrips(rows,{includePoints:true});
  assert.equal(trip.points.length,3);
  assert.equal(trip.routePoints.length,3);
  assert.equal(trip.points[0].id,'301');
  assert.equal(trip.points[2].id,'303');
  assert.ok(trip.distanceKm>0);
});

test('stationary zig-zag GPS jitter with low false speed does not create a trip', () => {
  const rows = [
    {...point(401,'2026-10-17T08:00:00Z',51.0,17.0,2),accuracy:5},
    {...point(402,'2026-10-17T08:00:10Z',51.0004,17.0,2),accuracy:5},
    {...point(403,'2026-10-17T08:00:20Z',51.0,17.0,2),accuracy:5},
    {...point(404,'2026-10-17T08:00:30Z',51.0004,17.0,2),accuracy:5}
  ];
  assert.deepEqual(buildTrips(rows),[]);
});

test('single false indoor speed spike does not create a trip', () => {
  const rows = [
    {...point(501,'2026-10-17T08:00:00Z',50.85782,16.49089,15/3.6),accuracy:16},
    {...point(502,'2026-10-17T08:00:13Z',50.85782,16.49087,0),accuracy:37},
    {...point(503,'2026-10-17T08:00:23Z',50.85785,16.49089,0),accuracy:19},
    {...point(504,'2026-10-17T08:00:33Z',50.85784,16.49090,1/3.6),accuracy:19}
  ];
  assert.deepEqual(buildTrips(rows,{includePoints:true}),[]);
});

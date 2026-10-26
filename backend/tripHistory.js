const TRIP_GAP_MS = 30 * 60 * 1000;
const MAX_SEGMENT_GAP_MS = 2 * 60 * 1000;
const MAX_INFERENCE_GAP_MS = 5 * 60 * 1000;
const MIN_MOVING_SPEED_KMH = 5;
const MAX_PLAUSIBLE_SPEED_MPS = 55;
const MAX_ROUTE_ACCURACY_METERS = 100;

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

function inferredMovement(previous, row) {
  if (!previous) return false;
  const previousTime = asMillis(previous.observed_at), rowTime = asMillis(row.observed_at);
  const dtMs = rowTime - previousTime;
  if (!(dtMs > 0) || dtMs > MAX_INFERENCE_GAP_MS) return false;
  const accuracyA = numeric(previous.accuracy), accuracyB = numeric(row.accuracy);
  if ((accuracyA != null && accuracyA > MAX_ROUTE_ACCURACY_METERS)
    || (accuracyB != null && accuracyB > MAX_ROUTE_ACCURACY_METERS)) return false;
  const distance = distanceMeters(previous, row);
  const seconds = dtMs / 1000;
  const impliedSpeed = distance / seconds;
  // Require a meaningful displacement and plausible speed to avoid treating GPS drift as driving.
  return distance >= Math.max(25, seconds * (MIN_MOVING_SPEED_KMH / 3.6))
    && impliedSpeed <= MAX_PLAUSIBLE_SPEED_MPS;
}

function isMoving(row, previous) {
  const measured = speedKmh(row.speed);
  return (measured != null && measured >= MIN_MOVING_SPEED_KMH)
    || inferredMovement(previous, row);
}

function summarizeTrip(rows, vehicleId, includePoints) {
  const points = rows.map(pointView);
  const first = points[0], last = points[points.length - 1];
  const startMs = asMillis(first.observedAt), endMs = asMillis(last.observedAt);
  let distance = 0, drivingMs = 0, maxSpeed = 0, speedSum = 0, speedCount = 0;
  const stops = [];
  let stopStart = null, previous = null;

  for (const point of points) {
    if (point.speedKmh != null) {
      maxSpeed = Math.max(maxSpeed, point.speedKmh);
      if (point.speedKmh >= MIN_MOVING_SPEED_KMH) {
        speedSum += point.speedKmh;
        speedCount++;
      }
    }
    if (previous) {
      const a = asMillis(previous.observedAt), b = asMillis(point.observedAt);
      const dt = b - a;
      const segmentDistance = distanceMeters(previous, point);
      const accuracyOk = (previous.accuracy == null || previous.accuracy <= MAX_ROUTE_ACCURACY_METERS)
        && (point.accuracy == null || point.accuracy <= MAX_ROUTE_ACCURACY_METERS);
      // Never estimate distance across telemetry gaps or implausible jumps.
      if (dt > 0 && dt <= MAX_SEGMENT_GAP_MS && segmentDistance <= 2000 && accuracyOk) {
        distance += segmentDistance;
        if ((previous.speedKmh ?? 0) >= MIN_MOVING_SPEED_KMH || (point.speedKmh ?? 0) >= MIN_MOVING_SPEED_KMH
          || segmentDistance / (dt / 1000) >= MIN_MOVING_SPEED_KMH / 3.6) {
          drivingMs += dt;
        }
      }
      const stopped = point.speedKmh != null && point.speedKmh < 3;
      if (stopped && stopStart == null) stopStart = point.observedAt;
      if (!stopped && stopStart != null) {
        const stopEnd = asMillis(previous.observedAt);
        const stopBegin = asMillis(stopStart);
        if (stopEnd != null && stopBegin != null && stopEnd - stopBegin >= 120000) {
          stops.push({ startedAt: stopStart, endedAt: previous.observedAt, durationSeconds: Math.round((stopEnd - stopBegin) / 1000), latitude: previous.latitude, longitude: previous.longitude });
        }
        stopStart = null;
      }
    }
    previous = point;
  }

  if (stopStart != null && last) {
    const stopBegin = asMillis(stopStart);
    if (stopBegin != null && endMs - stopBegin >= 120000) {
      stops.push({ startedAt: stopStart, endedAt: last.observedAt, durationSeconds: Math.round((endMs - stopBegin) / 1000), latitude: last.latitude, longitude: last.longitude });
    }
  }

  const elapsedSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const drivingSeconds = Math.min(elapsedSeconds, Math.round(drivingMs / 1000));
  const distanceKm = distance / 1000;
  const movingAverage = drivingSeconds > 0 ? distanceKm / (drivingSeconds / 3600) : (speedCount ? speedSum / speedCount : 0);
  const wholeAverage = elapsedSeconds > 0 ? distanceKm / (elapsedSeconds / 3600) : 0;
  const trip = {
    id: `trip-${first.id}`,
    vehicleId,
    startedAt: first.observedAt,
    endedAt: last.observedAt,
    start: { latitude: first.latitude, longitude: first.longitude },
    end: { latitude: last.latitude, longitude: last.longitude },
    pointCount: points.length,
    distanceKm: Number(distanceKm.toFixed(2)),
    durationSeconds: elapsedSeconds,
    drivingSeconds,
    stopSeconds: Math.max(0, elapsedSeconds - drivingSeconds),
    averageSpeedKmh: Number(movingAverage.toFixed(1)),
    averageIncludingStopsKmh: Number(wholeAverage.toFixed(1)),
    maxSpeedKmh: Number(maxSpeed.toFixed(1)),
    stops
  };
  if (includePoints) trip.points = points;
  return trip;
}

/**
 * Derive selectable trips from retained GPS samples without changing GPS collection,
 * transmission, authentication, or background-location services.
 *
 * A trip closes after a telemetry gap or a prolonged stop. If the device reports
 * no speed, plausible displacement can still establish movement. Distances and map
 * lines remain segmented across long gaps so missing data is never invented.
 */
export function buildTrips(rows, { vehicleId = '', includePoints = false, gapMs = TRIP_GAP_MS, stationarySplitMs = 8 * 60 * 1000 } = {}) {
  const valid = (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.id != null && asMillis(row.observed_at) != null
      && numeric(row.latitude) != null && numeric(row.longitude) != null
      && Number(row.latitude) >= -90 && Number(row.latitude) <= 90
      && Number(row.longitude) >= -180 && Number(row.longitude) <= 180)
    .slice()
    .sort((a, b) => asMillis(a.observed_at) - asMillis(b.observed_at) || Number(a.id) - Number(b.id));

  const groups = [];
  let current = [], stationary = [], previous = null;
  const addUnique = (target, row) => {
    if (!target.length || String(target[target.length - 1].id) !== String(row.id)) target.push(row);
  };
  const flush = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
    stationary = [];
  };
  const stationaryDuration = () => stationary.length < 2 ? 0
    : asMillis(stationary[stationary.length - 1].observed_at) - asMillis(stationary[0].observed_at);

  for (const row of valid) {
    const previousTime = previous ? asMillis(previous.observed_at) : null;
    const rowTime = asMillis(row.observed_at);
    const gap = previousTime == null ? 0 : rowTime - previousTime;

    if (previous && gap > gapMs) {
      if (current.length && stationary.length && stationaryDuration() < stationarySplitMs) current.push(...stationary);
      flush();
      // Start a fresh candidate at the first sample after the gap.
      previous = row;
      continue;
    }

    const moving = isMoving(row, previous);
    if (moving) {
      if (stationary.length) {
        if (stationaryDuration() >= stationarySplitMs) {
          if (current.length) {
            addUnique(current, stationary[0]);
            flush();
          }
          // A long stop separates trips; do not draw a line across it.
          current = [stationary[stationary.length - 1]];
        } else {
          stationary.forEach(point => addUnique(current, point));
        }
        stationary = [];
      }
      if (!current.length && previous && gap > 0 && gap <= MAX_INFERENCE_GAP_MS\n        && (speedKmh(previous.speed) == null || speedKmh(previous.speed) >= 3)) addUnique(current, previous);
      addUnique(current, row);
    } else if (current.length) {
      addUnique(stationary, row);
      if (stationaryDuration() >= stationarySplitMs) {
        addUnique(current, stationary[0]);
        flush();
      }
    }
    previous = row;
  }

  if (current.length && stationary.length && stationaryDuration() < stationarySplitMs) {
    stationary.forEach(point => addUnique(current, point));
  }
  if (current.length >= 2) groups.push(current);

  return groups
    .filter(group => group.length >= 2)
    .map(group => summarizeTrip(group, vehicleId, includePoints))
    .reverse();
}

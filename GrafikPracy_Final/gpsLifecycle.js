function mergePendingGpsPoints(existing, incoming, now = Date.now(), maxItems = 1000, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const minimumObservedAt = now - maxAgeMs;
  const byId = new Map();
  for (const item of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (!item || typeof item !== 'object') continue;
    const sampleId = String(item.sampleId || '').trim();
    const observedAt = Number(item.observedAt);
    const latitude = Number(item.latitude), longitude = Number(item.longitude);
    if (!sampleId || !Number.isFinite(observedAt) || observedAt < minimumObservedAt || observedAt > now + 5 * 60 * 1000) continue;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    byId.set(sampleId, {...item, sampleId, observedAt, latitude, longitude});
  }
  return [...byId.values()].sort((a, b) => a.observedAt - b.observedAt).slice(-Math.max(1, Math.trunc(maxItems)));
}

function normalizeGpsSpeedMps(value, maxSpeedMps = 55) {
  const speed = Number(value);
  return Number.isFinite(speed) && speed >= 0 && speed <= maxSpeedMps ? speed : 0;
}

function missingAssignmentAction(isTrackingEnabled) {
  return isTrackingEnabled === true ? 'pause-preserve-enabled' : 'stay-disabled';
}

module.exports = {missingAssignmentAction, normalizeGpsSpeedMps, mergePendingGpsPoints};

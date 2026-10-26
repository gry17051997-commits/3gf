import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreTrip, countTripGaps, MAX_GAP_MS, MAX_JUMP_M} from '../tripHistoryScore.js';

const p=(id,ms,latitude=51,longitude=17)=>({id,observedAt:new Date(ms).toISOString(),latitude,longitude});
test('score clamps the result and rounds to one decimal place',()=>{
  assert.equal(scoreTrip({maxSpeedKmh:0,pointCount:100,distanceKm:0,averageSpeedKmh:0}),8);
  assert.ok(scoreTrip({maxSpeedKmh:1000,pointCount:0,distanceKm:0})>=1);
  assert.ok(scoreTrip({pointCount:100,distanceKm:100,averageSpeedKmh:60})<=10);
  assert.equal(scoreTrip({pointCount:100,distanceKm:3,averageSpeedKmh:60}),8.5);
});
test('score penalizes extreme maximum speeds and too few points',()=>{
  assert.equal(scoreTrip({maxSpeedKmh:141,pointCount:5,distanceKm:0}),6.5);
  assert.equal(scoreTrip({maxSpeedKmh:161,pointCount:5,distanceKm:0}),5.5);
  assert.equal(scoreTrip({maxSpeedKmh:0,pointCount:4,distanceKm:0}),7);
});
test('gap detection uses 120 seconds and 2000 metres thresholds',()=>{
  const start=Date.parse('2026-10-26T08:00:00Z');
  assert.equal(countTripGaps([p(1,start),p(2,start+MAX_GAP_MS)]),0);
  assert.equal(countTripGaps([p(1,start),p(2,start+MAX_GAP_MS+1)]),1);
  assert.equal(countTripGaps([p(1,start,51,17),p(2,start+10000,51.03,17)]),1);
  assert.equal(MAX_JUMP_M,2000);
});
test('gap penalties are capped at two points',()=>{
  const start=Date.parse('2026-10-26T08:00:00Z');
  const points=Array.from({length:8},(_,i)=>p(i,start+i*300000,51,17));
  const score=scoreTrip({points,pointCount:8,maxSpeedKmh:0,distanceKm:0});
  assert.equal(score,6);
});

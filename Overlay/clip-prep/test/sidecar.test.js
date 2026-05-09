import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSidecar, computeGameDurations, pickDominantGame } from '../src/sidecar.js';

test('parseSidecar returns null for invalid JSON', () => {
  assert.equal(parseSidecar('not json'), null);
});

test('parseSidecar accepts a valid sidecar', () => {
  const json = JSON.stringify({
    started_at: '2026-05-07T14:00:00Z',
    stopped_at: '2026-05-07T15:00:00Z',
    events: [
      { wall: '2026-05-07T14:00:00Z', rec: '00:00:00', exe: 'VALORANT-Win64-Shipping' },
    ],
  });
  const sc = parseSidecar(json);
  assert.equal(sc.events.length, 1);
  assert.equal(sc.events[0].exe, 'VALORANT-Win64-Shipping');
});

test('computeGameDurations: single game owns full duration', () => {
  const sc = {
    started_at: '2026-05-07T14:00:00Z',
    stopped_at: '2026-05-07T15:00:00Z',
    events: [
      { wall: '2026-05-07T14:00:00Z', exe: 'VALORANT-Win64-Shipping' },
    ],
  };
  const durations = computeGameDurations(sc);
  assert.equal(durations.get('VALORANT-Win64-Shipping'), 3600);
});

test('computeGameDurations: split between two games', () => {
  const sc = {
    started_at: '2026-05-07T14:00:00Z',
    stopped_at: '2026-05-07T15:00:00Z',
    events: [
      { wall: '2026-05-07T14:00:00Z', exe: 'VALORANT-Win64-Shipping' },
      { wall: '2026-05-07T14:45:00Z', exe: 'GTA5' },
    ],
  };
  const durations = computeGameDurations(sc);
  assert.equal(durations.get('VALORANT-Win64-Shipping'), 2700);
  assert.equal(durations.get('GTA5'), 900);
});

test('computeGameDurations: idle (exe=null) periods do not count toward any game', () => {
  const sc = {
    started_at: '2026-05-07T14:00:00Z',
    stopped_at: '2026-05-07T15:00:00Z',
    events: [
      { wall: '2026-05-07T14:00:00Z', exe: 'VALORANT-Win64-Shipping' },
      { wall: '2026-05-07T14:30:00Z', exe: null },
      { wall: '2026-05-07T14:45:00Z', exe: 'GTA5' },
    ],
  };
  const durations = computeGameDurations(sc);
  assert.equal(durations.get('VALORANT-Win64-Shipping'), 1800);
  assert.equal(durations.get('GTA5'), 900);
  assert.equal(durations.has(null), false);
});

test('pickDominantGame: one game above threshold returns that game', () => {
  const durations = new Map([
    ['VALORANT-Win64-Shipping', 2700],
    ['GTA5', 300],
  ]);
  const result = pickDominantGame(durations, 0.80);
  assert.equal(result.dominant, 'VALORANT-Win64-Shipping');
  assert.equal(result.isMix, false);
});

test('pickDominantGame: no game above threshold => mix', () => {
  const durations = new Map([
    ['VALORANT-Win64-Shipping', 1800],
    ['GTA5', 1800],
  ]);
  const result = pickDominantGame(durations, 0.80);
  assert.equal(result.dominant, null);
  assert.equal(result.isMix, true);
  assert.deepEqual(result.games.sort(), ['GTA5', 'VALORANT-Win64-Shipping']);
});

test('pickDominantGame: empty durations => no recording', () => {
  const result = pickDominantGame(new Map(), 0.80);
  assert.equal(result.dominant, null);
  assert.equal(result.isMix, false);
  assert.deepEqual(result.games, []);
});

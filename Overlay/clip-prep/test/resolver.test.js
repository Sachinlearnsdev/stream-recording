import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGameFolder, cleanExeName } from '../src/resolver.js';

const games = {
  'VALORANT-Win64-Shipping': 'Valorant',
  'GTA5': {
    default: 'GTA 5',
    if_running: [{ process: 'FiveM.exe', name: 'GTA 5 RP' }],
  },
};

test('resolveGameFolder: known string mapping', () => {
  assert.equal(
    resolveGameFolder('VALORANT-Win64-Shipping', games, new Set()),
    'Valorant'
  );
});

test('resolveGameFolder: case-insensitive lookup falls back to a different-case key', () => {
  assert.equal(
    resolveGameFolder('valorant-win64-shipping', games, new Set()),
    'Valorant'
  );
  assert.equal(
    resolveGameFolder('GTA5', games, new Set(['fivem.exe'])),
    'GTA 5 RP'
  );
});

test('resolveGameFolder: object mapping with no rule match returns default', () => {
  assert.equal(
    resolveGameFolder('GTA5', games, new Set(['notepad.exe'])),
    'GTA 5'
  );
});

test('resolveGameFolder: if_running rule matches => returns rule name', () => {
  assert.equal(
    resolveGameFolder('GTA5', games, new Set(['FiveM.exe', 'chrome.exe'])),
    'GTA 5 RP'
  );
});

test('resolveGameFolder: process name match is case-insensitive', () => {
  assert.equal(
    resolveGameFolder('GTA5', games, new Set(['fivem.exe'])),
    'GTA 5 RP'
  );
});

test('resolveGameFolder: unknown exe falls back to cleaned name', () => {
  assert.equal(
    resolveGameFolder('SomeRandomGame.exe', games, new Set()),
    'SomeRandomGame'
  );
});

test('cleanExeName: strips .exe suffix', () => {
  assert.equal(cleanExeName('Foo.exe'), 'Foo');
});

test('cleanExeName: strips common suffixes', () => {
  assert.equal(cleanExeName('VALORANT-Win64-Shipping'), 'VALORANT');
  assert.equal(cleanExeName('Game_x64'), 'Game');
  assert.equal(cleanExeName('Game-Shipping'), 'Game');
});

test('cleanExeName: preserves unknown shapes', () => {
  assert.equal(cleanExeName('MyGame'), 'MyGame');
});

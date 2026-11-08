import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromDraft, upsertEntry, patchEntry, dropEntry } from '../src/lib/draft-documents.ts';

test('restoration preserves document identity and original traveler index', () => {
  const documents = [
    { id: 'passport-b', requirementId: 'passport', fileName: 'synthetic-b.pdf' },
    { id: 'sponsor', requirementId: 'residence' },
  ];
  const restored = entriesFromDraft(documents, { 'passport-b': '1' });
  assert.equal(restored['passport::1'][0].serverId, 'passport-b');
  assert.equal(restored['passport::0'], undefined);
  assert.equal(restored.residence[0].serverId, 'sponsor');
  assert.equal(restored['passport::1'][0].file, undefined);
});

test('retry updates the existing entry rather than creating a second document', () => {
  const original = { localId: 'pending', name: 'synthetic.pdf', status: 'error', progress: 20 };
  const state = upsertEntry({}, 'passport::0', original);
  const retry = upsertEntry(state, 'passport::0', { ...original, status: 'uploading' });
  const saved = patchEntry(retry, 'passport::0', 'pending', { serverId: 'stored', status: 'uploaded', progress: 100 });
  assert.equal(saved['passport::0'].length, 1);
  assert.equal(saved['passport::0'][0].serverId, 'stored');
  assert.equal(state['passport::0'][0].status, 'error');
});

test('removal keeps documents belonging to other pilgrims', () => {
  const restored = entriesFromDraft([
    { id: 'a', requirementId: 'passport' }, { id: 'b', requirementId: 'passport' },
  ], { a: '0', b: '1' });
  const removed = dropEntry(restored, 'passport::0', 'a');
  assert.equal(removed['passport::0'], undefined);
  assert.equal(removed['passport::1'][0].serverId, 'b');
  assert.equal(restored['passport::0'][0].serverId, 'a');
});

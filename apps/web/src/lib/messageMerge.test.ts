import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMessages } from './messageMerge';

test('appends a new message in createdAt order', () => {
  const existing = [{ id: 'a', createdAt: '2026-06-19T10:00:00Z' }];
  const incoming = { id: 'b', createdAt: '2026-06-19T10:01:00Z' };
  const result = mergeMessages(existing, incoming);
  assert.deepEqual(result.map((m) => m.id), ['a', 'b']);
});

test('dedupes by id (no duplicate)', () => {
  const existing = [{ id: 'a', createdAt: '2026-06-19T10:00:00Z' }];
  const incoming = { id: 'a', createdAt: '2026-06-19T10:00:00Z' };
  const result = mergeMessages(existing, incoming);
  assert.equal(result.length, 1);
});

test('inserts out-of-order message at correct position', () => {
  const existing = [
    { id: 'a', createdAt: '2026-06-19T10:00:00Z' },
    { id: 'c', createdAt: '2026-06-19T10:02:00Z' },
  ];
  const incoming = { id: 'b', createdAt: '2026-06-19T10:01:00Z' };
  const result = mergeMessages(existing, incoming);
  assert.deepEqual(result.map((m) => m.id), ['a', 'b', 'c']);
});

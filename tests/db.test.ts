import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as store from '../src/db';

describe('db', () => {
  it('stores and lists a month newest first', async () => {
    await store.saveTx({ id: 'a', amount: 100, type: 'expense', categoryId: 'food', note: '', date: '2026-10-02', createdAt: 1 });
    await store.saveTx({ id: 'b', amount: 200, type: 'expense', categoryId: 'food', note: '', date: '2026-10-31', createdAt: 2 });
    await store.saveTx({ id: 'c', amount: 300, type: 'expense', categoryId: 'food', note: '', date: '2026-11-01', createdAt: 3 });
    expect((await store.listMonth('2026-10')).map((t) => t.id)).toEqual(['b', 'a']);
    await store.deleteTx('b');
    expect((await store.listMonth('2026-10')).map((t) => t.id)).toEqual(['a']);
  });

  it('seeds default categories and keeps settings', async () => {
    expect((await store.listCategories()).length).toBeGreaterThan(5);
    await store.setSetting('currency', '€');
    expect(await store.getSetting('currency', '$')).toBe('€');
  });
});

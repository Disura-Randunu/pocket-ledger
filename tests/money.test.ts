import { describe, expect, it } from 'vitest';
import { ADJUST, balances, CARRY, DEFAULT_ACCOUNTS, formatCents, parseBalance, parseCents, shiftMonth, summarize, toCSV, validateBackup, DEFAULT_CATEGORIES, type Tx } from '../src/money';

const tx = (p: Partial<Tx>): Tx => ({ id: 'x', amount: 100, type: 'expense', categoryId: 'food', note: '', date: '2026-10-01', createdAt: 0, ...p });

describe('money', () => {
  it('parses amounts to cents', () => {
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('1,234.56')).toBe(123456);
    expect(parseCents('0.1')).toBe(10);
    expect(parseCents('0')).toBeNull();
    expect(parseCents('1.234')).toBeNull();
    expect(parseCents('abc')).toBeNull();
  });

  it('formats cents', () => {
    expect(formatCents(123456, '$')).toBe('$1,234.56');
    expect(formatCents(-5, 'Rs ')).toBe('-Rs 0.05');
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('summarizes a month', () => {
    const s = summarize([
      tx({ id: '1', amount: 300, categoryId: 'food' }),
      tx({ id: '2', amount: 100, categoryId: 'fun' }),
      tx({ id: '3', amount: 1000, type: 'income', categoryId: 'salary' }),
    ]);
    expect(s).toMatchObject({ spent: 400, income: 1000, carried: 0, net: 600 });
    expect(s.byCategory[0]).toEqual({ categoryId: 'food', total: 300, share: 0.75 });
  });

  it('counts carried balances toward net only', () => {
    const s = summarize([
      tx({ id: '1', amount: 300, categoryId: 'food' }),
      tx({ id: '2', amount: 500, type: 'income', categoryId: CARRY }),
      tx({ id: '3', amount: 50, type: 'expense', categoryId: CARRY }),
    ]);
    expect(s).toMatchObject({ spent: 300, income: 0, carried: 450, net: 150 });
    expect(s.byCategory.map((b) => b.categoryId)).toEqual(['food']);
  });

  it('parses balances including zero and negatives', () => {
    expect(parseBalance('1,250.5')).toBe(125050);
    expect(parseBalance('0')).toBe(0);
    expect(parseBalance('-300')).toBe(-30000);
    expect(parseBalance('abc')).toBeNull();
  });

  it('computes account balances and keeps fixes out of spending', () => {
    const accounts = [...DEFAULT_ACCOUNTS, { id: 'boc', name: 'BOC', emoji: '🏦', start: 50000 }];
    const txs = [
      tx({ id: '1', amount: 300 }), // cash, no accountId
      tx({ id: '2', amount: 1000, accountId: 'boc' }),
      tx({ id: '3', amount: 200, type: 'income', categoryId: 'salary', accountId: 'boc' }),
      tx({ id: '4', amount: 100, type: 'expense', categoryId: ADJUST }),
      tx({ id: '5', amount: 999, type: 'income', categoryId: CARRY }),
    ];
    const b = balances(accounts, txs);
    expect(b.get('cash')).toBe(-400);
    expect(b.get('boc')).toBe(49200);
    expect(summarize(txs)).toMatchObject({ spent: 1300, income: 200 });
  });

  it('exports CSV with escaping', () => {
    const csv = toCSV([tx({ note: 'lunch, "big"' })], DEFAULT_CATEGORIES);
    expect(csv).toBe('date,type,category,account,amount,note\n2026-10-01,expense,Food,cash,1.00,"lunch, ""big"""\n');
  });

  it('rejects files that are not backups', () => {
    expect(() => validateBackup({ foo: 1 })).toThrow('not-backup');
    expect(() => validateBackup({ app: 'pocket-ledger', categories: [], transactions: [tx({ amount: 1.5 })] })).toThrow('invalid-tx');
  });
});

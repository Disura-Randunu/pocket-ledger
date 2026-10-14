/** Sri Lankan Rupees. Changeable in Settings. */
export const DEFAULT_CURRENCY = 'Rs. ';

export type TxType = 'expense' | 'income';

export interface Tx {
  id: string;
  amount: number; // integer cents, always positive
  type: TxType;
  categoryId: string;
  note: string;
  date: string; // YYYY-MM-DD
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  type: TxType;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: 'Food', emoji: '🍔', type: 'expense' },
  { id: 'transport', name: 'Transport', emoji: '🚌', type: 'expense' },
  { id: 'bills', name: 'Bills', emoji: '💡', type: 'expense' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', type: 'expense' },
  { id: 'health', name: 'Health', emoji: '💊', type: 'expense' },
  { id: 'fun', name: 'Fun', emoji: '🎉', type: 'expense' },
  { id: 'other', name: 'Other', emoji: '📦', type: 'expense' },
  { id: 'salary', name: 'Salary', emoji: '💼', type: 'income' },
  { id: 'gift', name: 'Gift', emoji: '🎁', type: 'income' },
  { id: 'other-in', name: 'Other', emoji: '➕', type: 'income' },
];

/** Parses user input like "12", "12.5", "1,234.56" into cents. Returns null if invalid or zero. */
export function parseCents(input: string): number | null {
  const clean = input.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

export function formatCents(cents: number, symbol: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}${symbol}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "2026-10" for a date string or Date. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface Summary {
  spent: number;
  income: number;
  net: number;
  byCategory: { categoryId: string; total: number; share: number }[];
}

export function summarize(txs: Tx[]): Summary {
  let spent = 0;
  let income = 0;
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (t.type === 'expense') {
      spent += t.amount;
      totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
    } else {
      income += t.amount;
    }
  }
  const byCategory = [...totals.entries()]
    .map(([categoryId, total]) => ({ categoryId, total, share: spent ? total / spent : 0 }))
    .sort((a, b) => b.total - a.total);
  return { spent, income, net: income - spent, byCategory };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCSV(txs: Tx[], categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((t) =>
      [t.date, t.type, names.get(t.categoryId) ?? t.categoryId, (t.amount / 100).toFixed(2), t.note]
        .map(csvCell)
        .join(','),
    );
  return ['date,type,category,amount,note', ...rows].join('\n') + '\n';
}

export interface Backup {
  app: 'pocket-ledger';
  version: 1;
  exportedAt: string;
  currency: string;
  categories: Category[];
  transactions: Tx[];
}

/** Validates a parsed backup file. Throws with a readable message if it is not one. */
export function validateBackup(data: unknown): Backup {
  const b = data as Backup;
  if (!b || b.app !== 'pocket-ledger' || !Array.isArray(b.transactions) || !Array.isArray(b.categories)) {
    throw new Error('not-backup');
  }
  for (const t of b.transactions) {
    if (
      typeof t.id !== 'string' || !Number.isSafeInteger(t.amount) || t.amount <= 0 ||
      (t.type !== 'expense' && t.type !== 'income') || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)
    ) {
      throw new Error('invalid-tx');
    }
  }
  return b;
}

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, type Account, type Backup, type Category, type Tx } from './money';

interface LedgerDB extends DBSchema {
  transactions: { key: string; value: Tx; indexes: { date: string } };
  categories: { key: string; value: Category };
  settings: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<LedgerDB>> | null = null;

export function db(): Promise<IDBPDatabase<LedgerDB>> {
  dbPromise ??= openDB<LedgerDB>('pocket-ledger', 1, {
    upgrade(d) {
      d.createObjectStore('transactions', { keyPath: 'id' }).createIndex('date', 'date');
      const cats = d.createObjectStore('categories', { keyPath: 'id' });
      for (const c of DEFAULT_CATEGORIES) cats.put(c);
      d.createObjectStore('settings');
    },
  });
  return dbPromise;
}

/** Transactions in a month ("2026-10"), newest first. */
export async function listMonth(month: string): Promise<Tx[]> {
  const range = IDBKeyRange.bound(`${month}-01`, `${month}-31`);
  const txs = await (await db()).getAllFromIndex('transactions', 'date', range);
  return txs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export async function listAll(): Promise<Tx[]> {
  return (await db()).getAll('transactions');
}

export async function getTx(id: string): Promise<Tx | undefined> {
  return (await db()).get('transactions', id);
}

export async function saveTx(tx: Tx): Promise<void> {
  await (await db()).put('transactions', tx);
}

export async function deleteTx(id: string): Promise<void> {
  await (await db()).delete('transactions', id);
}

/** Categories in the default order, with any user-added ones after them. */
export async function listCategories(): Promise<Category[]> {
  // Built-ins first, then the user's own (oldest first), then "Other" last.
  const order = (c: Category) => {
    if (c.id === 'other' || c.id === 'other-in') return 1000;
    const i = DEFAULT_CATEGORIES.findIndex((d) => d.id === c.id);
    return i === -1 ? DEFAULT_CATEGORIES.length : i;
  };
  return (await db()).getAll('categories').then((cs) => cs.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id)));
}

export async function saveCategory(c: Category): Promise<void> {
  await (await db()).put('categories', c);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get('settings', key);
  return v === undefined ? fallback : (v as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', value, key);
}

export async function listAccounts(): Promise<Account[]> {
  return getSetting('accounts', DEFAULT_ACCOUNTS);
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  await setSetting('accounts', accounts);
}

/** Merges a backup in: same ids are overwritten, nothing is deleted. Returns the count imported. */
export async function importBackup(b: Backup): Promise<number> {
  const tx = (await db()).transaction(['transactions', 'categories'], 'readwrite');
  for (const c of b.categories) tx.objectStore('categories').put(c);
  for (const t of b.transactions) tx.objectStore('transactions').put(t);
  await tx.done;
  if (b.accounts?.length) {
    const merged = new Map((await listAccounts()).map((a) => [a.id, a]));
    for (const a of b.accounts) merged.set(a.id, a);
    await saveAccounts([...merged.values()]);
  }
  return b.transactions.length;
}

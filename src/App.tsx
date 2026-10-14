import { useEffect, useState } from 'preact/hooks';
import * as store from './db';
import {
  formatCents, monthKey, monthLabel, parseCents, shiftMonth, summarize, toCSV, todayISO, validateBackup,
  type Backup, type Category, type Tx, type TxType,
} from './money';

const BACKUP_REMINDER_DAYS = 30;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [txs, setTxs] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState('$');
  const [lastBackupAt, setLastBackupAt] = useState(0);
  const [hasAny, setHasAny] = useState(false);
  const [editing, setEditing] = useState<Tx | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function refresh() {
    const [list, all] = await Promise.all([store.listMonth(month), store.listAll()]);
    setTxs(list);
    setHasAny(all.length > 0);
  }

  useEffect(() => {
    (async () => {
      setCategories(await store.listCategories());
      setCurrency(await store.getSetting('currency', '$'));
      setLastBackupAt(await store.getSetting('lastBackupAt', 0));
    })();
  }, []);

  useEffect(() => { refresh(); }, [month]);

  const cat = (id: string) => categories.find((c) => c.id === id);
  const s = summarize(txs);
  const money = (c: number) => formatCents(c, currency);
  const needsBackup = hasAny && Date.now() - lastBackupAt > BACKUP_REMINDER_DAYS * 86400000;

  async function markBackedUp() {
    const now = Date.now();
    await store.setSetting('lastBackupAt', now);
    setLastBackupAt(now);
  }

  async function exportJSON() {
    const backup: Backup = {
      app: 'pocket-ledger', version: 1, exportedAt: new Date().toISOString(),
      currency, categories, transactions: await store.listAll(),
    };
    download(`pocket-ledger-${todayISO()}.json`, JSON.stringify(backup, null, 1), 'application/json');
    await markBackedUp();
  }

  async function exportCSV() {
    download(`pocket-ledger-${todayISO()}.csv`, toCSV(await store.listAll(), categories), 'text/csv');
  }

  async function importJSON(file: File) {
    try {
      const n = await store.importBackup(validateBackup(JSON.parse(await file.text())));
      setCategories(await store.listCategories());
      await refresh();
      alert(`Imported ${n} transactions.`);
    } catch (e) {
      alert(e instanceof Error && !(e instanceof SyntaxError) ? e.message : 'Could not read that file.');
    }
  }

  return (
    <main>
      <header class="top">
        <button class="icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h1>{monthLabel(month)}</h1>
        <button class="icon" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        <button class="icon gear" aria-label="Settings" onClick={() => setSettingsOpen(true)}>⚙︎</button>
      </header>

      <section class="summary">
        <div class="spent"><span>Spent</span><strong data-testid="spent">{money(s.spent)}</strong></div>
        <div class="row">
          <div><span>Income</span><b>{money(s.income)}</b></div>
          <div><span>Net</span><b class={s.net < 0 ? 'neg' : 'pos'}>{money(s.net)}</b></div>
        </div>
      </section>

      {needsBackup && (
        <button class="banner" onClick={exportJSON}>Your data lives only on this phone. Tap to save a backup.</button>
      )}

      {s.byCategory.length > 0 && (
        <section class="card">
          {s.byCategory.map((b) => (
            <div class="bar" key={b.categoryId}>
              <div class="bar-label">
                <span>{cat(b.categoryId)?.emoji} {cat(b.categoryId)?.name ?? b.categoryId}</span>
                <span>{money(b.total)} · {Math.round(b.share * 100)}%</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style={{ width: `${b.share * 100}%` }} /></div>
            </div>
          ))}
        </section>
      )}

      <ul class="list">
        {txs.length === 0 && <li class="empty">Nothing yet this month. Tap + to add.</li>}
        {txs.map((t) => (
          <li key={t.id} onClick={() => setEditing(t)}>
            <span class="emoji">{cat(t.categoryId)?.emoji ?? '•'}</span>
            <span class="what">
              <span>{t.note || cat(t.categoryId)?.name || 'Other'}</span>
              <small>{new Date(t.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</small>
            </span>
            <span class={t.type === 'income' ? 'amt pos' : 'amt'}>{t.type === 'income' ? '+' : '−'}{money(t.amount)}</span>
          </li>
        ))}
      </ul>

      <button class="fab" aria-label="Add" onClick={() => setEditing('new')}>+</button>

      {editing && (
        <Editor
          tx={editing === 'new' ? null : editing}
          month={month}
          categories={categories}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={async (date) => {
            setEditing(null);
            navigator.storage?.persist?.();
            if (monthKey(date) !== month) setMonth(monthKey(date)); else await refresh();
          }}
        />
      )}

      {settingsOpen && (
        <div class="sheet-bg" onClick={() => setSettingsOpen(false)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <label class="field">Currency symbol
              <input value={currency} maxLength={4} onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                setCurrency(v);
                store.setSetting('currency', v);
              }} />
            </label>
            <button class="wide" onClick={exportJSON}>Save backup (JSON)</button>
            <button class="wide" onClick={exportCSV}>Export spreadsheet (CSV)</button>
            <label class="wide file">Restore from backup
              <input type="file" accept="application/json,.json" onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) importJSON(f);
              }} />
            </label>
            <p class="hint">
              {lastBackupAt ? `Last backup ${new Date(lastBackupAt).toLocaleDateString()}.` : 'No backup yet.'} Your data
              never leaves this phone unless you export it.
            </p>
            <button class="wide ghost" onClick={() => setSettingsOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </main>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

function Editor(props: {
  tx: Tx | null; month: string; categories: Category[]; currency: string;
  onClose: () => void; onSaved: (date: string) => void;
}) {
  const { tx, categories, currency } = props;
  const today = todayISO();
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense');
  const [amount, setAmount] = useState(tx ? (tx.amount / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [date, setDate] = useState(tx?.date ?? (monthKey(today) === props.month ? today : `${props.month}-01`));
  const [note, setNote] = useState(tx?.note ?? '');
  const cents = parseCents(amount);

  function press(k: string) {
    if (k === '⌫') return setAmount(amount.slice(0, -1));
    const next = amount + k;
    if (/^\d{0,9}(\.\d{0,2})?$/.test(next)) setAmount(next === '.' ? '0.' : next);
  }

  async function save(categoryId: string) {
    if (!cents) return;
    await store.saveTx({
      id: tx?.id ?? crypto.randomUUID(), amount: cents, type, categoryId,
      note: note.trim(), date, createdAt: tx?.createdAt ?? Date.now(),
    });
    props.onSaved(date);
  }

  return (
    <div class="sheet-bg" onClick={props.onClose}>
      <div class="sheet editor" onClick={(e) => e.stopPropagation()}>
        <div class="toggle">
          <button class={type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>Expense</button>
          <button class={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Income</button>
        </div>
        <div class="amount" data-testid="amount">{currency}{amount || '0'}</div>
        <div class="keypad">
          {KEYS.map((k) => <button key={k} onClick={() => press(k)}>{k}</button>)}
        </div>
        <div class="meta">
          <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value || today)} />
          <input placeholder="Note (optional)" value={note} maxLength={60} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
        </div>
        <p class="hint">{cents ? 'Tap a category to save' : 'Enter an amount, then tap a category'}</p>
        <div class="cats">
          {categories.filter((c) => c.type === type).map((c) => (
            <button key={c.id} disabled={!cents} class={tx?.categoryId === c.id ? 'cat sel' : 'cat'} onClick={() => save(c.id)}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
        </div>
        {tx && (
          <button class="wide danger" onClick={async () => {
            if (confirm('Delete this transaction?')) { await store.deleteTx(tx.id); props.onSaved(tx.date); }
          }}>Delete</button>
        )}
      </div>
    </div>
  );
}

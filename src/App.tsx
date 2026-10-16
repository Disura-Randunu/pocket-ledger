import { useEffect, useRef, useState } from 'preact/hooks';
import * as store from './db';
import { dayLabel, detectLang, monthName, monthTitle, STRINGS, type Lang, type Strings } from './i18n';
import {
  CARRY, carryId, DEFAULT_CURRENCY, formatCents, monthKey, parseCents, shiftMonth, summarize, toCSV, todayISO, validateBackup,
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
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [lastBackupAt, setLastBackupAt] = useState(0);
  const [hasAny, setHasAny] = useState(false);
  const [editing, setEditing] = useState<Tx | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(detectLang());
  const [prevNet, setPrevNet] = useState(0);
  const [carriedOut, setCarriedOut] = useState(true);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<Tx | null>(null);
  const undoTimer = useRef<number>();
  const t = STRINGS[lang];

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  async function refresh() {
    const prevBalance = summarize(await store.listMonth(prev)).net;
    // A carry-over follows later edits to the month it came from, so it never goes stale.
    const carry = await store.getTx(carryId(prev));
    if (carry) {
      const signed = carry.type === 'income' ? carry.amount : -carry.amount;
      if (prevBalance === 0) await store.deleteTx(carry.id);
      else if (signed !== prevBalance) await store.saveTx(carryTx(prev, prevBalance));
    }
    const [list, all, out] = await Promise.all([store.listMonth(month), store.listAll(), store.getTx(carryId(month))]);
    setTxs(list);
    setHasAny(all.length > 0);
    setPrevNet(prevBalance);
    setCarriedOut(!!out);
  }

  async function carryOver(from: string, balance: number) {
    await store.saveTx(carryTx(from, balance));
    await refresh();
  }

  async function setCarryDismissed(from: string, on: boolean) {
    const list = on ? [...dismissed, from] : dismissed.filter((m) => m !== from);
    setDismissed(list);
    await store.setSetting('carryDismissed', list);
  }

  /** Deletes right away and offers Undo for a few seconds instead of asking first. */
  async function remove(tx: Tx) {
    await store.deleteTx(tx.id);
    if (tx.categoryId === CARRY) await setCarryDismissed(prev, true);
    await refresh();
    setDeleted(tx);
    clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setDeleted(null), 6000);
  }

  async function undoDelete() {
    if (!deleted) return;
    await store.saveTx(deleted);
    if (deleted.categoryId === CARRY) await setCarryDismissed(prev, false);
    setDeleted(null);
    await refresh();
  }

  useEffect(() => {
    (async () => {
      setCategories(await store.listCategories());
      setCurrency(await store.getSetting('currency', DEFAULT_CURRENCY));
      setLastBackupAt(await store.getSetting('lastBackupAt', 0));
      setLang(await store.getSetting<Lang>('lang', detectLang()));
      setDismissed(await store.getSetting<string[]>('carryDismissed', []));
    })();
  }, []);

  useEffect(() => { refresh(); }, [month]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const cat = (id: string) => localize(categories.find((c) => c.id === id), t);
  const carryIn = txs.find((x) => x.categoryId === CARRY);
  const showCarryPrompt = !carryIn && prevNet !== 0 && !dismissed.includes(prev);
  const isPast = month < monthKey(todayISO());
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
    download(`pocket-ledger-${todayISO()}.csv`, toCSV(await store.listAll(), [...categories, CARRY_CATEGORY].map((c) => localize(c, t)!)), 'text/csv');
  }

  async function importJSON(file: File) {
    try {
      const n = await store.importBackup(validateBackup(JSON.parse(await file.text())));
      setCategories(await store.listCategories());
      await refresh();
      alert(t.imported(n));
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      alert(code === 'not-backup' ? t.notBackup : code === 'invalid-tx' ? t.invalidTx : t.unreadable);
    }
  }

  return (
    <main>
      <header class="top">
        <button class="icon" aria-label={t.prevMonth} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h1>{monthTitle(month, t)}</h1>
        <button class="icon" aria-label={t.nextMonth} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        <button class="icon gear" aria-label={t.settings} onClick={() => setSettingsOpen(true)}>⚙︎</button>
      </header>

      <section class="summary">
        <div class="spent"><span>{t.spent}</span><strong data-testid="spent">{money(s.spent)}</strong></div>
        <div class="row">
          <div><span>{t.income}</span><b>{money(s.income)}</b></div>
          {s.carried !== 0 && <div><span>{t.carried}</span><b data-testid="carried">{money(s.carried)}</b></div>}
          <div><span>{t.net}</span><b data-testid="net" class={s.net < 0 ? 'neg' : 'pos'}>{money(s.net)}</b></div>
        </div>
      </section>

      {showCarryPrompt && (
        <section class="carry">
          <p>{t.carryPrompt(monthName(prev, t), money(prevNet), monthName(month, t))}</p>
          <div class="carry-actions">
            <button class="primary" onClick={() => carryOver(prev, prevNet)}>{t.carryYes}</button>
            <button onClick={() => setCarryDismissed(prev, true)}>{t.carryNo}</button>
          </div>
        </section>
      )}

      {!carryIn && prevNet !== 0 && dismissed.includes(prev) && (
        <button class="carry-link" onClick={() => carryOver(prev, prevNet)}>↪︎ {t.carryBack(monthName(prev, t), money(prevNet))}</button>
      )}

      {isPast && !carriedOut && s.net !== 0 && (
        <button class="carry-link" onClick={() => carryOver(month, s.net)}>↪︎ {t.carryLink(money(s.net), monthName(next, t))}</button>
      )}

      {needsBackup && (
        <button class="banner" onClick={exportJSON}>{t.backupBanner}</button>
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
        {txs.length === 0 && <li class="empty">{t.empty}</li>}
        {txs.map((tx) => (
          <li key={tx.id} onClick={async () => {
            if (tx.categoryId !== CARRY) return setEditing(tx);
            if (confirm(t.removeCarry)) await remove(tx);
          }}>
            <span class="emoji">{tx.categoryId === CARRY ? CARRY_CATEGORY.emoji : cat(tx.categoryId)?.emoji ?? '•'}</span>
            <span class="what">
              <span>{tx.categoryId === CARRY ? t.carriedFrom(monthName(prev, t)) : tx.note || cat(tx.categoryId)?.name || t.categories.other}</span>
              <small>{dayLabel(tx.date, t)}</small>
            </span>
            <span class={tx.type === 'income' ? 'amt pos' : 'amt'}>{tx.type === 'income' ? '+' : '−'}{money(tx.amount)}</span>
          </li>
        ))}
      </ul>

      {deleted && (
        <div class="toast" role="status">
          <span>{t.deleted}</span>
          <button onClick={undoDelete}>{t.undo}</button>
        </div>
      )}

      <button class="fab" aria-label={t.add} onClick={() => setEditing('new')}>+</button>

      {editing && (
        <Editor
          tx={editing === 'new' ? null : editing}
          month={month}
          categories={categories.map((c) => localize(c, t)!)}
          t={t}
          currency={currency}
          onClose={() => setEditing(null)}
          onDelete={async (tx) => { setEditing(null); await remove(tx); }}
          onCategoryAdded={async () => setCategories(await store.listCategories())}
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
            <h2>{t.settings}</h2>
            <div class="field">{t.language}
              <div class="toggle small">
                {(['si', 'en'] as Lang[]).map((l) => (
                  <button key={l} class={lang === l ? 'on' : ''} onClick={() => { setLang(l); store.setSetting('lang', l); }}>
                    {l === 'si' ? 'සිංහල' : 'English'}
                  </button>
                ))}
              </div>
            </div>
            <label class="field">{t.currency}
              <input value={currency} maxLength={6} onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                setCurrency(v);
                store.setSetting('currency', v);
              }} />
            </label>
            {categories.some((c) => c.id.startsWith('c-') && !c.hidden) && (
              <div class="mine">
                <span>{t.yourCategories}</span>
                <div class="chips">
                  {categories.filter((c) => c.id.startsWith('c-') && !c.hidden).map((c) => (
                    <button key={c.id} class="chip" onClick={async () => {
                      if (!confirm(t.removeCategory(c.name))) return;
                      await store.saveCategory({ ...c, hidden: true });
                      setCategories(await store.listCategories());
                    }}>{c.emoji} {c.name} <b>×</b></button>
                  ))}
                </div>
              </div>
            )}
            <button class="wide" onClick={exportJSON}>{t.saveBackup}</button>
            <button class="wide" onClick={exportCSV}>{t.exportCSV}</button>
            <label class="wide file">{t.restore}
              <input type="file" accept="application/json,.json" onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) importJSON(f);
              }} />
            </label>
            <p class="hint">
              {lastBackupAt ? t.lastBackup(new Date(lastBackupAt).toLocaleDateString(t.locale)) : t.noBackup} {t.privacy}
            </p>
            <button class="wide ghost" onClick={() => setSettingsOpen(false)}>{t.done}</button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Shows built-in categories in the current language; user-added ones keep their own name. */
function localize(c: Category | undefined, t: Strings): Category | undefined {
  return c && t.categories[c.id] ? { ...c, name: t.categories[c.id] } : c;
}

const CARRY_CATEGORY: Category = { id: CARRY, name: 'Carried over', emoji: '↪️', type: 'income' };

/** The entry that brings `from`'s end balance into the first day of the next month. */
function carryTx(from: string, balance: number): Tx {
  return {
    id: carryId(from), amount: Math.abs(balance), type: balance > 0 ? 'income' : 'expense',
    categoryId: CARRY, note: '', date: `${shiftMonth(from, 1)}-01`, createdAt: 0,
  };
}

const EMOJIS = ['🏠', '🛒', '⛽', '📱', '👕', '🎓', '🍼', '🐶', '✈️', '💇', '🎁', '🙏', '🍺', '🎬', '💰', '⭐'];

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

function Editor(props: {
  tx: Tx | null; month: string; categories: Category[]; currency: string; t: Strings;
  onClose: () => void; onSaved: (date: string) => void; onDelete: (tx: Tx) => void;
  onCategoryAdded: () => Promise<void>;
}) {
  const { tx, categories, currency, t } = props;
  const today = todayISO();
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense');
  const [amount, setAmount] = useState(tx ? (tx.amount / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [date, setDate] = useState(tx?.date ?? (monthKey(today) === props.month ? today : `${props.month}-01`));
  const [note, setNote] = useState(tx?.note ?? '');
  const cents = parseCents(amount);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState(EMOJIS[0]);

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    const id = `c-${Date.now()}`;
    await store.saveCategory({ id, name, emoji: newEmoji, type });
    setAdding(false);
    setNewName('');
    await props.onCategoryAdded();
    if (cents) await save(id); // amount already typed: finish the entry in the same tap
  }

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
          <button class={type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>{t.expense}</button>
          <button class={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>{t.income}</button>
        </div>
        <div class="amount" data-testid="amount">{currency}{amount || '0'}</div>
        <div class="keypad">
          {KEYS.map((k) => <button key={k} onClick={() => press(k)}>{k}</button>)}
        </div>
        <div class="meta">
          <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value || today)} />
          <input placeholder={t.note} value={note} maxLength={60} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
        </div>
        <p class="hint">{cents ? t.tapToSave : t.enterAmount}</p>
        <div class="cats">
          {categories.filter((c) => c.type === type && !c.hidden).map((c) => (
            <button key={c.id} disabled={!cents} class={tx?.categoryId === c.id ? 'cat sel' : 'cat'} onClick={() => save(c.id)}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
          {!adding && (
            <button class="cat new" onClick={() => setAdding(true)}><span>＋</span>{t.newCategory}</button>
          )}
        </div>
        {adding && (
          <div class="new-cat">
            <div class="emojis">
              {EMOJIS.map((e) => (
                <button key={e} class={e === newEmoji ? 'on' : ''} onClick={() => setNewEmoji(e)}>{e}</button>
              ))}
            </div>
            <input placeholder={t.categoryName} value={newName} maxLength={16} autoFocus
              onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
            <div class="carry-actions">
              <button class="primary" disabled={!newName.trim()} onClick={addCategory}>
                {newEmoji} {cents ? t.addAndSave : t.addCategory}
              </button>
              <button onClick={() => setAdding(false)}>{t.cancel}</button>
            </div>
          </div>
        )}
        {tx && (
          <button class="wide danger" onClick={() => props.onDelete(tx)}>{t.delete}</button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import * as store from './db';
import { dayLabel, detectLang, monthName, monthTitle, STRINGS, type Lang, type Strings } from './i18n';
import {
  accountOf, ADJUST, balances, CARRY, carryId, CASH, DEFAULT_ACCOUNTS, DEFAULT_CURRENCY, formatCents, parseBalance, monthKey, parseCents, shiftMonth, summarize, toCSV, todayISO, validateBackup,
  type Account, type Backup, type Category, type Tx, type TxType,
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
  const [allTxs, setAllTxs] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [lastAccount, setLastAccount] = useState(CASH);
  const [filter, setFilter] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixValue, setFixValue] = useState('');
  const [addingAccount, setAddingAccount] = useState(false);
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
    setAllTxs(all);
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
      setAccounts(await store.listAccounts());
      setLastAccount(await store.getSetting('lastAccount', CASH));
    })();
  }, []);

  useEffect(() => { refresh(); }, [month]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const cat = (id: string) => localize(categories.find((c) => c.id === id), t);
  const carryIn = txs.find((x) => x.categoryId === CARRY);
  const shownAccounts = accounts.filter((a) => !a.hidden);
  // Accounts stay invisible until there are two; then balances roll over by themselves, so carry-over steps aside.
  const multi = shownAccounts.length >= 2;
  const acctName = (a?: Account) => (!a ? '' : a.id === CASH ? t.cash : a.name);
  const acct = (id: string) => accounts.find((a) => a.id === id);
  const bal = balances(accounts, allTxs);
  const shownTxs = filter ? txs.filter((x) => accountOf(x) === filter && x.categoryId !== CARRY) : txs;
  const showCarryPrompt = !multi && !carryIn && prevNet !== 0 && !dismissed.includes(prev);
  const isPast = month < monthKey(todayISO());
  const s = summarize(txs);
  const money = (c: number) => formatCents(c, currency);
  const needsBackup = hasAny && Date.now() - lastBackupAt > BACKUP_REMINDER_DAYS * 86400000;

  async function updateAccounts(list: Account[]) {
    setAccounts(list);
    await store.saveAccounts(list);
  }

  /** Records the difference between what the app thinks and what's really there. */
  async function fixBalance(id: string) {
    const actual = parseBalance(fixValue);
    if (actual === null) return;
    const diff = actual - (bal.get(id) ?? 0);
    if (diff !== 0) {
      await store.saveTx({
        id: crypto.randomUUID(), amount: Math.abs(diff), type: diff > 0 ? 'income' : 'expense',
        categoryId: ADJUST, note: '', date: todayISO(), createdAt: Date.now(), accountId: id,
      });
    }
    setFixing(false);
    setFixValue('');
    await refresh();
  }

  async function markBackedUp() {
    const now = Date.now();
    await store.setSetting('lastBackupAt', now);
    setLastBackupAt(now);
  }

  async function exportJSON() {
    const backup: Backup = {
      app: 'pocket-ledger', version: 1, exportedAt: new Date().toISOString(),
      currency, categories, accounts, transactions: await store.listAll(),
    };
    download(`pocket-ledger-${todayISO()}.json`, JSON.stringify(backup, null, 1), 'application/json');
    await markBackedUp();
  }

  async function exportCSV() {
    download(`pocket-ledger-${todayISO()}.csv`, toCSV(await store.listAll(), [...categories, CARRY_CATEGORY].map((c) => localize(c, t)!), accounts.map((a) => ({ ...a, name: acctName(a) }))), 'text/csv');
  }

  async function importJSON(file: File) {
    try {
      const n = await store.importBackup(validateBackup(JSON.parse(await file.text())));
      setCategories(await store.listCategories());
      setAccounts(await store.listAccounts());
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

      {multi && (
        <div class="accounts">
          {shownAccounts.map((a) => (
            <button key={a.id} class={filter === a.id ? 'acct on' : 'acct'} onClick={() => { setFilter(filter === a.id ? null : a.id); setFixing(false); }}>
              <span>{a.emoji} {acctName(a)}</span>
              <b data-testid={`bal-${a.id}`} class={(bal.get(a.id) ?? 0) < 0 ? 'neg' : ''}>{money(bal.get(a.id) ?? 0)}</b>
            </button>
          ))}
        </div>
      )}

      {multi && filter && (fixing ? (
        <div class="fix">
          <input inputMode="decimal" autoFocus placeholder={t.actualBalance(acctName(acct(filter)))} value={fixValue}
            onInput={(e) => setFixValue((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && fixBalance(filter)} />
          <button disabled={parseBalance(fixValue) === null} onClick={() => fixBalance(filter)}>{t.save}</button>
        </div>
      ) : (
        <button class="carry-link" onClick={() => setFixing(true)}>⚖️ {t.fixBalance}</button>
      ))}

      {showCarryPrompt && (
        <section class="carry">
          <p>{t.carryPrompt(monthName(prev, t), money(prevNet), monthName(month, t))}</p>
          <div class="carry-actions">
            <button class="primary" onClick={() => carryOver(prev, prevNet)}>{t.carryYes}</button>
            <button onClick={() => setCarryDismissed(prev, true)}>{t.carryNo}</button>
          </div>
        </section>
      )}

      {!multi && !carryIn && prevNet !== 0 && dismissed.includes(prev) && (
        <button class="carry-link" onClick={() => carryOver(prev, prevNet)}>↪︎ {t.carryBack(monthName(prev, t), money(prevNet))}</button>
      )}

      {!multi && isPast && !carriedOut && s.net !== 0 && (
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
        {shownTxs.length === 0 && <li class="empty">{t.empty}</li>}
        {shownTxs.map((tx) => (
          <li key={tx.id} onClick={async () => {
            if (tx.categoryId === CARRY) { if (confirm(t.removeCarry)) await remove(tx); return; }
            if (tx.categoryId === ADJUST) { if (confirm(t.removeFix)) await remove(tx); return; }
            setEditing(tx);
          }}>
            <span class="emoji">{tx.categoryId === CARRY ? CARRY_CATEGORY.emoji : tx.categoryId === ADJUST ? '⚖️' : cat(tx.categoryId)?.emoji ?? '•'}</span>
            <span class="what">
              <span>{tx.categoryId === CARRY ? t.carriedFrom(monthName(prev, t)) : tx.categoryId === ADJUST ? t.balanceFix : tx.note || cat(tx.categoryId)?.name || t.categories.other}</span>
              <small>{dayLabel(tx.date, t)}{multi && tx.categoryId !== CARRY ? ` · ${acct(accountOf(tx))?.emoji ?? ''} ${acctName(acct(accountOf(tx)))}` : ''}</small>
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
          accounts={multi ? shownAccounts.map((a) => ({ ...a, name: acctName(a) })) : []}
          defaultAccount={filter ?? (shownAccounts.some((a) => a.id === lastAccount) ? lastAccount : CASH)}
          onSaved={async (date, accountId) => {
            setEditing(null);
            setLastAccount(accountId);
            store.setSetting('lastAccount', accountId);
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
            <div class="mine">
              <span>{t.accounts}</span>
              <div class="acct-list">
                {shownAccounts.map((a) => (
                  <div class="acct-row" key={a.id}>
                    <span>{a.emoji} {acctName(a)}</span>
                    <b>{money(bal.get(a.id) ?? 0)}</b>
                    {a.id !== CASH && (
                      <button aria-label={t.removeAccount(a.name)} onClick={async () => {
                        if (!confirm(t.removeAccount(a.name))) return;
                        if (filter === a.id) setFilter(null);
                        await updateAccounts(accounts.map((x) => (x.id === a.id ? { ...x, hidden: true } : x)));
                      }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              {addingAccount ? (
                <NewAccount t={t} onCancel={() => setAddingAccount(false)} onAdd={async (a) => {
                  await updateAccounts([...accounts, a]);
                  setAddingAccount(false);
                }} />
              ) : (
                <button class="chip add-acct" onClick={() => setAddingAccount(true)}>＋ {t.addAccount}</button>
              )}
            </div>
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

const ACCOUNT_EMOJIS = ['🏦', '💳', '📱', '👛', '💵', '🏧'];

function NewAccount(props: { t: Strings; onAdd: (a: Account) => void; onCancel: () => void }) {
  const { t } = props;
  const [emoji, setEmoji] = useState(ACCOUNT_EMOJIS[0]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const start = amount.trim() ? parseBalance(amount) : 0;
  const ok = !!name.trim() && start !== null;
  const add = () => ok && props.onAdd({ id: `a-${Date.now()}`, name: name.trim(), emoji, start: start! });
  return (
    <div class="new-cat">
      <div class="emojis">
        {ACCOUNT_EMOJIS.map((e) => <button key={e} class={e === emoji ? 'on' : ''} onClick={() => setEmoji(e)}>{e}</button>)}
      </div>
      <input placeholder={t.accountName} value={name} maxLength={16} autoFocus onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      <input placeholder={t.balanceNow} inputMode="decimal" value={amount}
        onInput={(e) => setAmount((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <div class="carry-actions">
        <button class="primary" disabled={!ok} onClick={add}>{emoji} {t.addAccount}</button>
        <button onClick={props.onCancel}>{t.cancel}</button>
      </div>
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

function Editor(props: {
  tx: Tx | null; month: string; categories: Category[]; currency: string; t: Strings;
  onClose: () => void; onSaved: (date: string, accountId: string) => void; onDelete: (tx: Tx) => void;
  onCategoryAdded: () => Promise<void>;
  accounts: Account[]; defaultAccount: string;
}) {
  const { tx, categories, currency, t } = props;
  const today = todayISO();
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense');
  const [amount, setAmount] = useState(tx ? (tx.amount / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [date, setDate] = useState(tx?.date ?? (monthKey(today) === props.month ? today : `${props.month}-01`));
  const [note, setNote] = useState(tx?.note ?? '');
  const cents = parseCents(amount);
  const [accountId, setAccountId] = useState(tx ? accountOf(tx) : props.defaultAccount);
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
      note: note.trim(), date, createdAt: tx?.createdAt ?? Date.now(), accountId,
    });
    props.onSaved(date, accountId);
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
        {props.accounts.length > 1 && (
          <div class="from">
            <span>{type === 'income' ? t.to : t.from}</span>
            {props.accounts.map((a) => (
              <button key={a.id} class={a.id === accountId ? 'on' : ''} onClick={() => setAccountId(a.id)}>{a.emoji} {a.name}</button>
            ))}
          </div>
        )}
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

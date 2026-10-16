export type Lang = 'en' | 'si';

const en = {
  locale: 'en-US',
  months: null as string[] | null,
  weekdays: null as string[] | null,
  spent: 'Spent',
  income: 'Income',
  net: 'Net',
  expense: 'Expense',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  settings: 'Settings',
  add: 'Add',
  empty: 'Nothing yet this month. Tap + to add.',
  backupBanner: 'Your data lives only on this phone. Tap to save a backup.',
  language: 'Language',
  currency: 'Currency symbol',
  saveBackup: 'Save backup (JSON)',
  exportCSV: 'Export spreadsheet (CSV)',
  restore: 'Restore from backup',
  lastBackup: (date: string) => `Last backup ${date}.`,
  noBackup: 'No backup yet.',
  privacy: 'Your data never leaves this phone unless you export it.',
  done: 'Done',
  note: 'Note (optional)',
  tapToSave: 'Tap a category to save',
  enterAmount: 'Enter an amount, then tap a category',
  delete: 'Delete',
  imported: (n: number) => `Imported ${n} transactions.`,
  notBackup: 'This file is not a Pocket Ledger backup.',
  invalidTx: 'The backup contains an invalid transaction.',
  unreadable: 'Could not read that file.',
  carried: 'Carried',
  carryPrompt: (from: string, amount: string, to: string) => `${from} ended with ${amount}. Carry it into ${to}?`,
  carryYes: 'Carry over',
  carryNo: 'No thanks',
  carryLink: (amount: string, to: string) => `Carry ${amount} into ${to}`,
  carriedFrom: (from: string) => `${from} balance`,
  carryBack: (from: string, amount: string) => `Bring in ${from} balance (${amount})`,
  deleted: 'Deleted',
  undo: 'Undo',
  removeCarry: 'Remove this carry-over?',
  categories: {
    carry: 'Carried over',
    food: 'Food', transport: 'Transport', bills: 'Bills', shopping: 'Shopping', health: 'Health',
    fun: 'Fun', other: 'Other', salary: 'Salary', gift: 'Gift', 'other-in': 'Other',
  } as Record<string, string>,
};

export type Strings = typeof en;

const si: Strings = {
  locale: 'si-LK',
  months: ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'],
  weekdays: ['ඉරිදා', 'සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා'],
  spent: 'වියදම',
  income: 'ආදායම',
  net: 'ශේෂය',
  expense: 'වියදම',
  prevMonth: 'පෙර මාසය',
  nextMonth: 'ඊළඟ මාසය',
  settings: 'සැකසුම්',
  add: 'එක් කරන්න',
  empty: 'මේ මාසයේ තවම කිසිවක් නැත. එක් කිරීමට + ඔබන්න.',
  backupBanner: 'ඔබේ දත්ත ඇත්තේ මෙම දුරකථනයේ පමණි. උපස්ථයක් සුරැකීමට ඔබන්න.',
  language: 'භාෂාව',
  currency: 'මුදල් සංකේතය',
  saveBackup: 'උපස්ථයක් සුරකින්න (JSON)',
  exportCSV: 'පැතුරුම්පතක් ලෙස අපනයනය (CSV)',
  restore: 'උපස්ථයෙන් ප්‍රතිසාධනය කරන්න',
  lastBackup: (date) => `අවසන් උපස්ථය ${date}.`,
  noBackup: 'තවම උපස්ථයක් නැත.',
  privacy: 'ඔබ අපනයනය නොකරන්නේ නම් ඔබේ දත්ත මෙම දුරකථනයෙන් පිටතට නොයයි.',
  done: 'හරි',
  note: 'සටහන (අවශ්‍ය නම්)',
  tapToSave: 'සුරැකීමට ප්‍රවර්ගයක් ඔබන්න',
  enterAmount: 'මුදල ඇතුළත් කර ප්‍රවර්ගයක් ඔබන්න',
  delete: 'මකන්න',
  imported: (n) => `ගනුදෙනු ${n}ක් ආයාත කළා.`,
  notBackup: 'මෙය Pocket Ledger උපස්ථ ගොනුවක් නොවේ.',
  invalidTx: 'උපස්ථයේ වලංගු නොවන ගනුදෙනුවක් ඇත.',
  unreadable: 'එම ගොනුව කියවිය නොහැක.',
  carried: 'ගෙන ආ',
  carryPrompt: (from, amount, to) => `${from} මාසය ${amount} ශේෂයකින් අවසන් විය. එය ${to} මාසයට ගෙන යන්නද?`,
  carryYes: 'ගෙන යන්න',
  carryNo: 'එපා',
  carryLink: (amount, to) => `${amount} ${to} මාසයට ගෙන යන්න`,
  carriedFrom: (from) => `${from} ශේෂය`,
  carryBack: (from, amount) => `${from} ශේෂය (${amount}) ගෙන එන්න`,
  deleted: 'මකා දැමුවා',
  undo: 'අහෝසි කරන්න',
  removeCarry: 'මෙම ගෙන ආ ශේෂය ඉවත් කරන්නද?',
  categories: {
    carry: 'ගෙන ආ ශේෂය',
    food: 'ආහාර', transport: 'ප්‍රවාහනය', bills: 'බිල්පත්', shopping: 'සාප්පු සවාරි', health: 'සෞඛ්‍යය',
    fun: 'විනෝදය', other: 'වෙනත්', salary: 'වැටුප', gift: 'තෑගි', 'other-in': 'වෙනත්',
  },
};

export const STRINGS: Record<Lang, Strings> = { en, si };

/** Sinhala if the phone is set to Sinhala, otherwise English. */
export function detectLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('si') ? 'si' : 'en';
}

/** "October 2026" / "2026 ඔක්තෝබර්" for a month key like "2026-10". */
export function monthTitle(key: string, t: Strings): string {
  const [y, m] = key.split('-').map(Number);
  if (t.months) return `${y} ${t.months[m - 1]}`;
  return new Date(y, m - 1, 1).toLocaleDateString(t.locale, { month: 'long', year: 'numeric' });
}

/** "Wed, Oct 14" / "ඔක්තෝබර් 14, බදාදා" for a date like "2026-10-14". */
export function dayLabel(date: string, t: Strings): string {
  const d = new Date(date + 'T00:00');
  if (t.months && t.weekdays) return `${t.months[d.getMonth()]} ${d.getDate()}, ${t.weekdays[d.getDay()]}`;
  return d.toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "October" / "ඔක්තෝබර්" for a month key like "2026-10". */
export function monthName(key: string, t: Strings): string {
  const [y, m] = key.split('-').map(Number);
  return t.months ? t.months[m - 1] : new Date(y, m - 1, 1).toLocaleDateString(t.locale, { month: 'long' });
}

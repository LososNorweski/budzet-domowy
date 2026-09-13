import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "budzet.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (month) REFERENCES months(month) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#6366f1',
    icon TEXT NOT NULL DEFAULT '💸',
    UNIQUE(month, name),
    FOREIGN KEY (month) REFERENCES months(month) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    category_name TEXT NOT NULL,
    title TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (month) REFERENCES months(month) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cushion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    target REAL NOT NULL DEFAULT 0,
    current REAL NOT NULL DEFAULT 0
  );
`);

db.prepare(
  "INSERT OR IGNORE INTO cushion (id, target, current) VALUES (1, 0, 0)"
).run();

const DEFAULT_CATEGORIES = [
  { name: "Mieszkanie", amount: 0, color: "#ef4444", icon: "🏠" },
  { name: "Jedzenie", amount: 0, color: "#f59e0b", icon: "🍞" },
  { name: "Transport", amount: 0, color: "#10b981", icon: "🚌" },
  { name: "Rachunki", amount: 0, color: "#3b82f6", icon: "💡" },
  { name: "Rozrywka", amount: 0, color: "#a855f7", icon: "🎬" },
  { name: "Oszczędności", amount: 0, color: "#22d3ee", icon: "🐷" },
];

export function ensureMonth(month) {
  const existing = db
    .prepare("SELECT id FROM months WHERE month = ?")
    .get(month);
  if (!existing) {
    const info = db
      .prepare("INSERT INTO months (month) VALUES (?)")
      .run(month);
    const insert = db.prepare(
      "INSERT INTO categories (month, name, amount, color, icon) VALUES (?, ?, ?, ?, ?)"
    );
    for (const c of DEFAULT_CATEGORIES) {
      insert.run(month, c.name, c.amount, c.color, c.icon);
    }
    return info.lastInsertRowid;
  }
  return existing.id;
}

export function currentMonth() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${m}`;
}

export function previousMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

export function getMonthData(month) {
  ensureMonth(month);
  const incomes = db
    .prepare("SELECT * FROM incomes WHERE month = ? ORDER BY id")
    .all(month);
  const categories = db
    .prepare("SELECT * FROM categories WHERE month = ? ORDER BY id")
    .all(month);
  const months = db
    .prepare("SELECT month FROM months ORDER BY month")
    .all()
    .map((r) => r.month);

  const expenses = db
    .prepare(
      "SELECT * FROM expenses WHERE month = ? ORDER BY date DESC, id DESC"
    )
    .all(month);

  const colorByName = Object.fromEntries(
    categories.map((c) => [c.name, { color: c.color, icon: c.icon }])
  );

  const spentByName = {};
  for (const e of expenses) {
    spentByName[e.category_name] =
      (spentByName[e.category_name] || 0) + e.amount;
  }

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalPlanned = categories.reduce((s, c) => s + c.amount, 0);
  const totalActual = expenses.reduce((s, e) => s + e.amount, 0);

  const categoriesWithSpending = categories.map((c) => ({
    ...c,
    spent: spentByName[c.name] || 0,
    remaining: c.amount - (spentByName[c.name] || 0),
  }));

  const cushion = db
    .prepare("SELECT target, current FROM cushion WHERE id = 1")
    .get();

  return {
    month,
    totalIncome,
    totalPlanned,
    totalActual,
    remaining: totalIncome - totalActual,
    savings: totalIncome - totalPlanned,
    incomes,
    categories: categoriesWithSpending,
    expenses: expenses.map((e) => ({
      ...e,
      color: colorByName[e.category_name]?.color || "#64748b",
      icon: colorByName[e.category_name]?.icon || "💸",
    })),
    cushion,
    months,
  };
}

export const insertIncome = db.prepare(
  "INSERT INTO incomes (month, name, amount) VALUES (?, ?, ?)"
);
export const updateIncome = db.prepare(
  "UPDATE incomes SET name = ?, amount = ? WHERE id = ?"
);
export const deleteIncome = db.prepare("DELETE FROM incomes WHERE id = ?");

export const insertCategory = db.prepare(
  "INSERT INTO categories (month, name, amount, color, icon) VALUES (?, ?, ?, ?, ?)"
);
export const updateCategory = db.prepare(
  "UPDATE categories SET name = ?, amount = ?, color = ?, icon = ? WHERE id = ?"
);
export const deleteCategory = db.prepare(
  "DELETE FROM categories WHERE id = ?"
);

export const insertExpense = db.prepare(
  "INSERT INTO expenses (month, category_name, title, amount, date) VALUES (?, ?, ?, ?, ?)"
);
export const updateExpense = db.prepare(
  "UPDATE expenses SET category_name = ?, title = ?, amount = ?, date = ? WHERE id = ?"
);
export const deleteExpense = db.prepare("DELETE FROM expenses WHERE id = ?");

export const setCushionTarget = db.prepare(
  "UPDATE cushion SET target = ? WHERE id = 1"
);
export const transactCushion = db.prepare(
  "UPDATE cushion SET current = MAX(0, current + ?) WHERE id = 1"
);

export default db;
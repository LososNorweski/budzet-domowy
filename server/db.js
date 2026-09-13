import Database from "better-sqlite3";
import crypto from "crypto";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "budzet.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(month, user_id)
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    user_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#6366f1',
    icon TEXT NOT NULL DEFAULT '💸',
    user_id INTEGER,
    UNIQUE(month, name, user_id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    category_name TEXT NOT NULL,
    title TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cushion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_id INTEGER UNIQUE,
    target REAL NOT NULL DEFAULT 0,
    current REAL NOT NULL DEFAULT 0
  );
`);

function ensureColumn(table, column, ddl) {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

for (const t of ["months", "incomes", "categories", "expenses", "cushion"]) {
  ensureColumn(t, "user_id", "INTEGER");
}

const SESSION_SECRET = process.env.SESSION_SECRET || "budzet-domowy-sekret";

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function registerUser(username, password) {
  if (!username || !password || password.length < 4) {
    const err = new Error("Hasło musi mieć co najmniej 4 znaki");
    err.status = 400;
    throw err;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const pass_hash = hashPassword(password, salt);
  try {
    const info = db
      .prepare("INSERT INTO users (username, salt, pass_hash) VALUES (?, ?, ?)")
      .run(String(username), salt, pass_hash);
    const userId = info.lastInsertRowid;
    adoptOrphanData(userId);
    return { id: userId, username, pass_hash };
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const err = new Error("Taka nazwa użytkownika już istnieje");
      err.status = 400;
      throw err;
    }
    throw e;
  }
}

export function loginUser(username, password) {
  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(String(username));
  if (!user) return null;
  if (hashPassword(password, user.salt) !== user.pass_hash) return null;
  return { id: user.id, username: user.username, pass_hash: user.pass_hash };
}

export function makeToken(user) {
  const digest = crypto
    .createHash("sha256")
    .update(`${SESSION_SECRET}:${user.id}:${user.pass_hash}`)
    .digest("hex");
  return `${user.id}.${digest}`;
}

export function userForToken(token) {
  if (!token || typeof token !== "string") return null;
  const [idStr, digest] = token.split(".");
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(idStr));
  if (!user) return null;
  const expected = crypto
    .createHash("sha256")
    .update(`${SESSION_SECRET}:${user.id}:${user.pass_hash}`)
    .digest("hex");
  if (digest !== expected) return null;
  return { id: user.id, username: user.username, pass_hash: user.pass_hash };
}

function adoptOrphanData(userId) {
  for (const t of ["months", "incomes", "categories", "expenses", "cushion"]) {
    db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`).run(userId);
  }
}

const DEFAULT_CATEGORIES = [
  { name: "Mieszkanie", amount: 0, color: "#ef4444", icon: "🏠" },
  { name: "Jedzenie", amount: 0, color: "#f59e0b", icon: "🍞" },
  { name: "Transport", amount: 0, color: "#10b981", icon: "🚌" },
  { name: "Rachunki", amount: 0, color: "#3b82f6", icon: "💡" },
  { name: "Rozrywka", amount: 0, color: "#a855f7", icon: "🎬" },
  { name: "Oszczędności", amount: 0, color: "#22d3ee", icon: "🐷" },
];

function ensureCushion(userId) {
  db.prepare(
    "INSERT OR IGNORE INTO cushion (id, user_id, target, current) VALUES (1, ?, 0, 0)"
  ).run(userId);
}

export function ensureMonth(month, userId) {
  ensureCushion(userId);
  const existing = db
    .prepare("SELECT id FROM months WHERE month = ? AND user_id = ?")
    .get(month, userId);
  if (!existing) {
    const info = db
      .prepare("INSERT INTO months (month, user_id) VALUES (?, ?)")
      .run(month, userId);
    const insert = db.prepare(
      "INSERT INTO categories (month, name, amount, color, icon, user_id) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const c of DEFAULT_CATEGORIES) {
      insert.run(month, c.name, c.amount, c.color, c.icon, userId);
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

export function getMonthData(month, userId) {
  ensureMonth(month, userId);
  const incomes = db
    .prepare("SELECT * FROM incomes WHERE month = ? AND user_id = ? ORDER BY id")
    .all(month, userId);
  const categories = db
    .prepare(
      "SELECT * FROM categories WHERE month = ? AND user_id = ? ORDER BY id"
    )
    .all(month, userId);
  const months = db
    .prepare("SELECT month FROM months WHERE user_id = ? ORDER BY month")
    .all(userId)
    .map((r) => r.month);

  const expenses = db
    .prepare(
      "SELECT * FROM expenses WHERE month = ? AND user_id = ? ORDER BY date DESC, id DESC"
    )
    .all(month, userId);

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

  const cushion =
    db
      .prepare("SELECT target, current FROM cushion WHERE user_id = ?")
      .get(userId) || { target: 0, current: 0 };

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
  "INSERT INTO incomes (month, name, amount, user_id) VALUES (?, ?, ?, ?)"
);
export const updateIncome = db.prepare(
  "UPDATE incomes SET name = ?, amount = ? WHERE id = ? AND user_id = ?"
);
export const deleteIncome = db.prepare(
  "DELETE FROM incomes WHERE id = ? AND user_id = ?"
);

export const insertCategory = db.prepare(
  "INSERT INTO categories (month, name, amount, color, icon, user_id) VALUES (?, ?, ?, ?, ?, ?)"
);
export const updateCategory = db.prepare(
  "UPDATE categories SET name = ?, amount = ?, color = ?, icon = ? WHERE id = ? AND user_id = ?"
);
export const deleteCategory = db.prepare(
  "DELETE FROM categories WHERE id = ? AND user_id = ?"
);

export const insertExpense = db.prepare(
  "INSERT INTO expenses (month, category_name, title, amount, date, user_id) VALUES (?, ?, ?, ?, ?, ?)"
);
export const updateExpense = db.prepare(
  "UPDATE expenses SET category_name = ?, title = ?, amount = ?, date = ? WHERE id = ? AND user_id = ?"
);
export const deleteExpense = db.prepare(
  "DELETE FROM expenses WHERE id = ? AND user_id = ?"
);

export const setCushionTarget = db.prepare(
  "UPDATE cushion SET target = ? WHERE user_id = ?"
);
export const transactCushion = db.prepare(
  "UPDATE cushion SET current = MAX(0, current + ?) WHERE user_id = ?"
);

export default db;
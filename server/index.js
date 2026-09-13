import express from "express";
import { existsSync as pathExistsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import {
  currentMonth,
  previousMonth,
  getMonthData,
  registerUser,
  loginUser,
  makeToken,
  userForToken,
  insertIncome,
  updateIncome,
  deleteIncome,
  insertCategory,
  updateCategory,
  deleteCategory,
  insertExpense,
  updateExpense,
  deleteExpense,
  setCushionTarget,
  transactCushion,
} from "./db.js";

const app = express();
app.use(express.json());

app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Podaj nazwę i hasło" });
  }
  try {
    const user = registerUser(username, password);
    res.json({ token: makeToken(user), username: user.username });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = loginUser(username || "", password || "");
  if (!user) {
    return res.status(401).json({ error: "Zła nazwa użytkownika lub hasło" });
  }
  res.json({ token: makeToken(user), username: user.username });
});

app.use("/api", (req, res, next) => {
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = userForToken(token);
  if (!user) {
    return res.status(401).json({ error: "Zaloguj się, aby kontynuować" });
  }
  req.user = user;
  next();
});

app.get("/api/me", (req, res) => {
  res.json({ username: req.user.username });
});

app.get("/api/months/:month", (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "Nieprawidłowy format miesiąca" });
  }
  res.json(getMonthData(month, req.user.id));
});

app.post("/api/incomes", (req, res) => {
  const { month, name, amount } = req.body || {};
  if (!month || !name || amount == null || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  const info = insertIncome.run(
    String(month),
    String(name),
    Number(amount),
    req.user.id
  );
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/incomes/:id", (req, res) => {
  const { name, amount } = req.body || {};
  if (!name || amount == null || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  updateIncome.run(String(name), Number(amount), req.params.id, req.user.id);
  res.json({ ok: true });
});

app.delete("/api/incomes/:id", (req, res) => {
  deleteIncome.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post("/api/categories", (req, res) => {
  const { month, name, amount, color, icon } = req.body || {};
  if (!month || !name) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  const info = insertCategory.run(
    month,
    String(name),
    Number(amount || 0),
    String(color || "#6366f1"),
    String(icon || "💸"),
    req.user.id
  );
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/categories/:id", (req, res) => {
  const { name, amount, color, icon } = req.body || {};
  if (!name || amount == null || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  updateCategory.run(
    String(name),
    Number(amount),
    String(color || "#6366f1"),
    String(icon || "💸"),
    req.params.id,
    req.user.id
  );
  res.json({ ok: true });
});

app.delete("/api/categories/:id", (req, res) => {
  deleteCategory.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post("/api/expenses", (req, res) => {
  const { month, category_name, title, amount, date } = req.body || {};
  if (
    !month ||
    !category_name ||
    !title ||
    amount == null ||
    isNaN(Number(amount)) ||
    !date
  ) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  const info = insertExpense.run(
    String(month),
    String(category_name),
    String(title),
    Number(amount),
    String(date),
    req.user.id
  );
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/expenses/:id", (req, res) => {
  const { category_name, title, amount, date } = req.body || {};
  if (
    !category_name ||
    !title ||
    amount == null ||
    isNaN(Number(amount)) ||
    !date
  ) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  updateExpense.run(
    String(category_name),
    String(title),
    Number(amount),
    String(date),
    req.params.id,
    req.user.id
  );
  res.json({ ok: true });
});

app.delete("/api/expenses/:id", (req, res) => {
  deleteExpense.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.put("/api/cushion", (req, res) => {
  const { target } = req.body || {};
  if (target == null || isNaN(Number(target)) || Number(target) < 0) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  setCushionTarget.run(Number(target), req.user.id);
  res.json({ ok: true });
});

app.post("/api/cushion/transact", (req, res) => {
  const { amount } = req.body || {};
  if (amount == null || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Brak wymaganych danych" });
  }
  transactCushion.run(Number(amount), req.user.id);
  res.json({ ok: true });
});

const port = process.env.PORT || 3001;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "client", "dist");
if (pathExistsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Aplikacja działa na http://localhost:${port}`);
});
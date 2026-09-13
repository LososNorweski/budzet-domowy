import { useEffect, useState } from "react";

const MONTHS_PL = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_PL[m - 1]} ${y}`;
}

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPL(n) {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function pln(n) {
  return `${formatPL(n)} zł`;
}

function todayISO() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return 29;
  return DAYS_IN_MONTH[m - 1];
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Błąd serwera");
  return data;
}

function IncomeRow({ income, onUpdate, onDelete }) {
  const [name, setName] = useState(income.name);
  const [amount, setAmount] = useState(String(income.amount));
  const [editing, setEditing] = useState(false);

  async function save() {
    await onUpdate(income.id, name, +amount);
    setEditing(false);
  }

  return (
    <li className="income-row">
      {editing ? (
        <>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button className="btn btn-small btn-primary" onClick={save}>
            Zapisz
          </button>
          <button
            className="btn btn-small"
            onClick={() => {
              setEditing(false);
              setName(income.name);
              setAmount(String(income.amount));
            }}
          >
            Anuluj
          </button>
        </>
      ) : (
        <>
          <span className="income-name">{income.name}</span>
          <span className="income-amount">{pln(income.amount)}</span>
          <span className="row-actions">
            <button className="btn btn-small" onClick={() => setEditing(true)}>
              Edytuj
            </button>
            <button
              className="btn btn-small btn-danger"
              onClick={() => onDelete(income.id)}
            >
              Usuń
            </button>
          </span>
        </>
      )}
    </li>
  );
}

function CategoryCard({ category, onUpdate, onDelete }) {
  const [amount, setAmount] = useState(String(category.amount));
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  async function save() {
    setSaving(true);
    await onUpdate(category.id, name, +amount);
    setSaving(false);
    setEditing(false);
  }

  const over = category.spent > category.amount && category.amount > 0;

  return (
    <div
      className="category-card"
      style={{ borderTop: `4px solid ${category.color}` }}
    >
      <div className="category-head">
        <span className="category-icon">{category.icon}</span>
        {editing ? (
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          <span className="category-name">{category.name}</span>
        )}
        <span className="category-amount">{pln(category.amount)}</span>
      </div>
      {!editing && (
        <div className="category-spend">
          <div className="category-spend-top">
            <span className={over ? "text-danger" : "text-muted"}>
              wydane: {pln(category.spent)}
            </span>
            <span className="text-muted">zostało: {pln(category.remaining)}</span>
          </div>
          {category.amount > 0 && (
            <div className="minibar">
              <div
                className={`minibar-fill ${over ? "minibar-over" : ""}`}
                style={{
                  width: `${Math.min(100, (category.spent / category.amount) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}
      {editing ? (
        <div className="category-edit">
          <input
            className="input amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            className="btn btn-small btn-primary"
            onClick={save}
            disabled={saving}
          >
            Zapisz
          </button>
          <button className="btn btn-small" onClick={() => setEditing(false)}>
            Anuluj
          </button>
        </div>
      ) : (
        <div className="category-actions">
          <button className="btn btn-small" onClick={() => setEditing(true)}>
            Edytuj plan
          </button>
          <button
            className="btn btn-small btn-danger"
            onClick={() => onDelete(category.id)}
          >
            Usuń
          </button>
        </div>
      )}
    </div>
  );
}

function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) {
    return <div className="chart-empty">Brak wydatków w tym miesiącu 📭</div>;
  }

  const R = 100;
  const C = 110;
  let acc = 0;
  const arcs = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const start = acc / total;
      acc += d.value;
      const end = acc / total;
      const sx = C + R * Math.cos(2 * Math.PI * start - Math.PI / 2);
      const sy = C + R * Math.sin(2 * Math.PI * start - Math.PI / 2);
      const ex = C + R * Math.cos(2 * Math.PI * end - Math.PI / 2);
      const ey = C + R * Math.sin(2 * Math.PI * end - Math.PI / 2);
      const large = end - start > 0.5 ? 1 : 0;
      return {
        ...d,
        path: `M ${C} ${C} L ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey} Z`,
      };
    });

  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 220 220" className="pie-svg">
        {arcs.map((a) => (
          <path key={a.label} d={a.path} fill={a.color} />
        ))}
        <text x={C} y={C - 4} textAnchor="middle" className="pie-center">
          {pln(total)}
        </text>
        <text x={C} y={C + 18} textAnchor="middle" className="pie-center-sub">
          wydatki
        </text>
      </svg>
      <ul className="pie-legend">
        {arcs.map((a) => (
          <li key={a.label}>
            <span
              className="legend-dot"
              style={{ background: a.color }}
            />
            <span className="legend-label">{a.label}</span>
            <span className="legend-value">
              {pln(a.value)} · {((a.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CushionPanel({ cushion, onSetTarget, onTransact }) {
  const [target, setTarget] = useState(String(cushion.target || ""));
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const pct =
    cushion.target > 0
      ? Math.min(100, (cushion.current / cushion.target) * 100)
      : 0;

  async function saveTarget(e) {
    e.preventDefault();
    setBusy(true);
    await onSetTarget(+target || 0);
    setBusy(false);
  }

  async function transact(a) {
    setBusy(true);
    await onTransact(a);
    setBusy(false);
    setAmount("");
  }

  return (
    <section className="panel cushion-panel">
      <h2>🐷 Poduszka finansowa</h2>
      <div className="cushion-main">
        <div className="cushion-numbers">
          <span className="stat-value positive">{pln(cushion.current)}</span>
          <span className="text-muted">z {pln(cushion.target)} celu</span>
        </div>
        <div className="progress">
          <div
            className="progress-fill positive"
            style={{ width: `${pct}%` }}
          />
        </div>
        {cushion.target > 0 ? (
          <p className="stat-hint">
            Uzbierane: {pct.toFixed(0)}%{" "}
            {cushion.current >= cushion.target && "🎉 cel osiągnięty!"}
          </p>
        ) : (
          <p className="stat-hint">
            Ustaw cel, np. 3 × miesięczne wydatki na czarną godzinę.
          </p>
        )}
      </div>
      <form className="add-form" onSubmit={saveTarget}>
        <input
          className="input amount"
          type="number"
          step="0.01"
          placeholder="Cel (zł)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button className="btn btn-small" disabled={busy}>
          Ustaw cel
        </button>
      </form>
      <div className="cushion-actions">
        <input
          className="input amount"
          type="number"
          step="0.01"
          placeholder="Kwota (zł)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="btn btn-small btn-primary"
          disabled={busy || !+amount}
          onClick={() => transact(+amount)}
        >
          Wpłać
        </button>
        <button
          className="btn btn-small"
          disabled={busy || !+amount}
          onClick={() => transact(-+amount)}
        >
          Wypłać
        </button>
      </div>
      <div className="cushion-quick">
        <button className="btn btn-small" onClick={() => transact(100)}>
          +100
        </button>
        <button className="btn btn-small" onClick={() => transact(200)}>
          +200
        </button>
        <button className="btn btn-small" onClick={() => transact(500)}>
          +500
        </button>
      </div>
    </section>
  );
}

function AddExpenseForm({ month, categories, onAdd }) {
  const [category, setCategory] = useState(categories[0]?.name || "");
  const [title, setitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => {
    const t = todayISO();
    return t.startsWith(month) ? t : `${month}-01`;
  });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !+amount) return;
    setBusy(true);
    await onAdd(category, title.trim(), +amount, date);
    setBusy(false);
    setitle("");
    setAmount("");
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <select
        className="input category-select"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>
      <input
        className="input"
        placeholder="Co to za wydatek?"
        value={title}
        onChange={(e) => setitle(e.target.value)}
      />
      <input
        className="input amount"
        type="number"
        step="0.01"
        placeholder="Kwota"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input
        className="input date-input"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <button className="btn btn-primary" disabled={busy}>
        Dodaj
      </button>
    </form>
  );
}

function ExpenseRow({ expense, categories, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState(String(expense.amount));
  const [date, setDate] = useState(expense.date);
  const [category, setCategory] = useState(expense.category_name);

  const categoryNames = categories.map((c) => c.name);
  const options = categoryNames.includes(category)
    ? categoryNames
    : [category, ...categoryNames];

  async function save() {
    await onUpdate(expense.id, category, title.trim(), +amount, date);
    setEditing(false);
  }

  return (
    <li className="expense-row">
      {editing ? (
        <>
          <select
            className="input category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="input date-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="btn btn-small btn-primary" onClick={save}>
            Zapisz
          </button>
          <button className="btn btn-small" onClick={() => setEditing(false)}>
            Anuluj
          </button>
        </>
      ) : (
        <>
          <span className="expense-date">{expense.date.slice(5)}</span>
          <span className="expense-cat" style={{ color: expense.color }}>
            {expense.icon}
          </span>
          <span className="expense-title">{expense.title}</span>
          <span className="expense-amount">{pln(expense.amount)}</span>
          <span className="row-actions">
            <button className="btn btn-small" onClick={() => setEditing(true)}>
              Edytuj
            </button>
            <button
              className="btn btn-small btn-danger"
              onClick={() => onDelete(expense.id)}
            >
              Usuń
            </button>
          </span>
        </>
      )}
    </li>
  );
}

function Summary({ data }) {
  const { totalIncome, totalPlanned, totalActual, remaining } = data;
  const planUsedPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  let dailyHint = "";
  const [y, m] = data.month.split("-").map(Number);
  const now = new Date();
  const isCurrent =
    now.getFullYear() === y && now.getMonth() + 1 === m;
  if (isCurrent) {
    const daysLeft = Math.max(
      1,
      daysInMonth(data.month) - now.getDate() + 1
    );
    dailyHint = ` wygląda, że ${pln(remaining / daysLeft)}/dzień do końca miesiąca`;
  }

  return (
    <section className="summary">
      <div className="stat-card">
        <span className="stat-label">Dochody</span>
        <span className="stat-value income">{pln(totalIncome)}</span>
        <span className="stat-hint">plan wydatków: {pln(totalPlanned)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Wydatki w tym miesiącu</span>
        <span className="stat-value planned">{pln(totalActual)}</span>
        <span className="stat-hint">
          z planu zostało {pln(Math.max(0, totalPlanned - totalActual))}
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Pozostało do wydania</span>
        <span className={`stat-value ${remaining >= 0 ? "positive" : "negative"}`}>
          {pln(remaining)}
        </span>
        <span className="stat-hint">
          dochody − wydatki{dailyHint}
        </span>
      </div>
      <div className="stat-card stat-card-wide">
        <span className="stat-label">Wykorzystany plan wydatków</span>
        <div className="progress">
          <div
            className={`progress-fill ${planUsedPct > 100 ? "negative" : "positive"}`}
            style={{ width: `${Math.min(100, planUsedPct)}%` }}
          />
        </div>
        <span className="stat-hint">
          wydano {planUsedPct.toFixed(0)}% z planowanego budżetu
          {remaining >= 0
            ? " — spokojnie, jesteś na plusie 🎉"
            : " — przekraczasz dochody, czas ograniczyć wydatki!"}
        </span>
      </div>
    </section>
  );
}

export default function App() {
  const [currentMonth, setCurrentMonth] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!currentMonth) setCurrentMonth(cm);

  useEffect(() => {
    if (!currentMonth) return;
    setError("");
    api(`/api/months/${currentMonth}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [currentMonth]);

  async function refresh() {
    setError("");
    const d = await api(`/api/months/${currentMonth}`);
    setData(d);
  }

  const monthFocused = currentMonth === cm;
  const chartData = data
    ? Object.entries(
        data.expenses.reduce((acc, e) => {
          acc[e.category_name] = (acc[e.category_name] || 0) + e.amount;
          return acc;
        }, {})
      ).map(([label, value]) => ({
        label,
        value,
        color:
          data.categories.find((c) => c.name === label)?.color || "#64748b",
      }))
    : [];

  const expensesByCategory = data
    ? data.categories
        .map((c) => ({
          ...c,
          items: data.expenses.filter((e) => e.category_name === c.name),
        }))
        .filter((c) => c.amount > 0 || c.items.length > 0)
    : [];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-icon">🏦</span>
          <h1>Budżet domowy</h1>
        </div>
        <div className="month-nav">
          <button
            className="btn"
            onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}
          >
            ‹
          </button>
          <span className="month-label">{monthLabel(currentMonth)}</span>
          <button
            className="btn"
            onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))}
          >
            ›
          </button>
          {!monthFocused && (
            <button className="btn btn-primary" onClick={() => setCurrentMonth(cm)}>
              Dzisiaj
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {data && (
        <>
          <Summary data={data} />

          <div className="columns">
            <div className="column">
              <section className="panel">
                <h2>Dochody</h2>
                {data.incomes.length === 0 && (
                  <p className="empty">Dodaj swoje dochody, np. pensję.</p>
                )}
                <ul className="income-list">
                  {data.incomes.map((inc) => (
                    <IncomeRow
                      key={inc.id}
                      income={inc}
                      onUpdate={async (id, name, amount) => {
                        await api(`/api/incomes/${id}`, {
                          method: "PUT",
                          body: JSON.stringify({ name, amount }),
                        });
                        await refresh();
                      }}
                      onDelete={async (id) => {
                        await api(`/api/incomes/${id}`, { method: "DELETE" });
                        await refresh();
                      }}
                    />
                  ))}
                </ul>
                <div className="panel-foot">
                  <AddIncomeForm
                    month={currentMonth}
                    onAdd={async (name, amount) => {
                      await api("/api/incomes", {
                        method: "POST",
                        body: JSON.stringify({
                          month: currentMonth,
                          name,
                          amount,
                        }),
                      });
                      await refresh();
                    }}
                  />
                </div>
              </section>

              <CushionPanel
                cushion={data.cushion}
                onSetTarget={async (target) => {
                  await api("/api/cushion", {
                    method: "PUT",
                    body: JSON.stringify({ target }),
                  });
                  await refresh();
                }}
                onTransact={async (amount) => {
                  await api("/api/cushion/transact", {
                    method: "POST",
                    body: JSON.stringify({ amount }),
                  });
                  await refresh();
                }}
              />
            </div>

            <div className="column">
              <section className="panel">
                <h2>Wydatki według kategorii</h2>
                <PieChart data={chartData} />
              </section>
            </div>
          </div>

          <div className="columns">
            <section className="panel">
              <h2>Plan wydatków</h2>
              <div className="category-grid">
                {data.categories.map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    onUpdate={async (id, name, amount) => {
                      await api(`/api/categories/${id}`, {
                        method: "PUT",
                        body: JSON.stringify({ name, amount }),
                      });
                      await refresh();
                    }}
                    onDelete={async (id) => {
                      await api(`/api/categories/${id}`, { method: "DELETE" });
                      await refresh();
                    }}
                  />
                ))}
              </div>
              <div className="panel-foot">
                <AddCategoryForm
                  month={currentMonth}
                  onAdd={async (name, amount, icon) => {
                    await api("/api/categories", {
                      method: "POST",
                      body: JSON.stringify({
                        month: currentMonth,
                        name,
                        amount,
                        icon,
                      }),
                    });
                    await refresh();
                  }}
                />
              </div>
            </section>

            <section className="panel">
              <h2>Wydatki</h2>
              <div className="panel-foot no-border">
                <AddExpenseForm
                  month={currentMonth}
                  categories={data.categories}
                  onAdd={async (category, title, amount, date) => {
                    await api("/api/expenses", {
                      method: "POST",
                      body: JSON.stringify({
                        month: currentMonth,
                        category_name: category,
                        title,
                        amount,
                        date,
                      }),
                    });
                    await refresh();
                  }}
                />
              </div>
              {expensesByCategory.length === 0 && (
                <p className="empty">
                  Dodaj pierwsze wydatki, aby śledzić, ile faktycznie wydajesz.
                </p>
              )}
              {expensesByCategory.map((c) => (
                <div key={c.id} className="expense-group">
                  <div className="expense-group-head">
                    <span className="category-icon">{c.icon}</span>
                    <span className="expense-group-name">{c.name}</span>
                    <span
                      className={`expense-group-sum ${
                        c.spent > c.amount && c.amount > 0
                          ? "text-danger"
                          : ""
                      }`}
                    >
                      {pln(c.spent)}
                      {c.amount > 0 && <> / {pln(c.amount)}</>}
                    </span>
                    <span
                      className={`expense-group-left ${
                        c.remaining >= 0 ? "text-positive" : "text-danger"
                      }`}
                    >
                      {c.remaining >= 0 ? `zostało ${pln(c.remaining)}` : `przekroczone o ${pln(-c.remaining)}`}
                    </span>
                  </div>
                  <ul className="expense-list">
                    {c.items.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        categories={data.categories}
                        onUpdate={async (id, category, title, amount, date) => {
                          await api(`/api/expenses/${id}`, {
                            method: "PUT",
                            body: JSON.stringify({
                              category_name: category,
                              title,
                              amount,
                              date,
                            }),
                          });
                          await refresh();
                        }}
                        onDelete={async (id) => {
                          await api(`/api/expenses/${id}`, { method: "DELETE" });
                          await refresh();
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function AddCategoryForm({ month, onAdd }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [icon, setIcon] = useState("💸");
  const [busy, setBusy] = useState(false);

  const icons = ["💸", "🏠", "🍞", "🚌", "💡", "🎬", "🐷", "💊", "📚", "✈️", "🎁", "⚡"];

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onAdd(name.trim(), +amount || 0, icon);
    setBusy(false);
    setName("");
    setAmount("");
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        className="input"
        placeholder="Nazwa kategorii"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input amount"
        type="number"
        step="0.01"
        placeholder="Kwota"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <select
        className="input icon-select"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
      >
        {icons.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" disabled={busy}>
        Dodaj
      </button>
    </form>
  );
}

function AddIncomeForm({ month, onAdd }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onAdd(name.trim(), +amount || 0);
    setBusy(false);
    setName("");
    setAmount("");
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        className="input"
        placeholder="Nazwa dochodu (np. Pensja)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input amount"
        type="number"
        step="0.01"
        placeholder="Kwota"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button className="btn btn-primary" disabled={busy}>
        Dodaj
      </button>
    </form>
  );
}
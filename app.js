// Ezly Agency: a small insurance agency management MVP (CRM, comparative rater, policies, renewals).
// All data lives in localStorage; carrier rates are simulated.

const CARRIERS = [
  { name: "Summit Mutual", factor: 0.95 },
  { name: "Harbor Insurance", factor: 1.05 },
  { name: "Pinecrest General", factor: 0.9 },
  { name: "Liberty Shield", factor: 1.12 },
  { name: "Crescent Casualty", factor: 1.0 },
];
const BASE = { Auto: 1200, Home: 1500, "Dwelling Fire": 900 };

const store = {
  load() {
    try { return JSON.parse(localStorage.getItem("ezly")) || { clients: [], policies: [] }; }
    catch { return { clients: [], policies: [] }; }
  },
  save() { try { localStorage.setItem("ezly", JSON.stringify(db)); } catch {} },
};
const db = store.load();
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const uid = () => Math.random().toString(36).slice(2, 10);
const clientName = (id) => db.clients.find((c) => c.id === id)?.name ?? "Unknown";
const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);

// Simulated rating: base premium adjusted by age, coverage, deductible and carrier factor.
function rate({ line, age, coverage, deductible }) {
  const ageAdj = age < 25 ? 1.4 : age > 65 ? 1.15 : 1;
  const covAdj = { Basic: 0.8, Standard: 1, Premium: 1.3 }[coverage];
  const dedAdj = 1 - Math.min(deductible, 2500) / 10000;
  return CARRIERS.map((c) => ({
    carrier: c.name,
    premium: Math.round(BASE[line] * ageAdj * covAdj * dedAdj * c.factor),
  })).sort((a, b) => a.premium - b.premium);
}

const views = {
  dashboard() {
    const active = db.policies.filter((p) => daysUntil(p.expires) >= 0);
    const renewals = active.filter((p) => daysUntil(p.expires) <= 60)
      .sort((a, b) => new Date(a.expires) - new Date(b.expires));
    const premium = active.reduce((s, p) => s + p.premium, 0);
    return `
      <div class="grid">
        <div class="card stat"><b>${db.clients.length}</b><span>Clients</span></div>
        <div class="card stat"><b>${active.length}</b><span>Active policies</span></div>
        <div class="card stat"><b>${money(premium)}</b><span>Written premium</span></div>
        <div class="card stat"><b>${renewals.length}</b><span>Renewals in 60 days</span></div>
      </div>
      <div class="card"><h2>Upcoming renewals</h2>
        ${renewals.length ? table(["Client", "Line", "Carrier", "Expires", "Days"],
          renewals.map((p) => [esc(clientName(p.clientId)), p.line, p.carrier, p.expires,
            `<span class="${daysUntil(p.expires) <= 30 ? "due" : ""}">${daysUntil(p.expires)}</span>`]))
          : "<p>No renewals due soon.</p>"}
      </div>`;
  },
  clients() {
    return `
      <div class="card"><h2>Add client</h2>
        <form id="clientForm">
          <label>Name<input name="name" required></label>
          <label>Email<input name="email" type="email"></label>
          <label>Phone<input name="phone"></label>
          <label>Status<select name="status"><option>Lead</option><option>Prospect</option><option>Customer</option></select></label>
          <button class="primary">Save client</button>
        </form>
      </div>
      <div class="card"><h2>Clients</h2>
        ${db.clients.length ? table(["Name", "Email", "Phone", "Status", "Policies", ""],
          db.clients.map((c) => [esc(c.name), esc(c.email), esc(c.phone), c.status,
            db.policies.filter((p) => p.clientId === c.id).length,
            `<button data-del-client="${c.id}">Delete</button>`]))
          : "<p>No clients yet.</p>"}
      </div>`;
  },
  rater() {
    if (!db.clients.length) return `<div class="card"><p>Add a client first to run quotes.</p></div>`;
    return `
      <div class="card"><h2>Comparative rater</h2>
        <p>Enter the risk once and compare premiums across carriers.</p>
        <form id="raterForm">
          <label>Client<select name="clientId">${db.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
          <label>Line<select name="line">${Object.keys(BASE).map((l) => `<option>${l}</option>`).join("")}</select></label>
          <label>Insured age<input name="age" type="number" min="16" max="100" value="35" required></label>
          <label>Coverage<select name="coverage"><option>Basic</option><option selected>Standard</option><option>Premium</option></select></label>
          <label>Deductible<input name="deductible" type="number" min="0" step="250" value="500"></label>
          <button class="primary">Get quotes</button>
        </form>
      </div>
      <div id="quotes"></div>`;
  },
  policies() {
    return `<div class="card"><h2>Policies</h2>
      ${db.policies.length ? table(["Client", "Line", "Carrier", "Premium", "Effective", "Expires", ""],
        db.policies.map((p) => [esc(clientName(p.clientId)), p.line, p.carrier, money(p.premium), p.effective, p.expires,
          `<button data-renew="${p.id}">Renew</button> <button data-del-policy="${p.id}">Cancel</button>`]))
        : "<p>No policies yet. Bind one from the Quote Rater.</p>"}
    </div>`;
  },
};

function table(headers, rows) {
  return `<div class="scroll"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

let current = "dashboard";
let lastQuote = null;
function render(view = current) {
  current = view;
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("#app").innerHTML = views[view]();
}

const isoDate = (d) => d.toISOString().slice(0, 10);
function addYear(dateStr) { const d = new Date(dateStr); d.setFullYear(d.getFullYear() + 1); return isoDate(d); }

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.view) return render(t.dataset.view);
  if (t.dataset.delClient) {
    db.clients = db.clients.filter((c) => c.id !== t.dataset.delClient);
    db.policies = db.policies.filter((p) => p.clientId !== t.dataset.delClient);
  } else if (t.dataset.delPolicy) {
    db.policies = db.policies.filter((p) => p.id !== t.dataset.delPolicy);
  } else if (t.dataset.renew) {
    const p = db.policies.find((x) => x.id === t.dataset.renew);
    p.effective = p.expires; p.expires = addYear(p.expires);
  } else if (t.dataset.bind) {
    const q = lastQuote.results[+t.dataset.bind];
    const today = isoDate(new Date());
    db.policies.push({ id: uid(), clientId: lastQuote.clientId, line: lastQuote.line, carrier: q.carrier,
      premium: q.premium, effective: today, expires: addYear(today) });
    const c = db.clients.find((x) => x.id === lastQuote.clientId);
    if (c) c.status = "Customer";
    store.save();
    return render("policies");
  } else return;
  store.save();
  render();
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  if (e.target.id === "clientForm") {
    db.clients.push({ id: uid(), ...data });
    store.save();
    render();
  } else if (e.target.id === "raterForm") {
    const results = rate({ line: data.line, age: +data.age, coverage: data.coverage, deductible: +data.deductible || 0 });
    lastQuote = { clientId: data.clientId, line: data.line, results };
    $("#quotes").innerHTML = `<div class="card"><h2>Quotes for ${esc(clientName(data.clientId))} (${data.line})</h2>
      ${table(["Carrier", "Annual premium", "Monthly", ""], results.map((q, i) => [
        `<span class="${i === 0 ? "best" : ""}">${q.carrier}${i === 0 ? " (best)" : ""}</span>`,
        money(q.premium), money(q.premium / 12), `<button data-bind="${i}">Bind</button>`]))}</div>`;
  }
});

render();

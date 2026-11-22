/*
  Freelancer Cash Helper - logic and rendering.

  The top part is plain helper functions (no HTML, no page access),
  so they are easy to read and to test.
  The bottom part draws the screens and handles the #/... routes.
*/

// ---------- Pure helpers ----------

// Money in Indian format: 120000 -> "₹1,20,000", negative -34500 -> "−₹34,500" (minus sign before the rupee symbol)
function formatINR(n) {
  if (n < 0) return "\u2212₹" + Intl.NumberFormat("en-IN").format(-n);
  return "₹" + Intl.NumberFormat("en-IN").format(n);
}

// Short money for chart axes: 150000 -> "₹1.5L", 50000 -> "₹50K", -34500 -> "−₹35K"
function formatShortINR(n) {
  const sign = n < 0 ? "\u2212" : "";
  const a = Math.abs(n);
  if (a >= 100000) return sign + "₹" + String(Math.round(a / 10000) / 10) + "L";
  if (a >= 1000) return sign + "₹" + Math.round(a / 1000) + "K";
  return sign + "₹" + Math.round(a);
}

// Date in Indian English: "12 Mar 2025"
function formatDate(date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// "2025-03-12" -> Date at midnight (local time)
function parseISODate(text) {
  const p = text.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

// Date -> "2025-03-12" (used for date inputs and saved paid dates)
function toISODate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + mm + "-" + dd;
}

// Today at midnight (local time)
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Add days to a date (negative goes back in time)
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Amount received so far. A sample invoice with paidOffset is fully paid.
function amountReceived(inv) {
  if (inv.paidOffset !== undefined) return inv.amount;
  return getInvoiceState(inv.key).amountPaid || 0;
}

// Money still owed on an invoice (full amount minus what has been received)
function remainingDue(inv) {
  return inv.amount - amountReceived(inv);
}

// Date an invoice was paid: the recorded date first, else the sample paidOffset (null if not paid)
function paidDateOf(inv, today) {
  const saved = getInvoiceState(inv.key);
  if (saved.paidDate) return parseISODate(saved.paidDate);
  if (inv.paidOffset !== undefined) return addDays(today, inv.paidOffset);
  return null;
}

// Work out an invoice status from its data and any saved changes. Nothing is stored as a status; it is computed each time.
function invoiceStatus(invoice, today) {
  const saved = getInvoiceState(invoice.key);
  if (invoice.draft === true && !saved.sent) return "Draft";
  if (invoice.amount - amountReceived(invoice) <= 0) return "Paid";
  if (amountReceived(invoice) > 0) return "Part-paid";
  const due = addDays(today, invoice.dueOffset);
  if (due < today) return "Overdue";
  return "Unpaid";
}

// Past its due date and still has a balance left (true for overdue and overdue part-paid invoices)
function isPastDue(invoice, today) {
  const due = addDays(today, invoice.dueOffset);
  return remainingDue(invoice) > 0 && due < today;
}

// Unpaid means Unpaid, Overdue or Part-paid (not Draft, not Paid)
function isUnpaid(status) {
  return status === "Unpaid" || status === "Overdue" || status === "Part-paid";
}

// Sum of remaining balances that are still owed (part-paid invoices count only what is left)
function unpaidTotal(invoices, today) {
  return invoices.reduce(function (sum, inv) {
    return isUnpaid(invoiceStatus(inv, today)) ? sum + remainingDue(inv) : sum;
  }, 0);
}

// Sum of draft amounts (not sent yet, so not counted as unpaid)
function draftTotal(invoices, today) {
  return invoices.reduce(function (sum, inv) {
    return invoiceStatus(inv, today) === "Draft" ? sum + inv.amount : sum;
  }, 0);
}

// All invoices of one client, across all projects
function clientInvoices(client) {
  return client.projects.reduce(function (all, p) {
    return all.concat(p.invoices);
  }, []);
}

// ---------- Saved changes (kept in localStorage, separate from the sample data) ----------

// Shape: { invoices: { [invoiceKey]: { sent?: true, amountPaid?: number, paidDate?: "YYYY-MM-DD" } } }
const STORAGE_KEY = "freelancerCashHelper.v1";

// Read saved changes; bad or missing data means start empty
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && parsed.invoices && typeof parsed.invoices === "object") {
      const s = parsed;
      if (s.openingBalance === undefined) s.openingBalance = SAMPLE_DATA.openingCashBalance;
      if (!Array.isArray(s.bills)) s.bills = JSON.parse(JSON.stringify(SAMPLE_DATA.bills));
      return s;
    }
  } catch (e) {
    // Corrupt JSON or storage blocked: fall through to an empty state
  }
  const empty = { invoices: {} };
  empty.openingBalance = SAMPLE_DATA.openingCashBalance;
  empty.bills = JSON.parse(JSON.stringify(SAMPLE_DATA.bills));
  return empty;
}

// Write all saved changes
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Storage full or blocked: the change still works until the page reloads
  }
}

let appState = loadState();

// Saved changes for one invoice (empty object if none)
function getInvoiceState(key) {
  return appState.invoices[key] || {};
}

// Merge new values into one invoice's saved changes, then save
function updateInvoiceState(key, changes) {
  appState.invoices[key] = Object.assign({}, getInvoiceState(key), changes);
  saveState(appState);
}

// Untouched copy of the sample clients, taken before any changes (used to rebuild the data on reset)
const PRISTINE_CLIENTS = JSON.parse(JSON.stringify(SAMPLE_DATA.clients));

// Rebuild SAMPLE_DATA.clients from the sample data plus the clients and projects saved by "Add project", then give every invoice a key.
// Saved shape: appState.newClients = [{ id, name, type }], appState.newProjects = [{ clientId, project }]
function rebuildClientData() {
  if (!Array.isArray(appState.newClients)) appState.newClients = [];
  if (!Array.isArray(appState.newProjects)) appState.newProjects = [];
  SAMPLE_DATA.clients = JSON.parse(JSON.stringify(PRISTINE_CLIENTS));
  appState.newClients.forEach(function (c) {
    SAMPLE_DATA.clients.push({ id: c.id, name: c.name, type: c.type, projects: [] });
  });
  appState.newProjects.forEach(function (np) {
    const client = SAMPLE_DATA.clients.find(function (c) { return c.id === np.clientId; });
    if (client) client.projects.push(JSON.parse(JSON.stringify(np.project)));
  });
  addInvoiceKeys();
}

// Give every sample invoice a stable key: client id | project id | index in the project.
// This only adds a key in memory; data/sample-data.js is not changed.
function addInvoiceKeys() {
  SAMPLE_DATA.clients.forEach(function (c) {
    c.projects.forEach(function (p, pIndex) {
      const projectId = p.id || pIndex;
      p.invoices.forEach(function (inv, i) {
        inv.key = c.id + "|" + projectId + "|" + i;
      });
    });
  });
}

// Find one invoice by its key
function findInvoice(key) {
  let found = null;
  SAMPLE_DATA.clients.forEach(function (c) {
    c.projects.forEach(function (p) {
      p.invoices.forEach(function (inv) {
        if (inv.key === key) found = inv;
      });
    });
  });
  return found;
}

// Clear all saved changes and re-render (asks first)
function resetDemoData() {
  if (!window.confirm("Reset all demo data? Recorded payments and sent marks will be lost.")) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // Nothing to remove
  }
  appState = loadState();
  rebuildClientData();
  render();
}

// Short message shown once at the top of the next screen (for example after a capped payment)
let flashMessage = "";

// ---------- Small HTML helpers ----------

// Escape text before putting it into HTML
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Money as HTML: negative amounts get the "neg" class (shown in red)
function moneyHTML(n) {
  return n < 0 ? '<span class="neg">' + formatINR(n) + "</span>" : formatINR(n);
}

function statusBadge(status) {
  const cls = "badge-" + status.toLowerCase();
  return '<span class="badge ' + cls + '">' + status + "</span>";
}

// Full amount, plus the balance left for part-paid invoices: "₹1,20,000 · ₹60,000 left"
function amountText(inv, status) {
  let text = formatINR(inv.amount);
  if (status === "Part-paid") {
    text += ' <span class="balance-left">· ' + formatINR(remainingDue(inv)) + " left</span>";
  }
  return text;
}

// Buttons for one invoice: "Mark as sent" for drafts, "Record payment" and "Draft reminder" for sent unpaid invoices
function invoiceActions(inv, status, today) {
  const key = escapeHTML(inv.key);
  if (status === "Draft") {
    return '<button type="button" class="btn" data-action="send" data-key="' + key + '">Mark as sent</button>';
  }
  if (isUnpaid(status)) {
    // Draft reminder only when the invoice is due within 14 days (overdue counts as within 14)
    const reminder = inv.dueOffset <= 14
      ? '<button type="button" class="btn" data-action="draft-reminder" data-key="' + key + '">Draft reminder</button>'
      : "";
    return '<button type="button" class="btn btn-primary" data-action="pay" data-key="' + key + '">Record payment</button>' +
      reminder +
      reminderNote(inv, today);
  }
  return "";
}

// One table row for an invoice. prefixCells adds extra leading columns (client, project).
// withActions adds a last "Actions" cell with the buttons for this invoice.
function invoiceRow(inv, today, prefixCells, withActions) {
  const status = invoiceStatus(inv, today);
  const paid = status === "Paid" ? paidDateOf(inv, today) : null;
  const paidText = paid ? formatDate(paid) : "—";
  const rowClass = status === "Overdue" ? ' class="overdue"' : "";
  return (
    "<tr" + rowClass + ">" +
    (prefixCells || "") +
    '<td data-label="Invoice">' + escapeHTML(inv.label) + "</td>" +
    '<td class="num" data-label="Amount">' + amountText(inv, status) + "</td>" +
    '<td data-label="Due date">' + formatDate(addDays(today, inv.dueOffset)) + "</td>" +
    '<td data-label="Status">' + statusBadge(status) + "</td>" +
    '<td data-label="Paid date">' + paidText + "</td>" +
    (withActions ? '<td class="actions" data-label="Actions">' + invoiceActions(inv, status, today) + "</td>" : "") +
    "</tr>"
  );
}

// ---------- Routing ----------

// "#/client/nova" -> { name: "client", id: "nova" }
function parseRoute(hash) {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
  // "#/" and "#/dashboard" are the home page
  if (parts.length === 0 || parts[0] === "dashboard") return { name: "dashboard" };
  if (parts[0] === "invoices") return { name: "invoices" };
  if (parts[0] === "client") return { name: "client", id: parts[1] || "" };
  if (parts[0] === "forecast") return { name: "forecast" };
  if (parts[0] === "pricing") return { name: "pricing" };
  return { name: "clients" };
}

function findClient(id) {
  return SAMPLE_DATA.clients.find(function (c) { return c.id === id; });
}

// ---------- Screens ----------

function renderClientsScreen(today) {
  const clients = SAMPLE_DATA.clients;
  const grandUnpaid = clients.reduce(function (sum, c) {
    return sum + unpaidTotal(clientInvoices(c), today);
  }, 0);

  let html = '<section class="summary">' +
    '<div class="muted">Total unpaid across all clients</div>' +
    '<div class="summary-amount">' + formatINR(grandUnpaid) + "</div>" +
    "</section>";

  html += '<div class="add-row"><button type="button" class="btn btn-primary" data-action="add-project">Add project</button></div>';
  html += '<ul class="card-list">';
  clients.forEach(function (c) {
    const invoices = clientInvoices(c);
    const unpaid = unpaidTotal(invoices, today);
    const drafts = draftTotal(invoices, today);
    const typeLabel = c.type === "agency" ? "Agency" : "Direct";
    const projectCount = c.projects.length + (c.projects.length === 1 ? " project" : " projects");

    html += '<li><a class="client-card card" href="#/client/' + escapeHTML(c.id) + '">' +
      '<div class="client-name">' + escapeHTML(c.name) + "</div>" +
      '<div class="client-meta"><span>' + typeLabel + "</span><span>" + projectCount + "</span></div>" +
      '<div class="client-unpaid">Unpaid: ' + formatINR(unpaid) + "</div>" +
      (drafts > 0 ? '<div class="muted">Draft (not sent): ' + formatINR(drafts) + "</div>" : "") +
      "</a></li>";
  });
  html += "</ul>";
  return html;
}

function renderClientScreen(id, today) {
  const client = findClient(id);
  if (!client) {
    return '<div class="not-found"><h2>Client not found</h2>' +
      '<a href="#/clients">Back to clients</a></div>';
  }

  const typeLabel = client.type === "agency" ? "Agency" : "Direct";
  let html = '<a class="back-link" href="#/clients">← Back to clients</a>' +
    '<div class="client-heading"><h2>' + escapeHTML(client.name) + "</h2>" +
    '<div class="muted">' + typeLabel + "</div></div>";

  client.projects.forEach(function (p) {
    const projectUnpaid = unpaidTotal(p.invoices, today);
    const projectDrafts = draftTotal(p.invoices, today);

    html += '<section class="project">' +
      '<div class="project-head"><h3>' + escapeHTML(p.name) + "</h3>" +
      "<span>Project total: " + formatINR(p.total) + "</span></div>" +
      '<div class="table-wrap"><table>' +
      "<thead><tr><th>Invoice</th><th>Amount</th><th>Due date</th><th>Status</th><th>Paid date</th><th>Actions</th></tr></thead>" +
      "<tbody>";
    p.invoices.forEach(function (inv) {
      html += invoiceRow(inv, today, "", true);
    });
    html += "</tbody></table></div>" +
      '<div class="project-foot">Unpaid: <strong>' + formatINR(projectUnpaid) + "</strong>" +
      (projectDrafts > 0 ? '<div class="muted">Draft (not sent): ' + formatINR(projectDrafts) + "</div>" : "") +
      "</div></section>";
  });

  const clientUnpaid = unpaidTotal(clientInvoices(client), today);
  html += '<div class="summary"><div class="muted">Client unpaid total</div>' +
    '<div class="summary-amount">' + formatINR(clientUnpaid) + "</div></div>";
  return html;
}

function renderInvoicesScreen(today) {
  let html = '<div class="table-wrap"><table>' +
    "<thead><tr><th>Client</th><th>Project</th><th>Invoice</th><th>Amount</th>" +
    "<th>Due date</th><th>Status</th><th>Paid date</th></tr></thead><tbody>";

  SAMPLE_DATA.clients.forEach(function (c) {
    c.projects.forEach(function (p) {
      p.invoices.forEach(function (inv) {
        const prefix = '<td data-label="Client">' + escapeHTML(c.name) + '</td><td data-label="Project">' + escapeHTML(p.name) + "</td>";
        html += invoiceRow(inv, today, prefix);
      });
    });
  });

  html += "</tbody></table></div>";
  return html;
}

// ---------- Pricing ----------

// Static pricing screen: two plan cards and one note (buttons are not wired up yet)
function renderPricingScreen() {
  return '<h2 class="dash-title">Pricing</h2>' +
    '<section class="pricing-cards">' +
    '<div class="card pricing-card"><h3>Free</h3>' +
    '<div class="pricing-price">₹0</div>' +
    '<ul class="pricing-list">' +
    "<li>Up to 3 active projects</li><li>Cash forecast</li><li>Reminders</li>" +
    "</ul>" +
    '<button type="button" class="btn" disabled>Current plan</button></div>' +
    '<div class="card pricing-card"><h3>Pro</h3>' +
    '<div class="pricing-price">₹499 <span class="muted">per month</span></div>' +
    '<ul class="pricing-list">' +
    "<li>Unlimited projects</li><li>WhatsApp reminders</li><li>What-if scenarios</li>" +
    "</ul>" +
    '<button type="button" class="btn btn-primary" disabled>Coming soon</button></div>' +
    "</section>" +
    '<p class="muted pricing-note">Built for freelancers who lose sleep over late payments.</p>';
}

// ---------- Dashboard ----------

// Whole days from today to a date (negative = the date is in the past)
function daysFromToday(date, today) {
  return Math.round((date - today) / 86400000);
}

// "1 day", "5 days"
function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

// Short due text: red "X days overdue", "due today" or "due in X days"
function dueNote(dueIn) {
  if (dueIn < 0) return '<span class="overdue-text">' + plural(-dueIn, "day") + " overdue</span>";
  if (dueIn === 0) return "due today";
  return "due in " + plural(dueIn, "day");
}

// Every invoice in the app as one flat list, with its client, project, status and due date
function dashboardRows(today) {
  const rows = [];
  SAMPLE_DATA.clients.forEach(function (c) {
    c.projects.forEach(function (p) {
      p.invoices.forEach(function (inv) {
        const due = addDays(today, inv.dueOffset);
        rows.push({
          client: c,
          project: p,
          invoice: inv,
          status: invoiceStatus(inv, today),
          due: due,
          dueIn: daysFromToday(due, today)
        });
      });
    });
  });
  return rows;
}

// Sum of remaining balances for the rows where test(row) is true (drafts have nothing received, so this is the full amount)
function sumRows(rows, test) {
  return rows.reduce(function (sum, r) {
    return test(r) ? sum + remainingDue(r.invoice) : sum;
  }, 0);
}

// Unpaid, part-paid and overdue invoices grouped by client, sorted for the "Who owes me" list
function owedGroups(rows) {
  const groups = [];
  rows.forEach(function (r) {
    if (!isUnpaid(r.status)) return;
    let g = groups.find(function (x) { return x.client.id === r.client.id; });
    if (!g) {
      g = { client: r.client, rows: [], total: 0, worstOverdue: 0, earliestDueIn: Infinity };
      groups.push(g);
    }
    g.rows.push(r);
    g.total += remainingDue(r.invoice);
    g.worstOverdue = Math.max(g.worstOverdue, -r.dueIn);
    g.earliestDueIn = Math.min(g.earliestDueIn, r.dueIn);
  });

  // Invoices inside a card: earliest due date first
  groups.forEach(function (g) {
    g.rows.sort(function (a, b) { return a.dueIn - b.dueIn; });
  });

  // Cards: clients with overdue invoices first (most overdue first), then the rest by earliest due date
  groups.sort(function (a, b) {
    const aOver = a.worstOverdue > 0;
    const bOver = b.worstOverdue > 0;
    if (aOver !== bOver) return aOver ? -1 : 1;
    if (aOver) return b.worstOverdue - a.worstOverdue;
    return a.earliestDueIn - b.earliestDueIn;
  });
  return groups;
}

// One summary card: label, big value, small note (value and note must already be escaped)
function dashCard(label, value, note) {
  return '<div class="summary dash-card card stat-card"><div class="muted">' + escapeHTML(label) + "</div>" +
    '<div class="summary-amount stat-num" data-countup>' + value + "</div>" +
    '<div class="muted">' + note + "</div></div>";
}

// The four summary cards at the top of the dashboard
function renderDashboardCards(rows, today) {
  const totalOwed = sumRows(rows, function (r) { return isUnpaid(r.status); });
  const overdue = sumRows(rows, function (r) { return isUnpaid(r.status) && isPastDue(r.invoice, today); });
  const notSent = sumRows(rows, function (r) { return r.status === "Draft"; });

  // Biggest client share: the client with the largest unpaid total
  let top = null;
  SAMPLE_DATA.clients.forEach(function (c) {
    const owed = unpaidTotal(clientInvoices(c), today);
    if (top === null || owed > top.owed) top = { client: c, owed: owed };
  });
  const share = top && totalOwed > 0 ? Math.round(top.owed / totalOwed * 100) : 0;
  const topName = top ? escapeHTML(top.client.name) : "—";
  const topOwed = top ? top.owed : 0;

  return '<section class="dash-cards">' +
    dashCard("Total owed", formatINR(totalOwed), "Unpaid and overdue invoices") +
    dashCard("Overdue", formatINR(overdue), "Past their due date") +
    dashCard("Not yet sent", formatINR(notSent), "Draft invoices") +
    dashCard("Biggest client share", topName, formatINR(topOwed) + " · " + share + "% of total owed") +
    "</section>";
}

// One "Who owes me" card: client name (link), total owed, then one row per unpaid invoice
function owedCard(g, today) {
  let html = '<li class="owe-card card"><div class="owe-head">' +
    '<a class="owe-name" href="#/client/' + escapeHTML(g.client.id) + '">' + escapeHTML(g.client.name) + "</a>" +
    (g.worstOverdue > 0 ? '<span class="pill-late">' + plural(g.worstOverdue, "day") + " overdue</span>" : "") +
    '<span class="owe-total amount-lg">' + formatINR(g.total) + "</span></div>" +
    '<ul class="owe-rows">';
  g.rows.forEach(function (r) {
    html += '<li class="owe-row"><div class="owe-line">' +
      "<span>" + escapeHTML(r.project.name) + " · " + escapeHTML(r.invoice.label) + "</span>" +
      '<strong class="num">' + amountText(r.invoice, r.status) + "</strong></div>" +
      '<div class="muted">' + formatDate(r.due) + " · " + dueNote(r.dueIn) + "</div>" +
      '<div class="owe-actions">' + invoiceActions(r.invoice, r.status, today) + "</div></li>";
  });
  return html + "</ul></li>";
}

// "Not yet sent" table: one row per draft invoice (stacks into cards on phones)
function draftsTable(rows) {
  if (rows.length === 0) return '<p class="muted">No drafts.</p>';
  let html = '<div class="table-wrap"><table>' +
    "<thead><tr><th>Client</th><th>Project</th><th>Invoice</th><th>Amount</th><th>Due date</th><th>Actions</th></tr></thead>" +
    "<tbody>";
  rows.forEach(function (r) {
    html += "<tr>" +
      '<td data-label="Client">' + escapeHTML(r.client.name) + "</td>" +
      '<td data-label="Project">' + escapeHTML(r.project.name) + "</td>" +
      '<td data-label="Invoice">' + escapeHTML(r.invoice.label) + "</td>" +
      '<td class="num" data-label="Amount">' + formatINR(r.invoice.amount) + "</td>" +
      '<td data-label="Due date">' + formatDate(r.due) + " · " + dueNote(r.dueIn) + "</td>" +
      '<td class="actions" data-label="Actions">' + invoiceActions(r.invoice, r.status) + "</td>" +
      "</tr>";
  });
  return html + "</tbody></table></div>";
}

// ---------- Do this today (alerts at the top of the dashboard) ----------

// Most alerts shown before "Show all" is clicked
const ALERT_LIMIT = 5;
// Set by the "Show all" button: show every alert
let showAllAlerts = false;

// "Draft reminder" button for one invoice
function draftReminderButton(key) {
  return '<button type="button" class="btn btn-secondary" data-action="draft-reminder" data-key="' + escapeHTML(key) + '">Draft reminder</button>';
}

// Build the alerts for today, most urgent first. Each alert: { tone, text (HTML, already escaped), button (HTML), reminded }
function buildAlerts(rows, today) {
  const alerts = [];
  const receipts = forecastReceipts(today);
  const cash = cashToday();
  const series = forecastSeries(cash, receipts, appState.bills, today, 90);
  const stats = forecastStats(series, cash);
  const firstNeg = stats.firstNegative;

  // Sent invoices that are past their due date and still owe money
  const overdueRows = rows.filter(function (r) {
    const sent = r.invoice.draft !== true || !!getInvoiceState(r.invoice.key).sent;
    return sent && isUnpaid(r.status) && isPastDue(r.invoice, today);
  });

  // 1. Cash goes below zero within the 90-day forecast
  if (firstNeg) {
    alerts.push({
      tone: "danger",
      kind: "cash",
      text: "Cash goes below zero on " + formatDate(firstNeg.date) + " (in " + plural(firstNeg.offset, "day") + "). " +
        "Lowest: " + formatINR(stats.lowest.value) + " on " + formatDate(stats.lowest.date) + ".",
      button: '<a class="btn btn-primary" href="#/forecast">See forecast</a>'
    });

    // 2. The smallest overdue invoice whose full payment today keeps cash above zero for all 90 days
    let best = null;
    overdueRows.forEach(function (r) {
      const amount = remainingDue(r.invoice);
      const others = receipts.filter(function (x) { return x.key !== r.invoice.key; });
      const check = forecastStats(forecastSeries(cash + amount, others, appState.bills, today, 90), cash + amount);
      if (check.firstNegative === null && (best === null || amount < best.amount)) {
        best = { row: r, amount: amount, lowest: check.lowest.value };
      }
    });
    if (best) {
      alerts.push({
        tone: "warn",
        kind: "chase-first",
        text: "Chase " + escapeHTML(best.row.client.name) + " first: if their " + formatINR(best.amount) +
          " is paid today, your cash stays above zero (lowest " + formatINR(best.lowest) + ").",
        button: draftReminderButton(best.row.invoice.key)
      });
    }
  }

  // 3. One alert per overdue sent invoice, most days overdue first
  overdueRows
    .slice()
    .sort(function (a, b) { return a.dueIn - b.dueIn; })
    .forEach(function (r) {
      const reminded = getInvoiceState(r.invoice.key).lastReminded === toISODate(today);
      alerts.push({
        tone: "warn",
        kind: "overdue",
        text: "Chase " + escapeHTML(r.client.name) + " today: " + formatINR(remainingDue(r.invoice)) +
          " is " + plural(-r.dueIn, "day") + " overdue." +
          (reminded ? ' <span class="muted">Reminded today</span>' : ""),
        button: draftReminderButton(r.invoice.key),
        reminded: reminded
      });
    });

  // 4. Draft invoices due within the next 14 days
  rows
    .filter(function (r) { return r.status === "Draft" && r.dueIn >= 0 && r.dueIn <= 14; })
    .sort(function (a, b) { return a.dueIn - b.dueIn; })
    .forEach(function (r) {
      alerts.push({
        tone: "info",
        kind: "draft",
        text: escapeHTML(r.client.name) + "'s " + formatINR(r.invoice.amount) +
          " invoice is still a draft and is due in " + plural(r.dueIn, "day") + ".",
        button: '<button type="button" class="btn btn-secondary" data-action="send" data-key="' + escapeHTML(r.invoice.key) + '">Mark as sent</button>'
      });
    });

  // Cards marked "Reminded today" move to the end
  return alerts.filter(function (a) { return !a.reminded; })
    .concat(alerts.filter(function (a) { return a.reminded; }));
}

// The "Do this today" section: heading, up to ALERT_LIMIT cards, and a "Show all" button when there are more
function renderAlerts(rows, today) {
  const all = buildAlerts(rows, today);
  const shown = showAllAlerts ? all : all.slice(0, ALERT_LIMIT);
  let html = '<section class="alerts"><h2 class="dash-title">Do this today</h2>';
  if (all.length === 0) html += '<p class="muted">Nothing needs doing today.</p>';
  // Badge colour and icon per alert kind (white stroke icons, 20px)
  const look = {
    "cash": { badge: "red", icon: '<polyline points="3,7 9,13 13,9 21,17"/><polyline points="15,17 21,17 21,11"/>' },
    "chase-first": { badge: "amber", icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
    "overdue": { badge: "violet", icon: '<circle cx="12" cy="12" r="9"/><polyline points="12,7 12,12 15,14"/>' },
    "draft": { badge: "blue", icon: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>' }
  };
  shown.forEach(function (a) {
    const k = look[a.kind] || look["draft"];
    const icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + k.icon + "</svg>";
    html += '<div class="alert-card alert-row alert-' + a.tone + '">' +
      '<span class="alert-badge ' + k.badge + '" aria-hidden="true">' + icon + "</span>" +
      '<p class="alert-text">' + a.text + "</p>" +
      '<div class="alert-actions">' + a.button + "</div></div>";
  });
  if (all.length > ALERT_LIMIT && !showAllAlerts) {
    html += '<button type="button" class="btn btn-secondary alert-more" data-action="alerts-show-all">Show all</button>';
  }
  return html + "</section>";
}

// Hero card for the dashboard: end-of-period cash, lowest balance and date, and a small line chart of the same forecast series
function heroCardHTML(today) {
  const receipts = forecastReceipts(today);
  const cash = cashToday();
  const series = forecastSeries(cash, receipts, appState.bills, today, forecastDays);
  const stats = forecastStats(series, cash);
  const lowest = stats.lowest;
  let svg = "";
  if (series.length > 1) {
    const vals = series.map(function (d) { return d.balance; });
    const lo = Math.min.apply(null, vals);
    const span = (Math.max.apply(null, vals) - lo) || 1;
    const pts = series.map(function (d, i) {
      const x = (i * 300 / (series.length - 1)).toFixed(1);
      const y = (70 - (d.balance - lo) / span * 60).toFixed(1);
      return x + "," + y;
    }).join(" ");
    svg = '<svg class="hero-chart" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '"></polyline></svg>';
  }
  return '<div class="card hero-card"><div class="muted hero-label">Cash at the end of the period</div>' +
    '<div class="hero-amount">' + moneyHTML(stats.end) + "</div>" +
    '<span class="hero-pill">Lowest ' + formatINR(lowest.value) + " · " + formatDate(lowest.date) + "</span>" +
    svg + "</div>";
}

function renderDashboardScreen(today) {
  const rows = dashboardRows(today);
  // Small grey note about the sample data, above everything else
  let html = '<p class="muted sample-note">Sample data for Kabir, a freelance designer in India. Use \'Reset demo data\' to restore.</p>';
  html += '<div class="dash-hero-row">' + heroCardHTML(today) + renderDashboardCards(rows, today) + "</div>";
  html += renderAlerts(rows, today);
  html += '<div class="add-row"><button type="button" class="btn btn-primary" data-action="add-project">Add project</button></div>';

  // Who owes me: unpaid, part-paid and overdue invoices, one card per client
  html += '<h2 class="dash-title">Who owes me</h2>';
  const groups = owedGroups(rows);
  if (groups.length === 0) {
    html += '<div class="summary muted">Nobody owes you anything right now.</div>';
  } else {
    html += '<ul class="owe-list">';
    groups.forEach(function (g) { html += owedCard(g, today); });
    html += "</ul>";
  }

  // Not yet sent: draft invoices
  html += '<h2 class="dash-title">Not yet sent</h2>';
  html += draftsTable(rows.filter(function (r) { return r.status === "Draft"; }));

  // Reset button at the bottom of the dashboard
  html += '<div class="reset-row"><button type="button" class="btn" data-action="reset">Reset demo data</button></div>';
  return html;
}

// ---------- Record payment and mark as sent ----------

// The payment form (a <dialog>), built once at startup
let paymentKey = null; // invoice key the open form is for

function buildPaymentDialog() {
  document.body.insertAdjacentHTML("beforeend",
    '<dialog id="payment-dialog" class="payment-dialog">' +
    '<form id="payment-form" class="payment-form" novalidate>' +
    "<h2>Record payment</h2>" +
    '<p class="muted" id="payment-info"></p>' +
    '<label>Amount received (₹)<input type="number" id="payment-amount" min="1" step="any" inputmode="decimal"></label>' +
    '<label>Date received<input type="date" id="payment-date"></label>' +
    '<p class="form-error" id="payment-error" role="alert" hidden></p>' +
    '<div class="form-actions">' +
    '<button type="submit" class="btn btn-primary">Save payment</button>' +
    '<button type="button" class="btn" id="payment-cancel">Cancel</button>' +
    "</div></form></dialog>");

  document.getElementById("payment-form").addEventListener("submit", submitPayment);
  document.getElementById("payment-cancel").addEventListener("click", function () {
    paymentKey = null;
    document.getElementById("payment-dialog").close();
  });
}

// Open the form, pre-filled with the balance still due and today's date
function openPaymentDialog(key) {
  const inv = findInvoice(key);
  if (!inv) return;
  paymentKey = key;
  document.getElementById("payment-info").textContent =
    inv.label + " · " + formatINR(remainingDue(inv)) + " still due";
  document.getElementById("payment-amount").value = remainingDue(inv);
  document.getElementById("payment-date").value = toISODate(startOfToday());
  document.getElementById("payment-error").textContent = "";
  document.getElementById("payment-error").hidden = true;
  document.getElementById("payment-dialog").showModal();
}

// Save the payment: add to amount received, cap at the balance, mark Paid when fully covered
function submitPayment(event) {
  event.preventDefault();
  const inv = findInvoice(paymentKey);
  if (!inv) return;

  const amountInput = document.getElementById("payment-amount");
  const dateInput = document.getElementById("payment-date");
  const errorBox = document.getElementById("payment-error");

  const entered = Number(amountInput.value);
  if (amountInput.value.trim() === "" || !(entered > 0)) {
    errorBox.textContent = "Enter an amount greater than 0.";
    errorBox.hidden = false;
    return;
  }
  if (!dateInput.value) {
    errorBox.textContent = "Choose the date received.";
    errorBox.hidden = false;
    return;
  }

  // Cap at the balance still due: no overpayment is stored
  const left = remainingDue(inv);
  const received = Math.min(entered, left);
  const total = amountReceived(inv) + received;
  const changes = { amountPaid: total };
  if (total >= inv.amount) changes.paidDate = dateInput.value;
  updateInvoiceState(paymentKey, changes);

  flashMessage = entered > left
    ? "The amount was more than the balance due, so only " + formatINR(left) + " was recorded."
    : "";

  paymentKey = null;
  document.getElementById("payment-dialog").close();
  render();
}

// Mark a draft invoice as sent, then re-render
function markAsSent(key) {
  updateInvoiceState(key, { sent: true });
  render();
}

// ---------- Draft payment reminders (plain-text templates, no AI, no network) ----------

// Saved "Last reminded" note for one invoice, e.g. "Last reminded: 3 days ago" (empty if never)
function reminderNote(inv, today) {
  const last = getInvoiceState(inv.key).lastReminded;
  if (!last) return "";
  const days = Math.round((today - parseISODate(last)) / 86400000);
  const text = days <= 0 ? "today" : plural(days, "day") + " ago";
  return '<span class="muted reminder-note">Last reminded: ' + text + "</span>";
}

// Tone by timing: "heads-up" (not yet due), "nudge" (1-14 days overdue), "firm" (15+ days overdue)
function reminderTone(dueIn) {
  if (dueIn < -14) return "firm";
  if (dueIn < 0) return "nudge";
  return "heads-up";
}

// Build the plain-text message for one invoice
function buildReminderMessage(client, project, inv, today) {
  const due = addDays(today, inv.dueOffset);
  const dueIn = daysFromToday(due, today);
  const tone = reminderTone(dueIn);
  const what = "the payment for " + project.name + ", " + inv.label;
  const amount = formatINR(remainingDue(inv));
  let body;
  if (tone === "heads-up") {
    body = "I hope you're doing well. This is a friendly heads-up that " + what +
      " is due on " + formatDate(due) + ". The amount due is " + amount + ".";
  } else if (tone === "nudge") {
    body = "I hope you're doing well. Just a friendly reminder that " + what +
      " was due on " + formatDate(due) + " and is now " + plural(-dueIn, "day") + " overdue. " +
      "The amount outstanding is " + amount + ". Could you please arrange payment when you get a moment? Thank you.";
  } else {
    body = "This is a follow-up on " + what + ", which was due on " + formatDate(due) +
      " and is now " + plural(-dueIn, "day") + " overdue. The outstanding amount is " + amount + ". " +
      "Please arrange payment by " + formatDate(addDays(today, 5)) + ". " +
      "If anything about the invoice needs checking, let me know and I will sort it out quickly.";
  }
  return "Hi " + client.name + ",\n\n" + body + "\n\nThanks,\nKabir";
}

// Find an invoice together with its client and project
function findInvoiceContext(key) {
  let found = null;
  SAMPLE_DATA.clients.forEach(function (c) {
    c.projects.forEach(function (p) {
      p.invoices.forEach(function (inv) {
        if (inv.key === key) found = { client: c, project: p, invoice: inv };
      });
    });
  });
  return found;
}

// The reminder panel (a <dialog>), built once at startup
let reminderKey = null; // invoice key the open panel is for
let copyTimer = null;

function buildReminderDialog() {
  document.body.insertAdjacentHTML("beforeend",
    '<dialog id="reminder-dialog" class="payment-dialog">' +
    "<h2>Draft reminder</h2>" +
    '<div class="reminder-message" id="reminder-message"></div>' +
    '<div class="form-actions">' +
    '<button type="button" class="btn btn-primary" id="reminder-copy">Copy message</button>' +
    '<button type="button" class="btn btn-primary" id="reminder-whatsapp">Send on WhatsApp</button>' +
    '<button type="button" class="btn" id="reminder-mark">Mark reminder as sent</button>' +
    '<button type="button" class="btn" id="reminder-close">Close</button>' +
    "</div></dialog>");

  document.getElementById("reminder-copy").addEventListener("click", copyReminder);
  document.getElementById("reminder-whatsapp").addEventListener("click", function () {
    const messageText = document.getElementById("reminder-message").textContent;
    window.open("https://wa.me/?text=" + encodeURIComponent(messageText), "_blank", "noopener");
  });
  document.getElementById("reminder-mark").addEventListener("click", markReminderSent);
  document.getElementById("reminder-close").addEventListener("click", function () {
    reminderKey = null;
    document.getElementById("reminder-dialog").close();
  });
}

// Open the panel with the drafted message for one invoice
function openReminderDialog(key) {
  const ctx = findInvoiceContext(key);
  if (!ctx) return;
  reminderKey = key;
  clearTimeout(copyTimer);
  document.getElementById("reminder-copy").textContent = "Copy message";
  document.getElementById("reminder-message").textContent =
    buildReminderMessage(ctx.client, ctx.project, ctx.invoice, startOfToday());
  document.getElementById("reminder-dialog").showModal();
}

// Copy with the Clipboard API, falling back to a selected textarea
function copyText(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone, function () { copyWithTextarea(text, onDone); });
    return;
  }
  copyWithTextarea(text, onDone);
}

function copyWithTextarea(text, onDone) {
  const dialog = document.getElementById("reminder-dialog");
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "absolute";
  area.style.opacity = "0";
  dialog.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) {
    // Copy not allowed here: the button label stays unchanged
  }
  area.remove();
  if (ok) onDone();
}

// Copy the message, then show "Copied" on the button for about 2 seconds
function copyReminder() {
  const button = document.getElementById("reminder-copy");
  const text = document.getElementById("reminder-message").textContent;
  copyText(text, function () {
    button.textContent = "Copied";
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () {
      button.textContent = "Copy message";
      copyTimer = null;
    }, 2000);
  });
}

// Save today's date as the last reminder for this invoice, close the panel, then re-render
function markReminderSent() {
  if (!reminderKey) return;
  updateInvoiceState(reminderKey, { lastReminded: toISODate(startOfToday()) });
  reminderKey = null;
  document.getElementById("reminder-dialog").close();
  render();
}

// One click handler for every [data-action] button (survives re-renders)
function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "pay") openPaymentDialog(button.dataset.key);
  else if (action === "send") markAsSent(button.dataset.key);
  else if (action === "draft-reminder") openReminderDialog(button.dataset.key);
  else if (action === "reset") resetDemoData();
  else if (action === "add-project") openProjectDialog();
  else if (action === "forecast-save-opening") saveOpeningBalance();
  else if (action === "alerts-show-all") {
    showAllAlerts = true;
    render();
  }
  else if (action === "forecast-delete-bill") deleteBill(Number(button.dataset.index));
  else if (action === "forecast-days") {
    forecastDays = Number(button.dataset.days);
    render();
  }
  else if (action === "whatif-clear") {
    whatIfClientId = null;
    whatIfDelay = 15;
    render();
  }
}

// ---------- Add project (a <dialog> built once at startup) ----------

const NEW_CLIENT_CHOICE = "__new__"; // value of the "New client" option

// Short unique id for a new client or project, e.g. "project-lx3k9a2f1"
function newId(prefix) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function buildProjectDialog() {
  document.body.insertAdjacentHTML("beforeend",
    '<dialog id="project-dialog" class="payment-dialog">' +
    '<form id="project-form" class="payment-form" novalidate>' +
    "<h2>Add project</h2>" +
    '<label>Client<select id="project-client"></select></label>' +
    '<div id="project-new-client" hidden>' +
    '<label>New client name<input type="text" id="project-client-name" maxlength="80"></label>' +
    '<label>Client type<select id="project-client-type">' +
    '<option value="agency">Agency</option><option value="direct">Direct</option></select></label>' +
    "</div>" +
    '<label>Project name<input type="text" id="project-name" maxlength="80"></label>' +
    '<label>Total fee (₹)<input type="number" id="project-fee" min="1" step="1" inputmode="numeric"></label>' +
    '<label>Payment split<select id="project-split">' +
    '<option value="three">Three invoices: Deposit, Midway, Final</option>' +
    '<option value="single">Single invoice (100%)</option></select></label>' +
    '<div class="split-fields" id="project-split-fields">' +
    '<label>Deposit %<input type="number" id="split-deposit" min="0" max="100" step="any" inputmode="decimal"></label>' +
    '<label>Midway %<input type="number" id="split-midway" min="0" max="100" step="any" inputmode="decimal"></label>' +
    '<label>Final %<input type="number" id="split-final" min="0" max="100" step="any" inputmode="decimal"></label>' +
    "</div>" +
    '<label><span id="project-deposit-label">Deposit due date</span><input type="date" id="project-deposit-date"></label>' +
    '<div id="project-later-dates">' +
    '<label>Midway due date<input type="date" id="project-midway-date"></label>' +
    '<label>Final due date<input type="date" id="project-final-date"></label>' +
    "</div>" +
    '<label class="check-label"><input type="checkbox" id="project-mark-sent"> Mark invoices as sent now</label>' +
    '<p class="form-error" id="project-error" role="alert" hidden></p>' +
    '<div class="form-actions">' +
    '<button type="submit" class="btn btn-primary">Save project</button>' +
    '<button type="button" class="btn" id="project-cancel">Cancel</button>' +
    "</div></form></dialog>");

  document.getElementById("project-form").addEventListener("submit", submitProject);
  document.getElementById("project-client").addEventListener("change", updateProjectForm);
  document.getElementById("project-split").addEventListener("change", updateProjectForm);
  document.getElementById("project-deposit-date").addEventListener("change", setLaterDates);
  document.getElementById("project-cancel").addEventListener("click", function () {
    document.getElementById("project-dialog").close();
  });
}

// Show the new-client fields only for "New client", and the percentages / later dates only for the three-invoice split
function updateProjectForm() {
  const isNew = document.getElementById("project-client").value === NEW_CLIENT_CHOICE;
  const single = document.getElementById("project-split").value === "single";
  document.getElementById("project-new-client").hidden = !isNew;
  document.getElementById("project-split-fields").hidden = single;
  document.getElementById("project-later-dates").hidden = single;
  document.getElementById("project-deposit-label").textContent = single ? "Due date" : "Deposit due date";
}

// Midway = deposit + 30 days, Final = deposit + 60 days (the user can still edit both)
function setLaterDates() {
  const value = document.getElementById("project-deposit-date").value;
  if (!value) return;
  const deposit = parseISODate(value);
  document.getElementById("project-midway-date").value = toISODate(addDays(deposit, 30));
  document.getElementById("project-final-date").value = toISODate(addDays(deposit, 60));
}

// Open the form with empty fields, the default 40/30/30 split and default dates (deposit today + 7 days)
function openProjectDialog() {
  const clientSelect = document.getElementById("project-client");
  clientSelect.innerHTML = '<option value="">Choose a client…</option>' +
    SAMPLE_DATA.clients.map(function (c) {
      return '<option value="' + escapeHTML(c.id) + '">' + escapeHTML(c.name) + "</option>";
    }).join("") +
    '<option value="' + NEW_CLIENT_CHOICE + '">New client</option>';

  clientSelect.value = "";
  document.getElementById("project-client-name").value = "";
  document.getElementById("project-client-type").value = "agency";
  document.getElementById("project-name").value = "";
  document.getElementById("project-fee").value = "";
  document.getElementById("project-split").value = "three";
  document.getElementById("split-deposit").value = 40;
  document.getElementById("split-midway").value = 30;
  document.getElementById("split-final").value = 30;
  document.getElementById("project-deposit-date").value = toISODate(addDays(startOfToday(), 7));
  setLaterDates();
  document.getElementById("project-mark-sent").checked = false;
  document.getElementById("project-error").textContent = "";
  document.getElementById("project-error").hidden = true;
  updateProjectForm();
  document.getElementById("project-dialog").showModal();
}

// Check the form, then save the client (if new) and the project with its invoices, and open the client page
function submitProject(event) {
  event.preventDefault();
  const errorBox = document.getElementById("project-error");
  function fail(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  const clientChoice = document.getElementById("project-client").value;
  const isNew = clientChoice === NEW_CLIENT_CHOICE;
  const clientName = document.getElementById("project-client-name").value.trim();
  const clientType = document.getElementById("project-client-type").value;
  const projectName = document.getElementById("project-name").value.trim();
  const feeText = document.getElementById("project-fee").value.trim();
  const fee = Number(feeText);
  const single = document.getElementById("project-split").value === "single";
  const sent = document.getElementById("project-mark-sent").checked;
  const depositDate = document.getElementById("project-deposit-date").value;
  const midwayDate = document.getElementById("project-midway-date").value;
  const finalDate = document.getElementById("project-final-date").value;

  if (clientChoice === "") return fail("Choose a client.");
  if (isNew && clientName === "") return fail("Type the new client's name.");
  if (projectName === "") return fail("Enter a project name.");
  if (feeText === "" || !Number.isInteger(fee) || fee <= 0) {
    return fail("Enter the total fee in whole rupees, greater than 0.");
  }

  let pcts = [];
  if (!single) {
    pcts = ["split-deposit", "split-midway", "split-final"].map(function (id) {
      const text = document.getElementById(id).value.trim();
      return text === "" ? NaN : Number(text);
    });
    if (!pcts.every(function (p) { return p > 0 && p <= 100; })) {
      return fail("Enter all three percentages, each greater than 0 and at most 100.");
    }
    const sum = pcts[0] + pcts[1] + pcts[2];
    if (Math.abs(sum - 100) > 0.0001) {
      return fail("The three percentages must add up to 100 (they add up to " + sum + ").");
    }
  }

  if (!depositDate || (!single && (!midwayDate || !finalDate))) {
    return fail(single ? "Choose the due date." : "Choose all three due dates.");
  }

  // Due dates are stored as day offsets from today, like the sample invoices
  const today = startOfToday();
  const offsetOf = function (text) { return daysFromToday(parseISODate(text), today); };
  const projectId = newId("project");
  let invoices;
  if (single) {
    invoices = [{ label: "Single", amount: fee, dueOffset: offsetOf(depositDate) }];
  } else {
    const deposit = Math.round(fee * pcts[0] / 100);
    const midway = Math.round(fee * pcts[1] / 100);
    invoices = [
      { label: "Deposit", amount: deposit, dueOffset: offsetOf(depositDate) },
      { label: "Midway", amount: midway, dueOffset: offsetOf(midwayDate) },
      // Final takes whatever is left, so the three invoices add up to the fee exactly
      { label: "Final", amount: fee - deposit - midway, dueOffset: offsetOf(finalDate) }
    ];
  }
  invoices.forEach(function (inv, i) {
    inv.id = projectId + "-" + (i + 1);
    if (!sent) inv.draft = true;
  });

  const clientId = isNew ? newId("client") : clientChoice;
  const project = { id: projectId, name: projectName, total: fee, invoices: invoices };
  if (!Array.isArray(appState.newClients)) appState.newClients = [];
  if (!Array.isArray(appState.newProjects)) appState.newProjects = [];
  if (isNew) appState.newClients.push({ id: clientId, name: clientName, type: clientType });
  appState.newProjects.push({ clientId: clientId, project: project });
  saveState(appState);
  rebuildClientData();

  document.getElementById("project-dialog").close();
  location.hash = "#/client/" + clientId;
  render();
}

// ---------- Main render ----------

// ---------- Cash forecast helpers (pure: they only read data) ----------

// Sum of every amount recorded through "Record payment" (sample-history payments are not stored, so they are not included)
function recordedPaymentsTotal() {
  return Object.keys(appState.invoices).reduce(function (sum, key) {
    return sum + (appState.invoices[key].amountPaid || 0);
  }, 0);
}

// Cash today: the opening cash balance plus every recorded payment
function cashToday() {
  return appState.openingBalance + recordedPaymentsTotal();
}

// Whole calendar days from one date to another (to - from); ignores time of day
function dayDiff(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

// Next due date of a bill: the saved nextDue date, else today plus dueOffset
function billNextDue(bill, today) {
  if (typeof bill.nextDue === "string") return parseISODate(bill.nextDue);
  return addDays(today, bill.dueOffset || 0);
}

// Average late days per client, based on paid invoices only (paid date minus due date, never below 0)
function clientDelays(today) {
  const result = {};
  const totals = {};
  SAMPLE_DATA.clients.forEach(function (c) {
    result[c.id] = { name: c.name, avg: 0, count: 0 };
    totals[c.id] = { sum: 0, count: 0 };
  });
  SAMPLE_DATA.clients.forEach(function (c) {
    c.projects.forEach(function (p) {
      p.invoices.forEach(function (inv) {
        const paid = paidDateOf(inv, today);
        if (invoiceStatus(inv, today) !== "Paid" || paid === null || remainingDue(inv) > 0) return;
        const due = addDays(today, inv.dueOffset);
        totals[c.id].sum += Math.max(0, dayDiff(due, paid));
        totals[c.id].count += 1;
      });
    });
  });
  Object.keys(result).forEach(function (id) {
    result[id].count = totals[id].count;
    result[id].avg = totals[id].count > 0 ? Math.round(totals[id].sum / totals[id].count) : 0;
  });
  return result;
}

// Expected receipts from sent invoices that are still unpaid or part-paid
function forecastReceipts(today) {
  const delays = clientDelays(today);
  const receipts = [];
  SAMPLE_DATA.clients.forEach(function (c) {
    c.projects.forEach(function (p) {
      p.invoices.forEach(function (inv) {
        const sent = inv.draft !== true || !!getInvoiceState(inv.key).sent;
        if (!sent || !isUnpaid(invoiceStatus(inv, today))) return;
        const remaining = remainingDue(inv);
        if (!(remaining > 0)) return;
        const due = addDays(today, inv.dueOffset);
        let expected = addDays(due, delays[c.id].avg);
        if (dayDiff(today, expected) < 0) expected = addDays(today, 7);
        receipts.push({
          date: expected,
          amount: remaining,
          client: c.name,
          invoice: p.name + " · " + inv.label,
          key: inv.key
        });
      });
    });
  });
  return receipts;
}

// Day-by-day cash balance for today plus `days` more days. Receipts come before bills on the same day.
function forecastSeries(openingBalance, receipts, bills, today, days) {
  const series = [];
  for (let i = 0; i <= days; i++) {
    series.push({ date: addDays(today, i), balance: 0, events: [] });
  }

  receipts.forEach(function (r) {
    const off = dayDiff(today, r.date);
    if (off >= 0 && off <= days) {
      series[off].events.push({ type: "in", label: r.client + " - " + r.invoice, amount: r.amount });
    }
  });

  bills.forEach(function (bill) {
    const first = billNextDue(bill, today);
    if (bill.monthly === true) {
      // Same day of month each month, clamped to the month's last day
      const day = first.getDate();
      let y = first.getFullYear();
      let m = first.getMonth();
      for (;;) {
        const lastDay = new Date(y, m + 1, 0).getDate();
        const occ = new Date(y, m, Math.min(day, lastDay));
        const off = dayDiff(today, occ);
        if (off > days) break;
        if (off >= 0) series[off].events.push({ type: "out", label: bill.name, amount: bill.amount });
        m++;
        if (m > 11) { m = 0; y++; }
      }
    } else {
      const off = dayDiff(today, first);
      if (off >= 0 && off <= days) series[off].events.push({ type: "out", label: bill.name, amount: bill.amount });
    }
  });

  let running = openingBalance;
  series.forEach(function (day) {
    day.events.forEach(function (ev) {
      running += ev.type === "in" ? ev.amount : -ev.amount;
      ev.balance = running;
    });
    day.balance = running;
  });
  return series;
}

// Summary numbers for a forecast series
function forecastStats(series, openingBalance) {
  let lowest = null;
  let firstNegative = null;
  series.forEach(function (day, i) {
    if (lowest === null || day.balance < lowest.value) {
      lowest = { value: day.balance, date: day.date, offset: i };
    }
    if (firstNegative === null && day.balance < 0) {
      firstNegative = { date: day.date, offset: i };
    }
  });
  return {
    today: series.length ? series[0].balance : openingBalance,
    lowest: lowest,
    firstNegative: firstNegative,
    end: series.length ? series[series.length - 1].balance : openingBalance
  };
}

// ---------- Cash forecast screen ----------

// Forecast length in days (30, 60 or 90), set by the period buttons
let forecastDays = 90;

// Per-chart data for the hover readout, rebuilt on every forecast render (index = data-hover on each chart wrapper)
let forecastHoverCharts = [];

// Inline SVG chart of the day-by-day balance. Blue above zero, red below zero (lines split at the zero crossings).
// Optional compareSeries (the normal forecast) is drawn behind as a grey dashed line.
function forecastChartSVG(series, compareSeries) {
  const n = series.length;
  const all = compareSeries ? series.concat(compareSeries) : series;
  let min = 0;
  let max = 0;
  all.forEach(function (d) {
    min = Math.min(min, d.balance);
    max = Math.max(max, d.balance);
  });
  const pad = (max - min) * 0.05 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const xOf = function (i) { return n > 1 ? 10 + i * 880 / (n - 1) : 10; };
  const yOf = function (b) { return 270 - (b - lo) / (hi - lo) * 240; };

  // Points: x, y, and red = below zero
  function pointsOf(s) {
    return s.map(function (d, i) {
      return { x: xOf(i), y: yOf(d.balance), red: d.balance < 0, bal: d.balance };
    });
  }

  // Pieces of line between two points, grouped into runs of one colour
  function runsOf(pts) {
    const runs = [];
    function piece(red, a, b) {
      const last = runs[runs.length - 1];
      if (last && last.red === red && last.pts[last.pts.length - 1] === a) {
        last.pts.push(b);
      } else {
        runs.push({ red: red, pts: [a, b] });
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (p.red === q.red) {
        piece(p.red, p, q);
      } else {
        // Sides differ, so p.bal - q.bal is never 0
        const t = p.bal / (p.bal - q.bal);
        const c = { x: p.x + t * (q.x - p.x), y: yOf(0), red: false, bal: 0 };
        piece(p.red, p, c);
        piece(q.red, c, q);
      }
    }
    return runs;
  }

  const y0 = yOf(0);
  let svg = '<svg class="forecast-chart" style="width:100%;height:auto" viewBox="0 0 900 320" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cash balance by day">';
  svg += '<line x1="10" x2="890" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#666" stroke-width="1.5"></line>';
  svg += '<text x="890" y="' + (y0 - 3).toFixed(1) + '" font-size="12" fill="#8a8f98" text-anchor="end">0</text>';
  // Gradient definitions and a filled area under the main line (closed to the bottom of the plot)
  svg += '<defs><linearGradient id="fcLine" x1="0" x2="1"><stop offset="0" stop-color="#4f2fe8"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>' +
  '<linearGradient id="fcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".25"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>';
  if (n > 0) {
  const areaPts = pointsOf(series);
  let areaD = "M" + areaPts[0].x.toFixed(1) + ",270 ";
  areaPts.forEach(function (p) { areaD += "L" + p.x.toFixed(1) + "," + p.y.toFixed(1) + " "; });
  areaD += "L" + areaPts[n - 1].x.toFixed(1) + ",270 Z";
  svg += '<path d="' + areaD + '" fill="url(#fcArea)" stroke="none"></path>';
  }
  if (compareSeries) {
    const greyPoints = pointsOf(compareSeries).map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
    svg += '<polyline fill="none" stroke-width="2" vector-effect="non-scaling-stroke" stroke="#9ca3af" stroke-dasharray="6 4" points="' + greyPoints + '"></polyline>';
  }
  runsOf(pointsOf(series)).forEach(function (r) {
    const points = r.pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
    if (r.red) {
      svg += '<polyline fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" stroke="#dc2626" points="' + points + '"></polyline>';
    } else {
      svg += '<polyline class="draw-line" style="--len:2000" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" stroke="url(#fcLine)" points="' + points + '"></polyline>';
    }
  });
  // Axis money in short form (₹1.5L, ₹50K); max at the top, min at the bottom, well apart so they never overlap
  svg += '<text x="10" y="18" font-size="12" fill="#8a8f98">' + escapeHTML(formatShortINR(max)) + "</text>";
  svg += '<text x="10" y="288" font-size="12" fill="#8a8f98">' + escapeHTML(formatShortINR(min)) + "</text>";
  if (n > 0) {
    // About 5 date labels spread evenly across the x-axis (fewer if the series is very short)
    const ticks = n > 1 ? 5 : 1;
    for (let k = 0; k < ticks; k++) {
      const idx = ticks > 1 ? Math.round(k * (n - 1) / (ticks - 1)) : 0;
      const anchor = k === 0 ? "start" : (k === ticks - 1 ? "end" : "middle");
      svg += '<text x="' + xOf(idx).toFixed(1) + '" y="312" font-size="12" fill="#8a8f98" text-anchor="' + anchor + '">' + escapeHTML(formatDate(series[idx].date)) + "</text>";
    }
  }
  // Hover overlay: guide line and dot, hidden until the pointer moves over the chart (moved in place by wireForecastHover)
  svg += '<g class="fc-hover-layer" pointer-events="none">' +
    '<line class="fc-guide" x1="0" x2="0" y1="8" y2="272" stroke="#8a8f98" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0"></line>' +
    '<circle class="fc-dot" cx="0" cy="0" r="5" fill="#8b5cf6" stroke="#ffffff" stroke-width="2" opacity="0"></circle></g>';
  svg += "</svg>";

  // Hover data for this chart (read by wireForecastHover once the chart is in the DOM)
  const hoverIndex = forecastHoverCharts.length;
  forecastHoverCharts.push({
    series: series,
    compareSeries: compareSeries || null,
    xs: series.map(function (d, i) { return xOf(i); }),
    ys: series.map(function (d) { return yOf(d.balance); })
  });
  return '<div class="fc-hover" data-hover="' + hoverIndex + '">' + svg + '<div class="fc-tip" aria-hidden="true"></div></div>';
}

// Tooltip contents for one day: date, balance (plus the normal balance for the what-if chart), then that day's events
function forecastTipHTML(info, i) {
  const day = info.series[i];
  const bal = day.balance;
  let html = '<div class="fc-tip-date">' + escapeHTML(formatDate(day.date)) + "</div>" +
    '<div class="fc-tip-bal' + (bal < 0 ? " is-neg" : "") + '">' + escapeHTML(formatINR(bal));
  if (info.compareSeries) {
    html += ' <span class="fc-tip-normal">Normal: ' + escapeHTML(formatINR(info.compareSeries[i].balance)) + "</span>";
  }
  html += "</div>";
  day.events.forEach(function (ev) {
    const isIn = ev.type === "in";
    html += '<div class="fc-tip-ev">' + (isIn ? "Payment in: " : "Bill out: ") + escapeHTML(ev.label) + " " +
      (isIn ? "+" : "\u2212") + escapeHTML(formatINR(ev.amount)) + "</div>";
  });
  return html;
}

// Hover readout on each forecast chart. The guide line, dot and tooltip are updated in place;
// the SVG is never re-rendered, so the draw-in animation is not restarted.
function wireForecastHover() {
  document.querySelectorAll(".fc-hover[data-hover]").forEach(function (wrap) {
    const info = forecastHoverCharts[Number(wrap.dataset.hover)];
    if (!info || info.series.length === 0) return;
    const svg = wrap.querySelector(".forecast-chart");
    const tip = wrap.querySelector(".fc-tip");
    const guide = svg.querySelector(".fc-guide");
    const dot = svg.querySelector(".fc-dot");
    let shown = -1;

    // Day whose x position is closest to a viewBox x
    function nearestDay(vx) {
      let best = 0;
      info.xs.forEach(function (x, i) {
        if (Math.abs(x - vx) < Math.abs(info.xs[best] - vx)) best = i;
      });
      return best;
    }

    function show(event) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const vx = pt.matrixTransform(ctm.inverse()).x;
      const i = nearestDay(vx);
      const x = info.xs[i].toFixed(1);
      guide.setAttribute("x1", x);
      guide.setAttribute("x2", x);
      guide.setAttribute("opacity", "1");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", info.ys[i].toFixed(1));
      dot.setAttribute("fill", info.series[i].balance < 0 ? "#dc2626" : "#8b5cf6");
      dot.setAttribute("opacity", "1");
      if (i !== shown) {
        tip.innerHTML = forecastTipHTML(info, i);
        shown = i;
      }

      // Beside the pointer; flipped to the left if it would pass the right edge of the chart
      const box = wrap.getBoundingClientRect();
      const plot = svg.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const minX = plot.left - box.left;
      const maxX = plot.right - box.left;
      let left = px + 14;
      if (left + w > maxX) left = px - 14 - w;
      left = Math.max(minX, Math.min(left, maxX - w));
      const top = Math.max(0, Math.min(py + 14, box.height - h));
      tip.style.left = left + "px";
      tip.style.top = top + "px";
      tip.classList.add("is-on");
    }

    function hide() {
      guide.setAttribute("opacity", "0");
      dot.setAttribute("opacity", "0");
      tip.classList.remove("is-on");
    }

    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("pointercancel", hide);
  });
}

// ---------- Cash forecast: "What if?" (transient, not saved) ----------

// Client picked in the "What if?" dropdown (null = the client with the largest unpaid total)
let whatIfClientId = null;
// Days later the chosen client pays in the what-if scenario (7, 15 or 30)
let whatIfDelay = 15;

// The client with the largest unpaid total (the first client wins a tie)
function whatIfDefaultClient(today) {
  let top = null;
  let topOwed = 0;
  SAMPLE_DATA.clients.forEach(function (c) {
    const owed = unpaidTotal(clientInvoices(c), today);
    if (top === null || owed > topOwed) {
      top = c;
      topOwed = owed;
    }
  });
  return top;
}

// The client shown in the "What if?" section
function whatIfClient(today) {
  return (whatIfClientId !== null && findClient(whatIfClientId)) || whatIfDefaultClient(today);
}

// Copy of the receipts where one client's invoice receipts are pushed back by `days` (new objects; nothing stored is changed)
function delayReceipts(receipts, client, days) {
  const keys = clientInvoices(client).map(function (inv) { return inv.key; });
  return receipts.map(function (r) {
    if (keys.indexOf(r.key) < 0) return Object.assign({}, r);
    return Object.assign({}, r, { date: addDays(r.date, days) });
  });
}

// Number of days in a forecast series where the balance is below zero
function daysBelowZero(series) {
  return series.filter(function (d) { return d.balance < 0; }).length;
}

// "What if?" section: pickers, comparison table, chart and one plain sentence
function renderWhatIfSection(today, receipts, series, stats) {
  const client = whatIfClient(today);
  if (!client) return "";
  const opening = cashToday();
  const keys = clientInvoices(client).map(function (inv) { return inv.key; });
  const hasReceipts = receipts.some(function (r) { return keys.indexOf(r.key) >= 0; });

  const whatIfSeries = forecastSeries(opening, delayReceipts(receipts, client, whatIfDelay), appState.bills, today, forecastDays);
  const whatIfStats = forecastStats(whatIfSeries, opening);
  const normalBelow = daysBelowZero(series);
  const whatIfBelow = daysBelowZero(whatIfSeries);
  const extra = whatIfBelow - normalBelow;
  const low = stats.lowest;
  const wLow = whatIfStats.lowest;
  const lastDay = series[series.length - 1];
  const wLast = whatIfSeries[whatIfSeries.length - 1];

  // Client dropdown, delay dropdown and clear button
  const clientOptions = SAMPLE_DATA.clients.map(function (c) {
    return '<option value="' + escapeHTML(c.id) + '"' + (c.id === client.id ? " selected" : "") + ">" +
      escapeHTML(c.name) + "</option>";
  }).join("");
  const delayOptions = [7, 15, 30].map(function (d) {
    return '<option value="' + d + '"' + (d === whatIfDelay ? " selected" : "") + ">" + d + " days</option>";
  }).join("");
  let html = '<h2 class="dash-title">What if?</h2>' +
    '<div class="whatif" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;max-width:100%">' +
    '<label>Client<select id="whatif-client">' + clientOptions + "</select></label>" +
    '<label>Client pays later<select id="whatif-delay">' + delayOptions + "</select></label>" +
    '<button type="button" class="btn" data-action="whatif-clear">Clear what-if</button>' +
    "</div>";

  // Plain sentence
  let sentence;
  if (!hasReceipts) {
    sentence = client.name + " has no unpaid invoices, so paying later changes nothing.";
  } else {
    let lowPart;
    if (wLow.value < low.value) {
      lowPart = "falls from " + formatINR(low.value) + " to " + formatINR(wLow.value);
    } else if (wLow.value === low.value) {
      lowPart = "stays at " + formatINR(low.value);
    } else {
      lowPart = "rises from " + formatINR(low.value) + " to " + formatINR(wLow.value);
    }
    let daysPart;
    if (extra > 0) {
      daysPart = "you are below zero for " + extra + (extra === 1 ? " more day" : " more days");
    } else if (extra < 0) {
      daysPart = "you are below zero for " + (-extra) + (extra === -1 ? " fewer day" : " fewer days");
    } else {
      daysPart = "the number of days below zero stays the same";
    }
    sentence = "If " + client.name + " pays " + whatIfDelay + " days later, your lowest balance " + lowPart + " and " + daysPart + ".";
  }
  html += '<p class="whatif-sentence">' + escapeHTML(sentence) + "</p>";

  // Comparison table
  html += '<div class="table-wrap"><table><thead><tr><th></th><th>Normal</th><th>What if?</th></tr></thead><tbody>' +
    "<tr><td>Lowest balance</td>" +
    '<td class="num" data-label="Normal">' + formatINR(low.value) + '<div class="muted">' + formatDate(low.date) + "</div></td>" +
    '<td class="num" data-label="What if?">' + formatINR(wLow.value) + '<div class="muted">' + formatDate(wLow.date) + "</div></td></tr>" +
    "<tr><td>Days below zero</td>" +
    '<td class="num" data-label="Normal">' + normalBelow + "</td>" +
    '<td class="num" data-label="What if?">' + whatIfBelow + "</td></tr>" +
    "<tr><td>Cash at end of period</td>" +
    '<td class="num" data-label="Normal">' + formatINR(lastDay.balance) + "</td>" +
    '<td class="num" data-label="What if?">' + formatINR(wLast.balance) + "</td></tr>" +
    "</tbody></table></div>";

  // Chart: normal (grey dashed) and what-if (solid)
  html += '<p class="muted">Grey dashed line: normal forecast. Solid line: what-if. Red: below zero.</p>';
  html += forecastChartSVG(whatIfSeries, series);
  html += "</div>";
  return html;
}

// Change handler for the "What if?" dropdowns (document-level listener)
function handleWhatIfChange(event) {
  if (event.target.id === "whatif-client") {
    whatIfClientId = event.target.value;
  } else if (event.target.id === "whatif-delay") {
    whatIfDelay = Number(event.target.value);
  } else {
    return;
  }
  render();
}


function renderForecastScreen(today) {
  forecastHoverCharts = [];
  const receipts = forecastReceipts(today);
  const cash = cashToday();
  const series = forecastSeries(cash, receipts, appState.bills, today, forecastDays);
  const stats = forecastStats(series, cash);
  const lastDay = series[series.length - 1];

  // 1. Heading and opening balance
  let html = "<h2>Forecast</h2>" +
    '<section class="summary"><label>Opening cash balance ' +
    '<input type="number" id="forecast-opening" value="' + escapeHTML(appState.openingBalance) + '"></label> ' +
    '<button type="button" class="btn btn-primary" data-action="forecast-save-opening">Save balance</button></section>';

  // 2. Bills list
  html += '<h2 class="dash-title">Bills</h2>' +
    '<div class="table-wrap"><table><thead><tr><th>Bill</th><th>Amount</th><th>Next due</th><th>Repeats</th><th>Actions</th></tr></thead><tbody>';
  appState.bills.forEach(function (bill, i) {
    html += "<tr>" +
      '<td data-label="Bill">' + escapeHTML(bill.name) + "</td>" +
      '<td class="num" data-label="Amount">' + formatINR(bill.amount) + "</td>" +
      '<td data-label="Next due">' + formatDate(billNextDue(bill, today)) + "</td>" +
      '<td data-label="Repeats">' + (bill.monthly === true ? "Monthly" : "One-time") + "</td>" +
      '<td class="actions" data-label="Actions"><button type="button" class="btn" data-action="forecast-delete-bill" data-index="' + i + '">Delete</button></td>' +
      "</tr>";
  });
  html += "</tbody></table></div>";

  // 3. Add bill form
  html += '<form id="forecast-bill-form" class="payment-form">' +
    '<label>Name<input type="text" id="fb-name" required></label>' +
    '<label>Amount (₹)<input type="number" id="fb-amount" required min="1"></label>' +
    '<label>Next due date<input type="date" id="fb-due" required></label>' +
    '<label>Repeats monthly<select id="fb-monthly"><option value="0">no</option><option value="1">yes</option></select></label>' +
    '<div class="form-actions"><button type="submit" class="btn btn-primary">Add bill</button></div>' +
    "</form>";

  // 4. Client payment habits
  const delays = clientDelays(today);
  html += '<h2 class="dash-title">Client payment habits</h2>' +
    '<div class="table-wrap"><table><thead><tr><th>Client</th><th>Average delay</th><th>Paid invoices</th></tr></thead><tbody>';
  Object.keys(delays).forEach(function (id) {
    const d = delays[id];
    const text = d.count === 0
      ? "no history yet"
      : "pays about " + d.avg + " days late (" + d.count + " " + (d.count === 1 ? "invoice" : "invoices") + ")";
    html += "<tr>" +
      '<td data-label="Client">' + escapeHTML(d.name) + "</td>" +
      '<td data-label="Average delay">' + escapeHTML(text) + "</td>" +
      '<td class="num" data-label="Paid invoices">' + d.count + "</td>" +
      "</tr>";
  });
  html += "</tbody></table></div>";

  // 5. Assumption note
  html += '<p class="muted">Assumption: each sent invoice that is unpaid or part-paid counts for its remaining balance. ' +
    "It is expected on its due date plus the client's average past delay, rounded to whole days. " +
    "If that date has already passed, it is assumed paid 7 days from today. Drafts are not counted.</p>";

  // 6. Period toggle
  html += '<div class="add-row">';
  [30, 60, 90].forEach(function (d) {
    const on = forecastDays === d;
    html += '<button type="button" class="btn forecast-toggle-btn' + (on ? " btn-primary" : "") +
      '" data-action="forecast-days" data-days="' + d + '" aria-pressed="' + (on ? "true" : "false") + '">Next ' + d + " days</button>";
  });
  html += "</div>";

  // 8. Summary cards
  const lowest = stats.lowest;
  const firstNeg = stats.firstNegative;
  html += '<div class="forecast-cards">' +
    '<div class="summary"><div class="muted">Cash today</div>' +
    '<div class="summary-amount">' + moneyHTML(cash) + "</div></div>" +
    '<div class="summary"><div class="muted">Lowest balance in this period</div>' +
    '<div class="summary-amount">' + moneyHTML(lowest.value) + "</div>" +
    '<div class="muted">' + formatDate(lowest.date) + " · in " + plural(lowest.offset, "day") + "</div></div>" +
    '<div class="summary"><div class="muted">First day cash goes below zero</div>' +
    '<div class="summary-amount">' + (firstNeg ? formatDate(firstNeg.date) : "never") + "</div>" +
    '<div class="muted">' + (firstNeg ? "in " + plural(firstNeg.offset, "day") : "") + "</div></div>" +
    '<div class="summary"><div class="muted">Cash at the end of the period</div>' +
    '<div class="summary-amount">' + moneyHTML(lastDay.balance) + "</div>" +
    '<div class="muted">' + formatDate(lastDay.date) + "</div></div>" +
    "</div>";

  // 9. Chart
  html += forecastChartSVG(series);

  // 9b. What if? (client pays later)
  html += renderWhatIfSection(today, receipts, series, stats);

  // 10. Upcoming events
  html += '<h2 class="dash-title">Upcoming events</h2><ul class="forecast-events">';
  let anyEvent = false;
  series.forEach(function (day) {
    day.events.forEach(function (ev) {
      anyEvent = true;
      const isIn = ev.type === "in";
      html += "<li>" + formatDate(day.date) + " · " +
        (isIn ? "Money in: " : "Bill out: ") + escapeHTML(ev.label) + " " +
        '<span class="num">' + (isIn ? "+" : "-") + formatINR(ev.amount) + "</span> · " +
        "Balance after: " + moneyHTML(ev.balance) + "</li>";
    });
  });
  if (!anyEvent) html += '<li class="muted">No events in this period.</li>';
  html += "</ul>";
  return html;
}

// Save the opening cash balance (whole rupees, not negative)
function saveOpeningBalance() {
  const input = document.getElementById("forecast-opening");
  appState.openingBalance = Math.max(0, Math.round(Number(input.value)) || 0);
  saveState(appState);
  render();
}

// Remove one bill by its position in appState.bills
function deleteBill(index) {
  appState.bills.splice(index, 1);
  saveState(appState);
  render();
}

// Add a bill from the forecast form (document-level submit listener)
function handleForecastSubmit(event) {
  if (event.target.id !== "forecast-bill-form") return;
  event.preventDefault();
  const name = document.getElementById("fb-name").value.trim();
  const amount = Math.round(Number(document.getElementById("fb-amount").value));
  const due = document.getElementById("fb-due").value;
  const monthly = document.getElementById("fb-monthly").value === "1";
  if (!name || !(amount > 0) || !due) return;
  appState.bills.push({ name: name, amount: amount, nextDue: due, monthly: monthly });
  saveState(appState);
  render();
}



// Count up the summary numbers from 0 to their final value over 1600ms (skipped for reduced motion)
function countUpSummary() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("[data-countup]").forEach(function (el) {
    const finalText = el.textContent;
    const m = finalText.match(/\d[\d,]*(\.\d+)?/);
    if (!m) return;
    const target = Number(m[0].replace(/,/g, ""));
    const decimals = m[1] ? m[1].length - 1 : 0;
    const indian = m[0].indexOf(",") !== -1;
    const prefix = finalText.slice(0, m.index);
    const suffix = finalText.slice(m.index + m[0].length);
    function textAt(v) {
      const s = indian
        ? v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : v.toFixed(decimals);
      return prefix + s + suffix;
    }
    let t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      const p = Math.min(1, (now - t0) / 1600);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? textAt(target * eased) : finalText;
      if (p < 1) requestAnimationFrame(step);
    }
    el.textContent = textAt(0);
    requestAnimationFrame(step);
  });
}

// Staggered rise animation for cards and alert rows (60ms apart)
function staggerReveal() {
  document.querySelectorAll("#app .card, #app .alert-row").forEach(function (el, i) {
    el.style.animationDelay = (i * 60) + "ms";
  });
}

function render() {
  // Empty hash -> go to the dashboard (this fires hashchange again, which renders)
  if (!location.hash) {
    location.hash = "#/dashboard";
    return;
  }

  const today = startOfToday();
  const route = parseRoute(location.hash);
  let html;

  if (route.name === "client") {
    html = renderClientScreen(route.id, today);
  } else if (route.name === "invoices") {
    html = renderInvoicesScreen(today);
  } else if (route.name === "dashboard") {
    html = renderDashboardScreen(today);
  } else if (route.name === "forecast") {
    html = renderForecastScreen(today);
  } else if (route.name === "pricing") {
    html = renderPricingScreen();
  } else {
    html = renderClientsScreen(today);
  }

  // Show a one-time message (shown once, then cleared)
  if (flashMessage) {
    html = '<p class="flash">' + escapeHTML(flashMessage) + "</p>" + html;
    flashMessage = "";
  }

  document.getElementById("app").innerHTML = html;
  wireForecastHover();

  // Highlight the current nav link. "Clients" also covers the client page.
  document.querySelectorAll(".main-nav a").forEach(function (link) {
    const active = link.dataset.route === route.name;
    link.classList.toggle("active", active);
  });

  if (route.name === "dashboard") countUpSummary();
  if (route.name === "dashboard" || route.name === "forecast") staggerReveal();
  document.querySelectorAll(".draw-line").forEach(function (el) {
    el.style.setProperty("--len", String(Math.ceil(el.getTotalLength())));
  });
  window.scrollTo(0, 0);
}

// ---------- Startup ----------
rebuildClientData();
buildPaymentDialog();
buildProjectDialog();
buildReminderDialog();
document.addEventListener("click", handleActionClick);
document.addEventListener("submit", handleForecastSubmit);
document.addEventListener("change", handleWhatIfChange);
window.addEventListener("hashchange", render);
render();

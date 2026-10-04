// ============================================================================
// F. Conisbee & Son — Christmas Orders app
// ============================================================================
// 1. Create a free project at https://supabase.com
// 2. Run supabase_schema.sql then supabase_seed.sql in its SQL Editor
// 3. Project Settings -> API -> copy the Project URL and the "anon public" key
// 4. Paste them below
// ============================================================================
const SUPABASE_URL = "https://itqotgvzqqavarpbmfxl.supabase.co";       // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cW90Z3Z6cXFhdmFycGJtZnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MjI4ODUsImV4cCI6MjEwNjE5ODg4NX0.a_6rcmb1sPzy_OizhWajGiyAbOkIUnK7sysXWROU6p0";      // the long "anon public" key
// ============================================================================

let sb = null;
let currentUser = null;

// In-memory caches, refreshed on load / after writes
let CACHE = {
  customers: [],
  products: [],
  turkeyTiers: [],
  orders: [],        // from order_balances view, joined with customer name
  unassigned: [],
  season: null,      // the current season, e.g. "Christmas 2026" (stored in the settings table)
  viewSeason: null,  // which season the reports show: a season name, or "ALL"
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (SUPABASE_URL.includes("YOUR_SUPABASE") || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) {
    document.getElementById("configWarning").classList.remove("hidden");
    document.getElementById("loginBtn").disabled = true;
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  wireLoginScreen();
  wireTabs();
  wireSidebar();
  wireOrderEntry();
  wireCustomerSearch();
  wireInvoice();
  wireMarketing();
  wireUnassigned();
  wireCheckout();
  wireSalesHistory();
  wireTurkeyStock();
  wireSeason();
  wireBackup();
  wireSecurity();
  wireHelp();

  // Resume session if already logged in (e.g. page refresh)
  sb.auth.getSession().then(({ data }) => {
    if (data.session) {
      onLoggedIn(data.session.user);
    }
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function wireLoginScreen() {
  document.getElementById("loginBtn").addEventListener("click", doLogin);
  document.getElementById("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("mfaVerifyBtn").addEventListener("click", verifyMfaLogin);
  document.getElementById("mfaCode").addEventListener("keydown", (e) => {
    if (e.key === "Enter") verifyMfaLogin();
  });
  document.getElementById("mfaBackToLogin").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("loginStep2").classList.add("hidden");
    document.getElementById("loginStep1").classList.remove("hidden");
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await sb.auth.signOut();
    currentUser = null;
    document.getElementById("appShell").classList.add("hidden");
    document.getElementById("loginStep1").classList.remove("hidden");
    document.getElementById("loginStep2").classList.add("hidden");
    document.getElementById("loginScreen").classList.remove("hidden");
  });
}

async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";

  if (!email || !password) {
    errEl.textContent = "Enter your email and password.";
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    return;
  }

  // Password is correct — check whether a second factor is required before
  // granting full access (Supabase's Authenticator Assurance Level check).
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    document.getElementById("loginStep1").classList.add("hidden");
    document.getElementById("loginStep2").classList.remove("hidden");
    document.getElementById("mfaCode").value = "";
    document.getElementById("mfaLoginError").textContent = "";
    document.getElementById("mfaCode").focus();
    return;
  }

  onLoggedIn(data.user);
}

async function verifyMfaLogin() {
  const code = document.getElementById("mfaCode").value.trim();
  const errEl = document.getElementById("mfaLoginError");
  errEl.textContent = "";

  if (!/^\d{6}$/.test(code)) {
    errEl.textContent = "Enter the 6-digit code from your authenticator app.";
    return;
  }

  const { data: factors, error: factorErr } = await sb.auth.mfa.listFactors();
  if (factorErr) { errEl.textContent = factorErr.message; return; }
  const factor = (factors?.totp || [])[0];
  if (!factor) { errEl.textContent = "No 2FA factor found."; return; }

  const { data: challenge, error: challErr } = await sb.auth.mfa.challenge({ factorId: factor.id });
  if (challErr) { errEl.textContent = challErr.message; return; }

  const { data, error } = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
  if (error) { errEl.textContent = "Incorrect code — try again."; return; }

  const { data: userData } = await sb.auth.getUser();
  onLoggedIn(userData.user);
}

function onLoggedIn(user) {
  currentUser = user;
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("userEmail").textContent = user.email;
  refreshAllData();
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      closeSidebar();   // on a phone the menu slides away once you pick a page
      window.scrollTo(0, 0);

      // Refresh shared data on every tab switch — not just after your own actions.
      // Other staff on other devices may have changed orders/payments/sales since
      // this page was last loaded, so don't trust the in-memory cache blindly.
      refreshAllData();
      if (btn.dataset.tab === "turkeyPlanning") renderTurkeyPlanning();
      if (btn.dataset.tab === "turkeyStock") renderTurkeyStock();
      if (btn.dataset.tab === "salesHistory") loadAndRenderSalesHistory();
      if (btn.dataset.tab === "security") renderMfaStatus();
    });
  });
}

// Phone/tablet menu: the sidebar slides in from the left behind a ☰ button
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarBackdrop").classList.add("show");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarBackdrop").classList.remove("show");
}
function wireSidebar() {
  document.getElementById("menuBtn").addEventListener("click", () => {
    if (document.getElementById("sidebar").classList.contains("open")) closeSidebar(); else openSidebar();
  });
  document.getElementById("sidebarBackdrop").addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });
}

// Yellow count next to "Unassigned" in the menu; hidden when there is nothing to resolve
function updateUnassignedBadge() {
  const badge = document.getElementById("unassignedBadge");
  if (!badge) return;
  const n = CACHE.unassigned.length;
  badge.textContent = n;
  badge.classList.toggle("hidden", n === 0);
}

// ---------------------------------------------------------------------------
// Shared data loading
// ---------------------------------------------------------------------------
async function refreshAllData() {
  const previousSeason = CACHE.season;
  await Promise.all([loadCustomers(), loadProducts(), loadTurkeyTiers(), loadUnassigned(), loadSettings()]);
  // If another device started a new season, follow it. First load: view the current season.
  if (!CACHE.viewSeason || (previousSeason && previousSeason !== CACHE.season)) CACHE.viewSeason = CACHE.season;
  await loadOrderBalances();
  populateSeasonSelect();
  renderSeasonStatus();
  populateAllCustomerDropdowns();
  populateOrderDropdown();
  renderDashboard();
  renderUnassigned();
  if (document.querySelector("#oeLinesTable tbody").children.length === 0) addOeLine();
  populateCheckoutProductDropdown();
  refreshTodaySalesSummary();
}

async function loadCustomers() {
  const { data, error } = await sb.from("customers").select("*").order("id");
  if (error) { console.error(error); return; }
  CACHE.customers = data || [];
}

async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("product_name");
  if (error) { console.error(error); return; }
  CACHE.products = data || [];
}

async function loadTurkeyTiers() {
  const { data, error } = await sb.from("turkey_pricing").select("*").order("weight_min");
  if (error) { console.error(error); return; }
  CACHE.turkeyTiers = data || [];
}

async function loadUnassigned() {
  const { data, error } = await sb.from("unassigned").select("*").order("id");
  if (error) { console.error(error); return; }
  CACHE.unassigned = data || [];
  updateUnassignedBadge();
}

async function loadOrderBalances() {
  const { data, error } = await sb.from("order_balances").select("*");
  if (error) { console.error(error); return; }
  const balances = data || [];
  const { data: orders, error: ordErr } = await sb.from("orders").select("*");
  if (ordErr) { console.error(ordErr); return; }

  CACHE.orders = (orders || []).map((o) => {
    const bal = balances.find((b) => b.order_id === o.id) || { subtotal: 0, amount_paid: 0, balance_due: 0 };
    const cust = CACHE.customers.find((c) => c.id === o.customer_id);
    return {
      ...o,
      customer_name: cust ? cust.name : o.customer_id,
      subtotal: Number(bal.subtotal) || 0,
      amount_paid: Number(bal.amount_paid) || 0,
      balance_due: Number(bal.balance_due) || 0,
    };
  });
}

function populateAllCustomerDropdowns() {
  const opts = CACHE.customers.map((c) => `<option value="${c.id}">${c.name} (${c.id})</option>`).join("");
  ["oeCustomer", "csCustomer"].forEach((id) => {
    const el = document.getElementById(id);
    const current = el.value;
    el.innerHTML = `<option value="">— select —</option>` + opts;
    if (current) el.value = current;
  });
  const resSelect = document.getElementById("resCustomer");
  resSelect.innerHTML = `<option value="">— none —</option>` + opts;
}

// ---------------------------------------------------------------------------
// SEASONS — each order belongs to a season (e.g. "Christmas 2026"), so a new
// Christmas starts clean while last year's orders stay on record.
// ---------------------------------------------------------------------------
async function loadSettings() {
  const { data, error } = await sb.from("settings").select("*").eq("key", "current_season").maybeSingle();
  if (error) console.error("settings:", error);
  const fallback = `Christmas ${new Date().getFullYear()}`;
  CACHE.season = (data && data.value) || CACHE.season || fallback;
}

// Orders saved before seasons existed count as the current season.
function orderSeason(o) { return o.season || CACHE.season; }
function inViewSeason(o) { return CACHE.viewSeason === "ALL" || orderSeason(o) === CACHE.viewSeason; }
function viewOrders() { return CACHE.orders.filter(inViewSeason); }
function viewSeasonLabel() { return CACHE.viewSeason === "ALL" ? "all seasons" : CACHE.viewSeason; }

function populateSeasonSelect() {
  const el = document.getElementById("seasonSelect");
  if (!el) return;
  const seasons = Array.from(new Set([CACHE.season, ...CACHE.orders.map(orderSeason)])).filter(Boolean).sort().reverse();
  el.innerHTML = seasons
    .map((s) => `<option value="${escHtml(s)}">${escHtml(s)}${s === CACHE.season ? " (current)" : ""}</option>`)
    .join("") + `<option value="ALL">All seasons</option>`;
  if (CACHE.viewSeason !== "ALL" && !seasons.includes(CACHE.viewSeason)) CACHE.viewSeason = CACHE.season;
  el.value = CACHE.viewSeason;
}

function renderSeasonStatus() {
  const el = document.getElementById("seasonCurrent");
  if (el) el.textContent = `Current season: ${CACHE.season}`;
}

function wireSeason() {
  document.getElementById("seasonSelect").addEventListener("change", (e) => {
    CACHE.viewSeason = e.target.value;
    populateOrderDropdown();
    renderDashboard();
    if (document.getElementById("tab-turkeyPlanning").classList.contains("active")) renderTurkeyPlanning();
    if (lastMarketingResults.length > 0) generateMarketingList();
  });
  document.getElementById("seasonNewBtn").addEventListener("click", startNewSeason);
}

async function startNewSeason() {
  const suggestion = `Christmas ${new Date().getFullYear() + 1}`;
  const name = (prompt(`Name for the new season, for example "${suggestion}":`, "") || "").trim();
  if (!name) return;
  if (name.length > 40) { showMsg("seasonMsg", "Please use a shorter name (40 characters or fewer).", "error"); return; }
  if (name === CACHE.season) { showMsg("seasonMsg", `${name} is already the current season.`, "error"); return; }
  if (!confirm(`Start "${name}"?\n\nOrders from ${CACHE.season} stay on record and can be viewed with the Season box at the top. From now on new orders go into ${name}.\n\nHave you taken a backup first?`)) return;

  const { error } = await sb.from("settings").upsert({ key: "current_season", value: name });
  if (error) { showMsg("seasonMsg", error.message + " (has the seasons SQL been run in Supabase?)", "error"); return; }
  CACHE.season = name;
  CACHE.viewSeason = name;
  populateSeasonSelect();
  renderSeasonStatus();
  populateOrderDropdown();
  renderDashboard();
  showMsg("seasonMsg", `${name} is now the current season.`, "success");
}

// Order IDs: the first order for a customer is ORD-C009, any further ones ORD-C009-2, -3 ...
function nextOrderId(custId) {
  const base = "ORD-" + custId;
  const taken = new Set(CACHE.orders.map((o) => o.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Invoice number follows the order: ORD-C009 -> INV-C009, ORD-C009-2 -> INV-C009-2
function invoiceNumberFor(order) { return "INV-" + order.id.replace(/^ORD-/, ""); }

function populateOrderDropdown() {
  const el = document.getElementById("invOrder");
  // Every order, current season first, with the season shown so similar ones can be told apart
  const sorted = [...CACHE.orders].sort((a, b) =>
    (orderSeason(a) === CACHE.season ? 0 : 1) - (orderSeason(b) === CACHE.season ? 0 : 1) || a.id.localeCompare(b.id));
  const opts = sorted
    .map((o) => `<option value="${escHtml(o.id)}">${escHtml(o.id)} — ${escHtml(o.customer_name)} — ${escHtml(orderSeason(o))}</option>`)
    .join("");
  const keep = el.value;
  el.innerHTML = `<option value="">— select —</option>` + opts;
  if (keep && sorted.some((o) => o.id === keep)) el.value = keep;
}

// Escape text before putting user-typed values (like an email address) into innerHTML.
function escHtml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Simple "looks like an email" check (name@domain.tld). Empty is handled by the caller.
function looksLikeEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function money(n) {
  const val = Number(n) || 0;
  // Round properly before formatting — plain toFixed(2) can round numbers that
  // sit exactly on a boundary (e.g. 42.675) the wrong way due to how floating-point
  // numbers are represented, which showed up as spurious £0.01 mismatches.
  const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
  const fixed = rounded.toFixed(2);
  return "£" + (fixed === "-0.00" ? "0.00" : fixed); // avoid displaying "-£0.00" from floating-point residue
}

// Paid / Partial / Unpaid, purely from the balance — independent of the order's
// fulfilment Status field (Pending/Confirmed/etc.), which tracks something different.
function paymentStatusFor(order) {
  if (order.balance_due <= 0.005) return "Paid";
  if (order.amount_paid > 0) return "Partial";
  return "Unpaid";
}

// Small parenthetical annotation for invoice/line display: turkey type/mode,
// stuffing type, or head count — whichever apply to that line.
function lineDetailSuffix(l) {
  const parts = [];
  if (l.turkey_type) parts.push(l.turkey_type);
  if (l.weight_mode) parts.push(l.weight_mode === "NYD" ? "weight not yet decided" : "estimated weight");
  if (l.weight_range_kg) parts.push(`±${l.weight_range_kg}kg`);
  if (l.turkey_number) parts.push(`bird #${l.turkey_number}`);
  if (l.stuffing_type) parts.push(l.stuffing_type);
  if (l.quantity) parts.push(`x${l.quantity}`);
  return parts.length ? ` <span class="line-detail">(${parts.join(", ")})</span>` : "";
}

// ---------------------------------------------------------------------------
// Pricing helper (mirrors the turkey weight-tier logic from the workbook)
// ---------------------------------------------------------------------------
function lookupPricePerKg(productName, weightKg) {
  if (!productName) return 0;
  if (productName.toUpperCase() === "TURKEY WHOLE") {
    const w = Number(weightKg) || 0;
    const tier = CACHE.turkeyTiers.find((t) => w >= Number(t.weight_min) && w <= Number(t.weight_max));
    return tier ? Number(tier.price_per_kg) : 0;
  }
  const prod = CACHE.products.find((p) => p.product_name === productName);
  return prod && prod.price_per_kg != null ? Number(prod.price_per_kg) : 0;
}

async function nextSequentialId(table, prefix, digits) {
  const { data, error } = await sb.from(table).select("id");
  if (error) { console.error(error); return prefix + "001"; }
  let max = 0;
  (data || []).forEach((row) => {
    if (row.id && row.id.startsWith(prefix)) {
      const n = parseInt(row.id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return prefix + String(max + 1).padStart(digits, "0");
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
function renderDashboard() {
  // Cancelled orders stay on record but don't count as order value or money still owed.
  // Deposits received still counts everything actually paid in.
  const shown = viewOrders();
  const activeOrders = shown.filter((o) => o.status !== "Cancelled");
  const totalOrderValue = activeOrders.reduce((s, o) => s + o.subtotal, 0);
  const totalPaid = shown.reduce((s, o) => s + o.amount_paid, 0);
  const totalBalance = activeOrders.reduce((s, o) => s + o.balance_due, 0);
  const seasonNote = document.getElementById("dashSeasonNote");
  if (seasonNote) seasonNote.textContent = `Showing orders for: ${viewSeasonLabel()}`;
  const totalUnassigned = CACHE.unassigned.reduce((s, u) => s + Number(u.total || 0), 0);

  document.getElementById("kpiTotalOrderValue").textContent = money(totalOrderValue);
  document.getElementById("kpiDeposits").textContent = money(totalPaid);
  document.getElementById("kpiBalance").textContent = money(totalBalance);
  document.getElementById("kpiUnassigned").textContent = money(totalUnassigned);

  const tbody = document.querySelector("#dashOrdersTable tbody");
  tbody.innerHTML = shown
    .map(
      (o) => `<tr>
        <td>${o.customer_name}</td><td>${o.id}</td><td>${escHtml(orderSeason(o))}</td><td>${o.status}</td><td>${paymentStatusFor(o)}</td><td>${o.delivery_method || ""}</td>
        <td>${money(o.subtotal)}</td><td>${money(o.amount_paid)}</td><td>${money(o.balance_due)}</td>
      </tr>`
    )
    .join("");

  renderOrderChart();
  renderTillSalesSummary();
  renderStatusPaymentBreakdown();
  renderTurkeyDashboard();
}

// Small KPI-style cards showing order count + total £ per Status and per
// Payment state — same visual pattern as the Till Sales cards.
function renderStatusPaymentBreakdown() {
  const cardHtml = (value, label) => `
    <div class="kpi-card">
      <div class="kpi-value">${money(value)}</div>
      <div class="kpi-label">${label}</div>
    </div>`;

  // Status: only show groups that actually have orders, in a sensible order
  const statusOrder = ["Pending", "Confirmed", "Ready", "Collected", "Delivered", "Cancelled"];
  const statusEl = document.getElementById("statusBreakdown");
  statusEl.innerHTML = statusOrder
    .map((status) => {
      const matches = viewOrders().filter((o) => o.status === status);
      if (matches.length === 0) return "";
      const total = matches.reduce((s, o) => s + o.subtotal, 0);
      return cardHtml(total, `${status} (${matches.length} order${matches.length === 1 ? "" : "s"})`);
    })
    .join("");

  // Payment: always show all three, even at zero, since it's a small fixed set
  const paymentOrder = ["Paid", "Partial", "Unpaid"];
  const paymentEl = document.getElementById("paymentBreakdown");
  paymentEl.innerHTML = paymentOrder
    .map((state) => {
      const matches = viewOrders().filter((o) => paymentStatusFor(o) === state);
      const total = matches.reduce((s, o) => s + o.subtotal, 0);
      return cardHtml(total, `${state} (${matches.length} order${matches.length === 1 ? "" : "s"})`);
    })
    .join("");
}

// ---------------------------------------------------------------------------
// TILL SALES SUMMARY (Today / This Week / This Month / This Year)
// ---------------------------------------------------------------------------
function startOfDay(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function startOfWeek(d) {
  // Monday as the first day of the week
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonth(d) {
  const x = startOfDay(d); x.setDate(1); return x;
}
function startOfYear(d) {
  const x = startOfDay(d); x.setMonth(0, 1); return x;
}

async function renderTillSalesSummary() {
  const { data, error } = await sb.from("sales").select("*");
  if (error) { console.error(error); return; }
  const sales = (data || []).filter((s) => s.status !== "Voided");

  const now = new Date();
  const boundaries = {
    today: startOfDay(now), week: startOfWeek(now), month: startOfMonth(now), year: startOfYear(now),
  };

  const summarize = (since) => {
    const matches = sales.filter((s) => new Date(s.sale_date) >= since);
    return { count: matches.length, total: matches.reduce((sum, s) => sum + Number(s.subtotal || 0), 0) };
  };

  const periods = { Today: boundaries.today, Week: boundaries.week, Month: boundaries.month, Year: boundaries.year };
  const idPrefix = { Today: "salesToday", Week: "salesWeek", Month: "salesMonth", Year: "salesYear" };
  const labelText = {
    Today: "Today", Week: "This Week", Month: "This Month", Year: "This Year",
  };

  Object.keys(periods).forEach((key) => {
    const { count, total } = summarize(periods[key]);
    document.getElementById(idPrefix[key] + "Value").textContent = money(total);
    document.getElementById(idPrefix[key] + "Label").textContent = `${labelText[key]} (${count} sale${count === 1 ? "" : "s"})`;
  });
}

let chartInstance = null;
function renderOrderChart() {
  const ctx = document.getElementById("orderChart");
  if (!ctx || !window.Chart) return;
  const chartOrders = viewOrders();
  const nameCount = {};
  chartOrders.forEach((o) => { nameCount[o.customer_name] = (nameCount[o.customer_name] || 0) + 1; });
  // A customer with more than one order in view gets the order ID added so the bars can be told apart
  const labels = chartOrders.map((o) => (nameCount[o.customer_name] > 1 ? `${o.customer_name} (${o.id})` : o.customer_name));
  const values = chartOrders.map((o) => o.subtotal);
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Order Value (£)", data: values, backgroundColor: "#8B1E1E" }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

// ---------------------------------------------------------------------------
// ORDER ENTRY
// ---------------------------------------------------------------------------
function wireOrderEntry() {
  document.getElementById("oeCustomer").addEventListener("change", onOeCustomerChange);
  document.getElementById("oeOrderPick").addEventListener("change", applyOeOrderSelection);
  document.getElementById("oeAddLineBtn").addEventListener("click", () => addOeLine());
  document.getElementById("oeSaveBtn").addEventListener("click", saveOrder);
  document.getElementById("oeClearBtn").addEventListener("click", clearOrderForm);
  document.getElementById("oeInvoiceBtn").addEventListener("click", () => {
    const orderId = document.getElementById("oeOrderId").value;
    if (!orderId) { showMsg("oeMsg", "Save the order first.", "error"); return; }
    document.querySelector('.tab-btn[data-tab="invoice"]').click();
    document.getElementById("invOrder").value = orderId;
    generateInvoice();
  });
  document.getElementById("oeNewCustomerBtn").addEventListener("click", () => {
    document.getElementById("oeNewCustomerForm").classList.toggle("hidden");
  });
  document.getElementById("oeCreateCustomerBtn").addEventListener("click", createCustomerInline);
  document.getElementById("oeCancelOrderBtn").addEventListener("click", cancelOrder);

  // Lines already saved on the order: Save / Remove buttons, and a live line total as you type
  const exBody = document.querySelector("#oeExistingTable tbody");
  exBody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    if (e.target.classList.contains("oe-ex-save")) saveExistingLine(tr);
    if (e.target.classList.contains("oe-ex-remove")) removeExistingLine(tr);
  });
  exBody.addEventListener("input", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr || !(e.target.classList.contains("oe-ex-weight") || e.target.classList.contains("oe-ex-price"))) return;
    const total = (Number(tr.querySelector(".oe-ex-weight").value) || 0) * (Number(tr.querySelector(".oe-ex-price").value) || 0);
    tr.querySelector(".oe-ex-total").textContent = money(total);
  });
  // Note: the first empty line row is added once product data has loaded — see refreshAllData().
}

async function onOeCustomerChange() {
  const custId = document.getElementById("oeCustomer").value;
  const pick = document.getElementById("oeOrderPick");
  if (!custId) {
    pick.innerHTML = "";
    document.getElementById("oeOrderId").value = "";
    document.getElementById("oeSeason").value = "";
    hideExistingLines();
    return;
  }

  // This customer's orders, current season first, then a "new order" choice
  const orders = CACHE.orders
    .filter((o) => o.customer_id === custId)
    .sort((a, b) => (orderSeason(a) === CACHE.season ? 0 : 1) - (orderSeason(b) === CACHE.season ? 0 : 1) || a.id.localeCompare(b.id));
  const newLabel = orders.length > 0 ? `➕ New separate order (${CACHE.season})` : `New order (${CACHE.season})`;
  pick.innerHTML = orders
    .map((o) => `<option value="${escHtml(o.id)}">${escHtml(o.id)} · ${escHtml(orderSeason(o))} · ${escHtml(o.status)} · ${money(o.subtotal)}</option>`)
    .join("") + `<option value="__NEW__">${escHtml(newLabel)}</option>`;

  // Default: add to this season's order if there is one, otherwise start a new one
  const current = orders.find((o) => orderSeason(o) === CACHE.season && o.status !== "Cancelled");
  pick.value = current ? current.id : "__NEW__";
  applyOeOrderSelection();
}

function applyOeOrderSelection() {
  const custId = document.getElementById("oeCustomer").value;
  const choice = document.getElementById("oeOrderPick").value;
  if (!custId) return;

  if (choice === "__NEW__") {
    const newId = nextOrderId(custId);
    document.getElementById("oeOrderId").value = newId;
    document.getElementById("oeSeason").value = CACHE.season;
    document.getElementById("oeDelivery").value = "Unknown";
    document.getElementById("oeStatus").value = "Pending";
    document.getElementById("oeCollectionDate").value = "";
    document.getElementById("oeDeliveryDate").value = "";
    const hasOthers = CACHE.orders.some((o) => o.customer_id === custId);
    showMsg("oeMsg", hasOthers ? `This will be a new separate order (${newId}) in ${CACHE.season}.` : "", hasOthers ? "success" : "");
    hideExistingLines();
  } else {
    const existing = CACHE.orders.find((o) => o.id === choice);
    if (!existing) return;
    document.getElementById("oeOrderId").value = existing.id;
    document.getElementById("oeSeason").value = orderSeason(existing);
    document.getElementById("oeDelivery").value = existing.delivery_method || "Unknown";
    document.getElementById("oeStatus").value = existing.status || "Pending";
    // Show the saved dates too, so saving the order doesn't blank them out
    document.getElementById("oeCollectionDate").value = existing.collection_date || "";
    document.getElementById("oeDeliveryDate").value = existing.delivery_date || "";
    showMsg("oeMsg", `Order ${existing.id} (${orderSeason(existing)}) is selected — new lines will be added to it. For a separate order, choose New separate order in the Order box.`, "success");
    renderExistingLines(existing.id);
  }
  recalcOeTotals();
}

// ---------------------------------------------------------------------------
// Editing lines that are already saved on an order
// ---------------------------------------------------------------------------
let oeExistingLines = [];

function hideExistingLines() {
  oeExistingLines = [];
  document.querySelector("#oeExistingTable tbody").innerHTML = "";
  document.getElementById("oeExistingSection").classList.add("hidden");
  showMsg("oeExistingMsg", "", "");
}

async function renderExistingLines(orderId) {
  const { data, error } = await sb.from("order_details").select("*").eq("order_id", orderId).order("line_no");
  if (error) { showMsg("oeExistingMsg", error.message, "error"); return; }
  // If the customer was changed while this was loading, drop the late answer
  if (document.getElementById("oeOrderId").value !== orderId) return;

  oeExistingLines = data || [];
  if (oeExistingLines.length === 0) { hideExistingLines(); return; }

  const sel = (a, b) => (a === b ? "selected" : "");
  document.querySelector("#oeExistingTable tbody").innerHTML = oeExistingLines.map((l) => {
    let details = "";
    if (l.product_name === "TURKEY WHOLE") {
      details = `
        <select class="oe-ex-ttype"><option value="">Type</option><option ${sel(l.turkey_type, "White")}>White</option><option ${sel(l.turkey_type, "Bronze")}>Bronze</option></select>
        <select class="oe-ex-wmode"><option value="">Mode</option><option ${sel(l.weight_mode, "NYD")}>NYD</option><option ${sel(l.weight_mode, "EV")}>EV</option></select>
        <input type="number" class="oe-ex-range" step="0.1" min="0" placeholder="± kg" value="${l.weight_range_kg ?? ""}" style="width:70px">
        <input type="text" class="oe-ex-tnum" placeholder="Turkey #" value="${escHtml(l.turkey_number)}" style="width:90px">`;
    } else if (l.category === "Turkey Breast Roll") {
      details = `<select class="oe-ex-stuff"><option value="">Stuffing</option><option ${sel(l.stuffing_type, "Sage and Onion")}>Sage and Onion</option><option ${sel(l.stuffing_type, "Other")}>Other</option></select>`;
    }
    return `<tr data-id="${l.id}">
      <td>${l.line_no}</td>
      <td>${escHtml(l.product_name)}</td>
      <td><input type="number" class="oe-ex-weight" step="0.001" min="0" value="${l.weight_kg}" style="width:90px"></td>
      <td><input type="number" class="oe-ex-qty" step="1" min="0" value="${l.quantity ?? ""}" style="width:70px"></td>
      <td><input type="number" class="oe-ex-price" step="0.01" min="0" value="${l.price_per_kg}" style="width:80px"></td>
      <td class="oe-ex-total">${money(l.line_total)}</td>
      <td>${details}</td>
      <td><button class="btn btn-secondary small oe-ex-save">Save</button> <button class="btn btn-ghost small oe-ex-remove">✖ Remove</button></td>
    </tr>`;
  }).join("");
  document.getElementById("oeExistingSection").classList.remove("hidden");
}

// Asks first when an order is already finished or cancelled, since changing it
// then is unusual and moves totals people may already have relied on.
function confirmLockedOrder(orderId, verb) {
  const order = CACHE.orders.find((o) => o.id === orderId);
  if (order && ["Collected", "Delivered", "Cancelled"].includes(order.status)) {
    return confirm(`This order is already marked ${order.status}. Are you sure you want to ${verb} a line on it?`);
  }
  return true;
}

async function afterExistingLineChange(orderId, text) {
  await loadOrderBalances();
  await renderExistingLines(orderId);
  recalcOeTotals();
  renderDashboard();
  showMsg("oeExistingMsg", text, "success");
}

async function saveExistingLine(tr) {
  const orderId = document.getElementById("oeOrderId").value;
  const line = oeExistingLines.find((l) => String(l.id) === String(tr.dataset.id));
  if (!orderId || !line) return;

  const weightRaw = tr.querySelector(".oe-ex-weight").value;
  const priceRaw = tr.querySelector(".oe-ex-price").value;
  const qtyRaw = tr.querySelector(".oe-ex-qty").value;
  const weight = Number(weightRaw);
  const price = Number(priceRaw);
  if (!(weight > 0)) { showMsg("oeExistingMsg", "Enter a weight above 0.", "error"); return; }
  if (priceRaw === "" || !(price >= 0)) { showMsg("oeExistingMsg", "Enter a price per kg (0 or more).", "error"); return; }
  if (qtyRaw !== "" && !(Number(qtyRaw) >= 0)) { showMsg("oeExistingMsg", "Quantity must be 0 or more, or left blank.", "error"); return; }
  if (!confirmLockedOrder(orderId, "change")) return;

  const update = { weight_kg: weight, price_per_kg: price, quantity: qtyRaw === "" ? null : Number(qtyRaw) };
  if (line.product_name === "TURKEY WHOLE") {
    update.turkey_type = tr.querySelector(".oe-ex-ttype").value || null;
    update.weight_mode = tr.querySelector(".oe-ex-wmode").value || null;
    const range = tr.querySelector(".oe-ex-range").value;
    update.weight_range_kg = range === "" ? null : Number(range);
    update.turkey_number = tr.querySelector(".oe-ex-tnum").value.trim() || null;
  } else if (line.category === "Turkey Breast Roll") {
    update.stuffing_type = tr.querySelector(".oe-ex-stuff").value || null;
  }

  const { error } = await sb.from("order_details").update(update).eq("id", line.id);
  if (error) { showMsg("oeExistingMsg", error.message, "error"); return; }
  await afterExistingLineChange(orderId, `Line ${line.line_no} saved.`);
}

async function removeExistingLine(tr) {
  const orderId = document.getElementById("oeOrderId").value;
  const line = oeExistingLines.find((l) => String(l.id) === String(tr.dataset.id));
  if (!orderId || !line) return;
  if (!confirmLockedOrder(orderId, "remove")) return;
  if (!confirm(`Remove line ${line.line_no} (${line.product_name}, ${line.weight_kg} kg) from ${orderId}? This changes the order total.`)) return;

  const { error } = await sb.from("order_details").delete().eq("id", line.id);
  if (error) { showMsg("oeExistingMsg", error.message, "error"); return; }
  await afterExistingLineChange(orderId, `Line ${line.line_no} removed.`);
}

// Marks the order Cancelled. The order and its payments stay on record.
async function cancelOrder() {
  const orderId = document.getElementById("oeOrderId").value;
  const order = CACHE.orders.find((o) => o.id === orderId);
  if (!orderId || !order) { showMsg("oeMsg", "There is no saved order to cancel. Choose a customer who has an order.", "error"); return; }
  if (order.status === "Cancelled") { showMsg("oeMsg", `Order ${orderId} is already cancelled.`, "error"); return; }

  let text = `Cancel order ${orderId}? It stays on record, marked Cancelled, and no longer counts in the order totals or turkey numbers.`;
  if (order.amount_paid > 0.005) {
    text += `\n\n${money(order.amount_paid)} has been paid on this order. The payment stays on record. Record any refund on Customer Search.`;
  }
  if (!confirm(text)) return;

  const { error } = await sb.from("orders").update({ status: "Cancelled" }).eq("id", orderId);
  if (error) { showMsg("oeMsg", error.message, "error"); return; }
  document.getElementById("oeStatus").value = "Cancelled";
  await loadOrderBalances();
  populateOrderDropdown();
  renderDashboard();
  showMsg("oeMsg", `Order ${orderId} cancelled. To reopen it, change Status and click Save Order.`, "success");
}

async function createCustomerInline() {
  const name = document.getElementById("oeNewName").value.trim();
  const phone = document.getElementById("oeNewPhone").value.trim();
  const email = document.getElementById("oeNewEmail").value.trim();
  if (!name || !phone) {
    showMsg("oeMsg", "Enter both a name and phone number for the new customer.", "error");
    return;
  }
  // Email is optional, but if given it must look like an address (name@domain.tld).
  if (email && !looksLikeEmail(email)) {
    showMsg("oeMsg", "That email address doesn't look right. Check it, or leave it blank.", "error");
    return;
  }
  const newId = await nextSequentialId("customers", "C", 3);
  const newCustomer = {
    id: newId, name, telephone: phone, delivery_method: "Unknown", marketing_opt_in: "Y",
  };
  // Only send the email when one was typed, so adding a customer without one
  // keeps working even before the "email" column has been added to the database.
  if (email) newCustomer.email = email;
  const { error } = await sb.from("customers").insert(newCustomer);
  if (error) { showMsg("oeMsg", error.message, "error"); return; }

  await loadCustomers();
  populateAllCustomerDropdowns();
  document.getElementById("oeCustomer").value = newId;
  document.getElementById("oeNewCustomerForm").classList.add("hidden");
  document.getElementById("oeNewName").value = "";
  document.getElementById("oeNewPhone").value = "";
  document.getElementById("oeNewEmail").value = "";
  onOeCustomerChange();
  showMsg("oeMsg", `Customer ${newId} created.`, "success");
}

function addOeLine(prefill) {
  const tbody = document.querySelector("#oeLinesTable tbody");
  const tr = document.createElement("tr");
  tr.className = "oe-line-row";
  const productOpts = CACHE.products.map((p) => `<option value="${p.product_name}" data-category="${p.category}">${p.product_name} (${p.category})</option>`).join("");

  tr.innerHTML = `
    <td><select class="oe-product"><option value="">— select —</option>${productOpts}</select></td>
    <td><input type="number" class="oe-weight" step="0.001" min="0" value="${prefill?.weight || ""}"></td>
    <td><input type="number" class="oe-qty" step="1" min="0" placeholder="—"></td>
    <td><input type="number" class="oe-price" step="0.01" min="0" value="${prefill?.price || ""}"></td>
    <td class="oe-linetotal">£0.00</td>
    <td><button class="btn btn-ghost small oe-remove">✖</button></td>
  `;
  tbody.appendChild(tr);

  // Detail row: extra fields shown only when relevant to the selected product/category
  const detailTr = document.createElement("tr");
  detailTr.className = "oe-detail-row hidden";
  const detailTd = document.createElement("td");
  detailTd.colSpan = 6;
  detailTd.innerHTML = `
    <div class="oe-detail-fields">
      <div class="field oe-turkey-fields hidden">
        <label>Type</label><select class="oe-turkey-type"><option value="">—</option><option>White</option><option>Bronze</option></select>
      </div>
      <div class="field oe-turkey-fields hidden">
        <label>Weight Mode</label><select class="oe-weight-mode"><option value="">—</option><option>NYD</option><option>EV</option></select>
      </div>
      <div class="field oe-turkey-fields hidden">
        <label>Range ± (KG)</label><input type="number" class="oe-weight-range" step="0.1" min="0">
      </div>
      <div class="field oe-turkey-fields hidden">
        <label>Turkey # (office use)</label><input type="text" class="oe-turkey-number">
      </div>
      <div class="field oe-stuffing-field hidden">
        <label>Stuffing Type</label><select class="oe-stuffing-type"><option value="">—</option><option>Sage and Onion</option><option>Other</option></select>
      </div>
      <div class="oe-detail-hint hidden">No extra details needed for this product.</div>
    </div>
  `;
  detailTr.appendChild(detailTd);
  tbody.appendChild(detailTr);

  const productSel = tr.querySelector(".oe-product");
  const weightInput = tr.querySelector(".oe-weight");
  const priceInput = tr.querySelector(".oe-price");
  const qtyInput = tr.querySelector(".oe-qty");

  const updateDetailFields = () => {
    const opt = productSel.selectedOptions[0];
    const category = opt ? opt.dataset.category : "";
    const isTurkeyWhole = productSel.value === "TURKEY WHOLE";
    const isTurkeyBreastRoll = category === "Turkey Breast Roll";
    const isHeadCount = category === "Other Poultry" || category === "Game";

    detailTr.querySelectorAll(".oe-turkey-fields").forEach((el) => el.classList.toggle("hidden", !isTurkeyWhole));
    detailTr.querySelector(".oe-stuffing-field").classList.toggle("hidden", !isTurkeyBreastRoll);
    // Qty stays visible on every row (column alignment is simpler and it's harmless to
    // leave blank) — just hint via placeholder when it's actually relevant.
    qtyInput.placeholder = isHeadCount ? "head count" : "—";

    const anyDetail = isTurkeyWhole || isTurkeyBreastRoll;
    detailTr.classList.toggle("hidden", !anyDetail);
  };

  const updatePrice = () => {
    const price = lookupPricePerKg(productSel.value, weightInput.value);
    if (price > 0) priceInput.value = price.toFixed(2);
    updateLineTotal();
  };
  const updateLineTotal = () => {
    const total = (Number(weightInput.value) || 0) * (Number(priceInput.value) || 0);
    tr.querySelector(".oe-linetotal").textContent = money(total);
    recalcOeTotals();
  };

  productSel.addEventListener("change", () => { updateDetailFields(); updatePrice(); });
  weightInput.addEventListener("input", updatePrice);
  priceInput.addEventListener("input", updateLineTotal);
  tr.querySelector(".oe-remove").addEventListener("click", () => { tr.remove(); detailTr.remove(); recalcOeTotals(); });

  updateDetailFields();
}

function recalcOeTotals() {
  let subtotal = 0;
  document.querySelectorAll("#oeLinesTable tbody tr.oe-line-row").forEach((tr) => {
    const w = Number(tr.querySelector(".oe-weight").value) || 0;
    const p = Number(tr.querySelector(".oe-price").value) || 0;
    subtotal += w * p;
  });
  document.getElementById("oeSubtotal").textContent = money(subtotal);

  const currentOrderId = document.getElementById("oeOrderId").value;
  const existing = CACHE.orders.find((o) => o.id === currentOrderId);
  const paid = existing ? existing.amount_paid : 0;
  document.getElementById("oeDeposit").textContent = money(paid);
  // Balance shown = (already-saved subtotal for this order, if any) + new unsaved lines - amount paid
  const projected = (existing ? existing.subtotal : 0) + subtotal;
  document.getElementById("oeBalance").textContent = money(projected - paid);
}

async function saveOrder() {
  const custId = document.getElementById("oeCustomer").value;
  const orderId = document.getElementById("oeOrderId").value;
  if (!custId || !orderId) { showMsg("oeMsg", "Select a customer first.", "error"); return; }

  const lines = [];
  document.querySelectorAll("#oeLinesTable tbody tr.oe-line-row").forEach((tr) => {
    const productSel = tr.querySelector(".oe-product");
    const product = productSel.value;
    const category = productSel.selectedOptions[0]?.dataset.category || null;
    const weight = Number(tr.querySelector(".oe-weight").value) || 0;
    const price = Number(tr.querySelector(".oe-price").value) || 0;
    const qtyVal = tr.querySelector(".oe-qty").value;
    const detailTr = tr.nextElementSibling; // the paired .oe-detail-row
    const turkeyType = detailTr?.querySelector(".oe-turkey-type")?.value || null;
    const weightMode = detailTr?.querySelector(".oe-weight-mode")?.value || null;
    const weightRange = detailTr?.querySelector(".oe-weight-range")?.value || null;
    const turkeyNumber = detailTr?.querySelector(".oe-turkey-number")?.value || null;
    const stuffingType = detailTr?.querySelector(".oe-stuffing-type")?.value || null;
    if (product && weight > 0) {
      lines.push({
        product, category, weight, price,
        quantity: qtyVal ? Number(qtyVal) : null,
        turkey_type: turkeyType || null,
        weight_mode: weightMode || null,
        weight_range_kg: weightRange ? Number(weightRange) : null,
        turkey_number: turkeyNumber || null,
        stuffing_type: stuffingType || null,
      });
    }
  });

  const existing = CACHE.orders.find((o) => o.id === orderId);
  if (lines.length === 0 && !existing) {
    showMsg("oeMsg", "Add at least one line item.", "error"); return;
  }

  const status = document.getElementById("oeStatus").value;
  const delivery = document.getElementById("oeDelivery").value;
  const collectionDate = document.getElementById("oeCollectionDate").value || null;
  const deliveryDate = document.getElementById("oeDeliveryDate").value || null;

  if (!existing) {
    const { error } = await sb.from("orders").insert({
      id: orderId, customer_id: custId, season: document.getElementById("oeSeason").value || CACHE.season,
      status, delivery_method: delivery,
      collection_date: collectionDate, delivery_date: deliveryDate,
    });
    if (error) { showMsg("oeMsg", error.message, "error"); return; }
  } else {
    await sb.from("orders").update({
      status, delivery_method: delivery, collection_date: collectionDate, delivery_date: deliveryDate,
    }).eq("id", orderId);
  }

  if (lines.length > 0) {
    const { data: existingLines } = await sb.from("order_details").select("line_no").eq("order_id", orderId);
    let maxLine = 0;
    (existingLines || []).forEach((l) => { if (l.line_no > maxLine) maxLine = l.line_no; });

    const rows = lines.map((l, i) => ({
      order_id: orderId, line_no: maxLine + i + 1, product_name: l.product, category: l.category,
      weight_kg: l.weight, price_per_kg: l.price,
      quantity: l.quantity, turkey_type: l.turkey_type, weight_mode: l.weight_mode,
      weight_range_kg: l.weight_range_kg, turkey_number: l.turkey_number, stuffing_type: l.stuffing_type,
    }));
    const { error: insErr } = await sb.from("order_details").insert(rows);
    if (insErr) { showMsg("oeMsg", insErr.message, "error"); return; }
  }

  showMsg("oeMsg", lines.length > 0
    ? `Order ${orderId} saved (${lines.length} line(s)).`
    : `Order ${orderId} updated (status/delivery only — no new lines added).`, "success");
  await loadOrderBalances();
  populateOrderDropdown();
  renderDashboard();
  clearOrderForm();
}

function clearOrderForm() {
  document.getElementById("oeCustomer").value = "";
  document.getElementById("oeOrderPick").innerHTML = "";
  document.getElementById("oeSeason").value = "";
  document.getElementById("oeOrderId").value = "";
  document.getElementById("oeDelivery").value = "Unknown";
  document.getElementById("oeStatus").value = "Pending";
  document.getElementById("oeCollectionDate").value = "";
  document.getElementById("oeDeliveryDate").value = "";
  document.querySelector("#oeLinesTable tbody").innerHTML = "";
  hideExistingLines();
  addOeLine();
  recalcOeTotals();
}

function showMsg(elId, text, type) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.className = "msg-box" + (type ? " " + type : "");
}

// ---------------------------------------------------------------------------
// CUSTOMER SEARCH
// ---------------------------------------------------------------------------
function wireCustomerSearch() {
  document.getElementById("csCustomer").addEventListener("change", () => {
    renderCustomerProfile();
    fillCustomerEditForm();
  });
  document.getElementById("csPayBtn").addEventListener("click", recordPayment);
  document.getElementById("csEditSaveBtn").addEventListener("click", saveCustomerDetails);
}

// Fills the "Edit customer details" form from the selected customer. Only done when
// the customer changes (or after a save), so half-typed edits aren't wiped by a refresh.
function fillCustomerEditForm() {
  const cust = CACHE.customers.find((c) => c.id === document.getElementById("csCustomer").value);
  const set = (id, v) => { document.getElementById(id).value = v == null ? "" : v; };
  set("csEditName", cust && cust.name);
  set("csEditPhone", cust && cust.telephone);
  set("csEditEmail", cust && cust.email);
  set("csEditAddress", cust && cust.address);
  set("csEditDelivery", (cust && cust.delivery_method) || "Unknown");
  // Anything other than a clear "Y" shows as No, so saving never grants consent by accident
  set("csEditOptIn", cust && cust.marketing_opt_in === "Y" ? "Y" : "N");
  set("csEditNotes", cust && cust.notes);
  showMsg("csEditMsg", "", "");
}

async function saveCustomerDetails() {
  const custId = document.getElementById("csCustomer").value;
  if (!custId) { showMsg("csEditMsg", "Select a customer first.", "error"); return; }

  const val = (id) => document.getElementById(id).value.trim();
  const name = val("csEditName");
  const email = val("csEditEmail");
  if (!name) { showMsg("csEditMsg", "The name can't be empty.", "error"); return; }
  if (email && !looksLikeEmail(email)) {
    showMsg("csEditMsg", "That email address doesn't look right. Check it, or clear the box to remove it.", "error");
    return;
  }

  const { error } = await sb.from("customers").update({
    name,
    telephone: val("csEditPhone") || null,
    email: email || null,
    address: val("csEditAddress") || null,
    delivery_method: document.getElementById("csEditDelivery").value,
    marketing_opt_in: document.getElementById("csEditOptIn").value,
    notes: val("csEditNotes") || null,
  }).eq("id", custId);
  if (error) { showMsg("csEditMsg", error.message, "error"); return; }

  // Refresh everything that shows the customer's name
  await loadCustomers();
  await loadOrderBalances();
  populateAllCustomerDropdowns();
  populateOrderDropdown();
  renderCustomerProfile();
  fillCustomerEditForm();
  renderDashboard();
  showMsg("csEditMsg", "Details saved.", "success");
}

function renderCustomerProfile() {
  const custId = document.getElementById("csCustomer").value;
  const cust = CACHE.customers.find((c) => c.id === custId);
  if (!cust) {
    ["csName", "csPhone", "csEmail", "csAddress", "csDelivery", "csOptIn", "csNotes"].forEach((id) => (document.getElementById(id).textContent = "—"));
    document.querySelector("#csOrdersTable tbody").innerHTML = "";
    document.getElementById("csPayOrder").innerHTML = "";
    return;
  }
  document.getElementById("csName").textContent = cust.name || "—";
  document.getElementById("csPhone").textContent = cust.telephone || "—";
  document.getElementById("csEmail").textContent = cust.email || "—";
  document.getElementById("csAddress").textContent = cust.address || "—";
  document.getElementById("csDelivery").textContent = cust.delivery_method || "—";
  document.getElementById("csOptIn").textContent = cust.marketing_opt_in || "—";
  document.getElementById("csNotes").textContent = cust.notes || "—";

  const orders = CACHE.orders
    .filter((o) => o.customer_id === custId)
    .sort((a, b) => (orderSeason(a) === CACHE.season ? 0 : 1) - (orderSeason(b) === CACHE.season ? 0 : 1) || a.id.localeCompare(b.id));

  // Which order a payment goes to: keep the choice if still valid, otherwise this season's
  // order that still owes money, then any order from this season, then the first one.
  const payEl = document.getElementById("csPayOrder");
  const previousChoice = payEl.value;
  payEl.innerHTML = orders.length === 0
    ? `<option value="">No order yet</option>`
    : orders.map((o) => `<option value="${escHtml(o.id)}">${escHtml(o.id)} · ${escHtml(orderSeason(o))} · balance ${money(o.balance_due)}</option>`).join("");
  if (orders.some((o) => o.id === previousChoice)) {
    payEl.value = previousChoice;
  } else if (orders.length > 0) {
    const thisSeason = orders.filter((o) => orderSeason(o) === CACHE.season && o.status !== "Cancelled");
    const pick = thisSeason.find((o) => o.balance_due > 0.005) || thisSeason[0] || orders[0];
    payEl.value = pick.id;
  }

  document.querySelector("#csOrdersTable tbody").innerHTML = orders
    .map((o) => `<tr><td>${o.id}</td><td>${escHtml(orderSeason(o))}</td><td>${o.status}</td><td>${paymentStatusFor(o)}</td><td>${o.delivery_method || ""}</td><td>${money(o.subtotal)}</td><td>${money(o.amount_paid)}</td><td>${money(o.balance_due)}</td></tr>`)
    .join("");
}

async function recordPayment() {
  const custId = document.getElementById("csCustomer").value;
  const amount = Number(document.getElementById("csPayAmount").value);
  const type = document.getElementById("csPayType").value;

  if (!custId) { showMsg("csMsg", "Select a customer first.", "error"); return; }
  if (!amount || amount <= 0) { showMsg("csMsg", "Enter a positive amount.", "error"); return; }

  const orderId = document.getElementById("csPayOrder").value;
  const orderExists = !!orderId && CACHE.orders.some((o) => o.id === orderId);
  if (!orderExists) {
    if (!confirm(`No order exists yet for ${custId}. Record the payment anyway? It will apply once an order is saved for them.`)) return;
  }

  const storedAmount = type === "Refund" ? amount : -amount;
  const paymentId = await nextSequentialId("payments", "PAY", 3);

  const { error } = await sb.from("payments").insert({
    id: paymentId, customer_id: custId, order_id: orderExists ? orderId : null, amount: storedAmount, type,
  });
  if (error) { showMsg("csMsg", error.message, "error"); return; }

  showMsg("csMsg", `${paymentId} recorded (${type}, ${money(amount)}).`, "success");
  document.getElementById("csPayAmount").value = "";
  await loadOrderBalances();

  // Once an order is fully paid, move it along automatically — but only from an
  // early-stage status. Never overrides a status someone already advanced further
  // (Ready/Collected/Delivered) or explicitly set to Cancelled.
  if (orderExists) {
    const order = CACHE.orders.find((o) => o.id === orderId);
    if (order && order.balance_due <= 0.005 && ["Pending", "Confirmed"].includes(order.status)) {
      await sb.from("orders").update({ status: "Ready" }).eq("id", orderId);
      await loadOrderBalances();
    }
  }

  renderCustomerProfile();
  renderDashboard();
}

// ---------------------------------------------------------------------------
// INVOICE
// ---------------------------------------------------------------------------
function wireInvoice() {
  document.getElementById("invGenerateBtn").addEventListener("click", generateInvoice);
  document.getElementById("invPrintBtn").addEventListener("click", () => window.print());
  document.getElementById("invEmailBtn").addEventListener("click", emailInvoice);
}

// Details of the invoice currently on screen, used by the Email Invoice button.
let currentInvoice = null;

// Opens the staff member's own email app with a ready-written message.
// Nothing is sent from the website: staff check the message and press Send themselves.
function emailInvoice() {
  if (!currentInvoice) { showMsg("invMsg", "Click Generate first, then Email Invoice.", "error"); return; }
  const inv = currentInvoice;
  const to = inv.email && looksLikeEmail(inv.email) ? inv.email : "";

  const sign = [
    "Kind regards,",
    "F. Conisbee & Son",
    "Park Corner, Ockham Road South, East Horsley, Surrey, KT24 6RZ",
    "Tel: 01483 282073",
  ].join("\n");

  const head = `Dear ${inv.name},\n\nPlease find your invoice ${inv.number} for order ${inv.orderId}, dated ${inv.date}.\n\n`;
  const totals = `Subtotal: ${inv.subtotal}\nAmount paid: ${inv.paid}\nBalance due: ${inv.balance}\n\n${inv.delivery}\n\n`;
  const itemsText = "Items:\n" + inv.lines.join("\n") + "\n\n";

  const subject = `Your invoice ${inv.number} - F. Conisbee & Son`;
  const build = (body) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  let url = build(head + itemsText + totals + sign);
  // Very long orders can exceed what email apps accept in a link, so fall back to totals only.
  if (url.length > 1800) {
    url = build(head + totals + "(Full item list attached.)\n\n" + sign);
  }
  window.location.href = url;

  showMsg("invMsg", to
    ? "Your email app should open. To attach a PDF, use Print / Save as PDF first, then attach the file."
    : "Your email app should open. This customer has no email on file, so type the address in, or save one on Customer Search.",
    "success");
}

async function generateInvoice() {
  const orderId = document.getElementById("invOrder").value;
  if (!orderId) { showMsg("invMsg", "Select an order.", "error"); return; }

  const order = CACHE.orders.find((o) => o.id === orderId);
  if (!order) { showMsg("invMsg", "Order not found.", "error"); return; }
  const cust = CACHE.customers.find((c) => c.id === order.customer_id);

  const { data: lines, error } = await sb.from("order_details").select("*").eq("order_id", orderId).order("line_no");
  if (error) { showMsg("invMsg", error.message, "error"); return; }

  document.getElementById("invNumber").textContent = invoiceNumberFor(order);
  document.getElementById("invDate").textContent = new Date().toLocaleDateString("en-GB");
  document.getElementById("invOrderId").textContent = orderId;
  document.getElementById("invBillName").textContent = cust ? cust.name : order.customer_id;
  document.getElementById("invBillPhone").textContent = cust ? cust.telephone || "" : "";
  document.getElementById("invBillDelivery").textContent = "Delivery method: " + (order.delivery_method || "Unknown");

  document.getElementById("invItemsBody").innerHTML = (lines || [])
    .map((l) => `<tr><td>${l.line_no}</td><td>${l.product_name}${lineDetailSuffix(l)}</td><td>${l.weight_kg}</td><td>${money(l.price_per_kg)}</td><td>${money(l.line_total)}</td></tr>`)
    .join("");

  document.getElementById("invSubtotal").textContent = money(order.subtotal);
  document.getElementById("invPaid").textContent = money(order.amount_paid);
  document.getElementById("invBalance").textContent = money(order.balance_due);

  currentInvoice = {
    email: cust ? cust.email || "" : "",
    name: cust ? cust.name : order.customer_id,
    number: invoiceNumberFor(order),
    orderId,
    date: new Date().toLocaleDateString("en-GB"),
    delivery: "Delivery method: " + (order.delivery_method || "Unknown"),
    subtotal: money(order.subtotal),
    paid: money(order.amount_paid),
    balance: money(order.balance_due),
    lines: (lines || []).map((l) => `${l.line_no}. ${l.product_name}${lineDetailSuffix(l)} - ${l.weight_kg} kg x ${money(l.price_per_kg)} = ${money(l.line_total)}`),
  };

  document.getElementById("invoiceDoc").classList.remove("hidden");
  showMsg("invMsg", "", "");
}

// ---------------------------------------------------------------------------
// MARKETING
// ---------------------------------------------------------------------------
function wireMarketing() {
  document.getElementById("mktGenerateBtn").addEventListener("click", generateMarketingList);
  document.getElementById("mktExportBtn").addEventListener("click", exportMarketingCsv);
}

let lastMarketingResults = [];

function generateMarketingList() {
  const deliveryFilter = document.getElementById("mktDelivery").value;
  const optInFilter = document.getElementById("mktOptIn").value;

  lastMarketingResults = CACHE.customers
    .filter((c) => deliveryFilter === "Any" || (c.delivery_method || "Unknown") === deliveryFilter)
    .filter((c) => optInFilter === "Any" || (c.marketing_opt_in || "") === optInFilter)
    .map((c) => {
      // Total of this customer's orders in the season being viewed (cancelled orders left out)
      const total = CACHE.orders
        .filter((o) => o.customer_id === c.id && o.status !== "Cancelled" && inViewSeason(o))
        .reduce((s, o) => s + o.subtotal, 0);
      return { ...c, order_total: total };
    });

  document.getElementById("mktSeasonNote").textContent = `Order Total is for: ${viewSeasonLabel()}`;
  document.querySelector("#mktTable tbody").innerHTML = lastMarketingResults
    .map((c) => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.telephone || ""}</td><td>${escHtml(c.email)}</td><td>${c.delivery_method || ""}</td><td>${money(c.order_total)}</td></tr>`)
    .join("");
}

function exportMarketingCsv() {
  if (lastMarketingResults.length === 0) { alert("Click 'Generate List' first."); return; }
  // Quote every field so a comma inside a name or address can't shift the columns.
  const csvField = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const header = "CustomerID,Name,Telephone,Email,Delivery,MarketingOptIn,OrderTotal\n";
  const rows = lastMarketingResults
    .map((c) => [c.id, c.name, c.telephone, c.email, c.delivery_method, c.marketing_opt_in, c.order_total].map(csvField).join(","))
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MarketingList_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// UNASSIGNED
// ---------------------------------------------------------------------------
function wireUnassigned() {
  document.getElementById("resResolveBtn").addEventListener("click", resolveUnassigned);
  document.getElementById("resRefreshBtn").addEventListener("click", async () => {
    await loadUnassigned();
    renderUnassigned();
    renderDashboard();
  });
}

function renderUnassigned() {
  document.querySelector("#unassignedTable tbody").innerHTML = CACHE.unassigned
    .map(
      (u) => `<tr>
        <td>${u.source_sheet || ""}</td><td>${u.item_no || ""}</td><td>${u.product}</td>
        <td>${u.weight_kg}</td><td>${money(u.price_per_kg)}</td><td>${money(u.total)}</td><td>${u.issue || ""}</td>
      </tr>`
    )
    .join("");

  const total = CACHE.unassigned.reduce((s, u) => s + Number(u.total || 0), 0);
  document.getElementById("unassignedTotal").textContent = money(total);

  const itemSel = document.getElementById("resItemNo");
  itemSel.innerHTML = CACHE.unassigned.map((u) => `<option value="${u.id}">#${u.item_no} — ${u.product} (${money(u.total)})</option>`).join("");
}

async function resolveUnassigned() {
  const rowId = document.getElementById("resItemNo").value;
  const existingCustId = document.getElementById("resCustomer").value;
  const newName = document.getElementById("resNewName").value.trim();
  const newPhone = document.getElementById("resNewPhone").value.trim();

  if (!rowId) { showMsg("resMsg", "Select an item to resolve.", "error"); return; }
  if (!existingCustId && !newName) { showMsg("resMsg", "Provide either an existing customer or a new name.", "error"); return; }
  if (existingCustId && newName) { showMsg("resMsg", "Fill in EITHER Customer OR new name — not both.", "error"); return; }
  if (newName && !newPhone) { showMsg("resMsg", "Enter a phone number for the new customer.", "error"); return; }

  const row = CACHE.unassigned.find((u) => String(u.id) === String(rowId));
  if (!row) { showMsg("resMsg", "Row not found — try Refresh List.", "error"); return; }

  let custId = existingCustId;
  if (!custId) {
    custId = await nextSequentialId("customers", "C", 3);
    const { error } = await sb.from("customers").insert({
      id: custId, name: newName, telephone: newPhone, delivery_method: "Unknown", marketing_opt_in: "Y",
      notes: "Created via Unassigned Resolution on " + new Date().toISOString().slice(0, 10),
    });
    if (error) { showMsg("resMsg", error.message, "error"); return; }
  }

  // Add to the customer's order for the current season if they have one, otherwise start a new one
  const currentOrder = CACHE.orders.find((o) => o.customer_id === custId && orderSeason(o) === CACHE.season && o.status !== "Cancelled");
  const orderId = currentOrder ? currentOrder.id : nextOrderId(custId);
  const { data: existingOrder } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
  if (!existingOrder) {
    const { error } = await sb.from("orders").insert({
      id: orderId, customer_id: custId, season: CACHE.season, status: "Pending", delivery_method: "Unknown",
      notes: "Includes a line resolved from Unassigned Review",
    });
    if (error) { showMsg("resMsg", error.message, "error"); return; }
  }

  const { data: existingLines } = await sb.from("order_details").select("line_no").eq("order_id", orderId);
  let maxLine = 0;
  (existingLines || []).forEach((l) => { if (l.line_no > maxLine) maxLine = l.line_no; });

  const { error: insErr } = await sb.from("order_details").insert({
    order_id: orderId, line_no: maxLine + 1, product_name: row.product,
    category: CACHE.products.find((p) => p.product_name === row.product)?.category || null,
    weight_kg: row.weight_kg, price_per_kg: row.price_per_kg,
    source_item_no: row.item_no,
    flag: `Resolved from Unassigned Review on ${new Date().toISOString().slice(0, 10)} (originally on ${row.source_sheet} sheet)`,
  });
  if (insErr) { showMsg("resMsg", insErr.message, "error"); return; }

  const { error: delErr } = await sb.from("unassigned").delete().eq("id", row.id);
  if (delErr) { showMsg("resMsg", delErr.message, "error"); return; }

  document.getElementById("resNewName").value = "";
  document.getElementById("resNewPhone").value = "";
  document.getElementById("resCustomer").value = "";

  showMsg("resMsg", `Item #${row.item_no} resolved to ${custId} (${orderId}).`, "success");

  await Promise.all([loadCustomers(), loadUnassigned()]);
  await loadOrderBalances();
  populateAllCustomerDropdowns();
  populateOrderDropdown();
  renderUnassigned();
  renderDashboard();
}

// ---------------------------------------------------------------------------
// CHECKOUT (till / counter sales — separate from the pre-order system above:
// no customer required, paid in full immediately)
// ---------------------------------------------------------------------------
let cart = []; // { product, mode, weight, qty, price }

function wireCheckout() {
  document.getElementById("coMode").addEventListener("change", onCoModeChange);
  document.getElementById("coProduct").addEventListener("change", onCoProductChange);
  document.getElementById("coWeight").addEventListener("input", onCoWeightChange);
  document.getElementById("coAddBtn").addEventListener("click", addToCart);
  document.getElementById("coClearBtn").addEventListener("click", clearCart);
  document.getElementById("coPaymentMethod").addEventListener("change", onCoPaymentMethodChange);
  document.getElementById("coTendered").addEventListener("input", updateChangeDue);
  document.getElementById("coCompleteBtn").addEventListener("click", completeSale);
  document.getElementById("rcptPrintBtn").addEventListener("click", () => window.print());
  document.getElementById("rcptNewSaleBtn").addEventListener("click", startNewSale);
  onCoModeChange();
  onCoPaymentMethodChange();
}

function populateCheckoutProductDropdown() {
  const el = document.getElementById("coProduct");
  if (!el) return;
  const current = el.value;
  el.innerHTML = `<option value="">— select —</option>` +
    CACHE.products.map((p) => `<option value="${p.product_name}" data-category="${p.category}">${p.product_name} (${p.category})</option>`).join("");
  if (current) el.value = current;
}

function onCoModeChange() {
  const mode = document.getElementById("coMode").value;
  document.getElementById("coWeightLabel").classList.toggle("hidden", mode !== "Weight");
  document.getElementById("coQtyLabel").classList.toggle("hidden", mode !== "Qty");
}

function onCoProductChange() {
  onCoWeightChange();
}

function onCoWeightChange() {
  const mode = document.getElementById("coMode").value;
  if (mode !== "Weight") return;
  const product = document.getElementById("coProduct").value;
  const weight = document.getElementById("coWeight").value;
  const price = lookupPricePerKg(product, weight);
  if (price > 0) document.getElementById("coPrice").value = price.toFixed(2);
}

function onCoPaymentMethodChange() {
  const isCash = document.getElementById("coPaymentMethod").value === "Cash";
  document.getElementById("coTenderedLabel").classList.toggle("hidden", !isCash);
  updateChangeDue();
}

function addToCart() {
  const product = document.getElementById("coProduct").value;
  const mode = document.getElementById("coMode").value;
  const weight = Number(document.getElementById("coWeight").value) || 0;
  const qty = Number(document.getElementById("coQty").value) || 0;
  const price = Number(document.getElementById("coPrice").value) || 0;

  if (!product) { showMsg("coMsg", "Select a product.", "error"); return; }
  if (mode === "Weight" && weight <= 0) { showMsg("coMsg", "Enter a weight.", "error"); return; }
  if (mode === "Qty" && qty <= 0) { showMsg("coMsg", "Enter a quantity.", "error"); return; }
  if (price <= 0) { showMsg("coMsg", "Enter a price.", "error"); return; }

  cart.push({ product, mode, weight: mode === "Weight" ? weight : null, qty: mode === "Qty" ? qty : null, price });
  renderCart();

  document.getElementById("coProduct").value = "";
  document.getElementById("coWeight").value = "";
  document.getElementById("coQty").value = "";
  document.getElementById("coPrice").value = "";
  showMsg("coMsg", "", "");
}

function renderCart() {
  const tbody = document.querySelector("#coCartTable tbody");
  tbody.innerHTML = cart.map((item, i) => {
    const qtyDisplay = item.mode === "Weight" ? `${item.weight} kg` : `x${item.qty}`;
    const total = (item.mode === "Weight" ? item.weight : item.qty) * item.price;
    return `<tr>
      <td>${item.product}</td><td>${qtyDisplay}</td><td>${money(item.price)}</td><td>${money(total)}</td>
      <td><button class="btn btn-ghost small co-remove" data-idx="${i}">✖</button></td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll(".co-remove").forEach((btn) => {
    btn.addEventListener("click", () => { cart.splice(Number(btn.dataset.idx), 1); renderCart(); });
  });
  updateChangeDue();
}

function cartTotal() {
  return cart.reduce((s, item) => s + (item.mode === "Weight" ? item.weight : item.qty) * item.price, 0);
}

function updateChangeDue() {
  const total = cartTotal();
  document.getElementById("coTotal").textContent = money(total);
  const isCash = document.getElementById("coPaymentMethod").value === "Cash";
  if (isCash) {
    const tendered = Number(document.getElementById("coTendered").value) || 0;
    document.getElementById("coChange").value = money(Math.max(0, tendered - total));
  } else {
    document.getElementById("coChange").value = money(0);
  }
}

function clearCart() {
  cart = [];
  renderCart();
  document.getElementById("coTendered").value = "";
  updateChangeDue();
  showMsg("coMsg", "", "");
}

async function completeSale() {
  if (cart.length === 0) { showMsg("coMsg", "Add at least one item to the cart.", "error"); return; }

  const paymentMethod = document.getElementById("coPaymentMethod").value;
  const total = cartTotal();
  let tendered = null, change = null;
  if (paymentMethod === "Cash") {
    tendered = Number(document.getElementById("coTendered").value) || 0;
    if (tendered < total) { showMsg("coMsg", "Amount tendered is less than the total.", "error"); return; }
    change = tendered - total;
  }

  const saleId = await nextSequentialId("sales", "SALE-", 4);
  const { error: saleErr } = await sb.from("sales").insert({
    id: saleId, sale_date: new Date().toISOString(), payment_method: paymentMethod,
    amount_tendered: tendered, change_given: change, subtotal: total,
  });
  if (saleErr) { showMsg("coMsg", saleErr.message, "error"); return; }

  const rows = cart.map((item, i) => ({
    sale_id: saleId, line_no: i + 1, product_name: item.product, mode: item.mode,
    weight_kg: item.weight, quantity: item.qty, price: item.price,
  }));
  const { error: itemsErr } = await sb.from("sale_items").insert(rows);
  if (itemsErr) { showMsg("coMsg", itemsErr.message, "error"); return; }

  const items = cart.map((item) => ({
    product_name: item.product, mode: item.mode, weight_kg: item.weight, quantity: item.qty, price: item.price,
  }));
  renderReceiptInto("rcpt", saleId, paymentMethod, tendered, change, total, items);
  document.getElementById("receiptDoc").classList.remove("hidden");
  cart = [];
  renderCart();
  document.getElementById("coTendered").value = "";
  showMsg("coMsg", "", "");
  refreshTodaySalesSummary();
  renderTillSalesSummary();
}

// Shared receipt renderer — prefix selects which set of element ids to fill
// ("rcpt" for the live checkout receipt, "shRcpt" for viewing a past sale in
// Sales History). items are DB-shaped: {product_name, mode, weight_kg, quantity, price}.
function renderReceiptInto(prefix, saleId, paymentMethod, tendered, change, total, items) {
  document.getElementById(prefix + "Number").textContent = saleId;
  document.getElementById(prefix + "Date").textContent = new Date().toLocaleString("en-GB");
  document.getElementById(prefix + "Payment").textContent = paymentMethod;
  document.getElementById(prefix + "ItemsBody").innerHTML = items.map((item) => {
    const qtyDisplay = item.mode === "Weight" ? `${item.weight_kg} kg` : `x${item.quantity}`;
    const lineTotal = (item.mode === "Weight" ? item.weight_kg : item.quantity) * item.price;
    return `<tr><td>${item.product_name}</td><td>${qtyDisplay}</td><td>${money(item.price)}</td><td>${money(lineTotal)}</td></tr>`;
  }).join("");
  document.getElementById(prefix + "Total").textContent = money(total);
  const isCash = paymentMethod === "Cash";
  document.getElementById(prefix + "CashRow").classList.toggle("hidden", !isCash);
  document.getElementById(prefix + "ChangeRow").classList.toggle("hidden", !isCash);
  if (isCash) {
    document.getElementById(prefix + "Tendered").textContent = money(tendered);
    document.getElementById(prefix + "Change").textContent = money(change);
  }
}

function startNewSale() {
  document.getElementById("receiptDoc").classList.add("hidden");
}

async function refreshTodaySalesSummary() {
  const el = document.getElementById("coTodaySummary");
  if (!el) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("sales").select("*");
  if (error) { console.error(error); return; }
  const todaySales = (data || []).filter((s) => (s.sale_date || "").slice(0, 10) === todayStr && s.status !== "Voided");
  const todayTotal = todaySales.reduce((s, sale) => s + Number(sale.subtotal || 0), 0);
  el.textContent = `Today: ${todaySales.length} sale(s), ${money(todayTotal)} total.`;
}

// ---------------------------------------------------------------------------
// TURKEY ALLOCATION PLANNING
// ---------------------------------------------------------------------------
// 0.5kg-wide weight bands, matching the shop's existing paper/Excel planning
// sheet. Grouped into three bands (small/medium/large) purely for readability
// — this grouping is independent of the turkey_pricing tiers, which price in
// three much broader bands.
const TURKEY_WEIGHT_BANDS = [
  { label: "<3.99", min: 0, max: 3.99, group: "small" },
  { label: "4.0-4.49", min: 4.0, max: 4.49, group: "small" },
  { label: "4.5-4.99", min: 4.5, max: 4.99, group: "small" },
  { label: "5.0-5.49", min: 5.0, max: 5.49, group: "small" },
  { label: "5.5-5.99", min: 5.5, max: 5.99, group: "small" },
  { label: "6.0-6.49", min: 6.0, max: 6.49, group: "small" },
  { label: "6.5-6.99", min: 6.5, max: 6.99, group: "small" },
  { label: "7.0-7.49", min: 7.0, max: 7.49, group: "small" },
  { label: "7.5-7.99", min: 7.5, max: 7.99, group: "small" },
  { label: "8.00-8.49", min: 8.0, max: 8.49, group: "medium" },
  { label: "8.5-8.99", min: 8.5, max: 8.99, group: "medium" },
  { label: "9.0-9.49", min: 9.0, max: 9.49, group: "large" },
  { label: "9.5-9.99", min: 9.5, max: 9.99, group: "large" },
  { label: "10.0-10.49", min: 10.0, max: 10.49, group: "large" },
  { label: "10.5-10.99", min: 10.5, max: 10.99, group: "large" },
  { label: ">11.0", min: 11.0, max: 999, group: "large" },
];

async function loadAllOrderDetails() {
  const { data, error } = await sb.from("order_details").select("*");
  if (error) { console.error(error); return []; }
  return data || [];
}

// Finds which weight band a weight belongs to. Weights that fall in the tiny
// gaps between bands (for example 7.495) go to the band just below, so no bird
// ever drops out of the counts.
function findWeightBand(w) {
  const weight = Number(w) || 0;
  const exact = TURKEY_WEIGHT_BANDS.find((b) => weight >= b.min && weight <= b.max);
  if (exact) return exact;
  for (let i = TURKEY_WEIGHT_BANDS.length - 1; i >= 0; i--) {
    if (weight >= TURKEY_WEIGHT_BANDS[i].min) return TURKEY_WEIGHT_BANDS[i];
  }
  return TURKEY_WEIGHT_BANDS[0];
}

// Counts order lines per weight band and, if stock rows are given, the birds in
// stock per band. spare = stock - ordered (negative means short).
function bucketByWeight(lines, stockRows) {
  const buckets = TURKEY_WEIGHT_BANDS.map((band) => ({ ...band, ordered: 0, allocated: 0, stock: 0, spare: 0 }));
  const indexOfBand = (w) => TURKEY_WEIGHT_BANDS.indexOf(findWeightBand(w));
  (lines || []).forEach((l) => {
    const b = buckets[indexOfBand(l.weight_kg)];
    b.ordered += 1;
    if (l.turkey_number) b.allocated += 1;
  });
  (stockRows || []).forEach((s) => {
    buckets[indexOfBand(s.weight_kg)].stock += Number(s.quantity) || 0;
  });
  buckets.forEach((b) => { b.spare = b.stock - b.ordered; });
  return buckets;
}

// Short / tight / ok wording and colour for a band (or the total). Wording is
// included as well as colour so it still reads clearly without colour.
function stockStatus(ordered, stock) {
  const spare = stock - ordered;
  if (ordered === 0 && stock === 0) return { level: "none", text: "—", style: "" };
  if (spare < 0) return { level: "short", text: `Short by ${-spare}`, style: "background:#f8d7da;color:#842029;font-weight:700;" };
  if (spare <= Math.ceil(stock * 0.1)) return { level: "tight", text: `Tight (${spare} spare)`, style: "background:#fff3cd;color:#664d03;font-weight:600;" };
  return { level: "ok", text: `${spare} spare`, style: "background:#d1e7dd;color:#0f5132;" };
}

function renderBandTable(tableId, buckets, showAllocation, hasStock) {
  const table = document.getElementById(tableId);
  const tbody = table.querySelector("tbody");
  const tfoot = table.querySelector("tfoot");

  tbody.innerHTML = buckets.map((b) => {
    if (showAllocation) {
      const left = b.ordered - b.allocated;
      let stockCells = "";
      if (hasStock) {
        const st = stockStatus(b.ordered, b.stock);
        stockCells = `<td>${b.stock}</td><td style="${st.style}">${st.text}</td>`;
      } else {
        stockCells = `<td>—</td><td>—</td>`;
      }
      return `<tr><td>${b.label}</td><td>${b.ordered}</td><td>${b.allocated}</td><td>${left}</td>${stockCells}</tr>`;
    }
    return `<tr><td>${b.label}</td><td>${b.ordered}</td></tr>`;
  }).join("");

  const totalOrdered = buckets.reduce((s, b) => s + b.ordered, 0);
  if (showAllocation) {
    const totalAllocated = buckets.reduce((s, b) => s + b.allocated, 0);
    const totalStock = buckets.reduce((s, b) => s + b.stock, 0);
    let stockFoot = `<td>—</td><td>—</td>`;
    if (hasStock) {
      const st = stockStatus(totalOrdered, totalStock);
      stockFoot = `<td>${totalStock}</td><td style="${st.style}">${st.text}</td>`;
    }
    tfoot.innerHTML = `<tr><td>TOTAL</td><td>${totalOrdered}</td><td>${totalAllocated}</td><td>${totalOrdered - totalAllocated}</td>${stockFoot}</tr>`;
  } else {
    tfoot.innerHTML = `<tr><td>TOTAL</td><td>${totalOrdered}</td></tr>`;
  }
}

let turkeyWholeChartInstance = null;
let turkeyMiscChartInstance = null;

function renderBandChart(canvasId, buckets, existingInstance, showStock) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return existingInstance;
  if (existingInstance) existingInstance.destroy();
  const datasets = [{ label: "Ordered", data: buckets.map((b) => b.ordered), backgroundColor: "#8B1E1E" }];
  if (showStock) {
    datasets.push({ label: "In stock", data: buckets.map((b) => b.stock), backgroundColor: "#7A9E7E" });
  }
  return new Chart(ctx, {
    type: "bar",
    data: { labels: buckets.map((b) => b.label), datasets },
    options: {
      plugins: { legend: { display: showStock } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

// Loads what the planning page and dashboard need: turkey order lines (leaving
// out lines on Cancelled orders, so cancelled birds don't use up stock on
// paper) and the stock rows.
async function loadTurkeyPlanningData() {
  const [linesRes, ordersRes, stockRes] = await Promise.all([
    sb.from("order_details").select("order_id,weight_kg,turkey_number,category").in("category", ["Turkey", "Turkey Misc"]),
    sb.from("orders").select("id,status,season"),
    sb.from("turkey_stock").select("*").order("weight_kg"),
  ]);
  if (linesRes.error) { console.error(linesRes.error); return null; }
  if (ordersRes.error) console.error(ordersRes.error);
  if (stockRes.error) console.error("turkey_stock:", stockRes.error);

  // Count only orders that are not cancelled and belong to the season being viewed
  const counted = new Set((ordersRes.data || [])
    .filter((o) => o.status !== "Cancelled" && (CACHE.viewSeason === "ALL" || (o.season || CACHE.season) === CACHE.viewSeason))
    .map((o) => o.id));
  const allLines = linesRes.data || [];
  const lines = ordersRes.error ? allLines : allLines.filter((l) => counted.has(l.order_id));
  return {
    wholeLines: lines.filter((l) => l.category === "Turkey"),
    miscLines: lines.filter((l) => l.category === "Turkey Misc"),
    stock: stockRes.error ? [] : (stockRes.data || []),
    stockError: !!stockRes.error,
  };
}

async function renderTurkeyPlanning() {
  const data = await loadTurkeyPlanningData();
  if (!data) return;

  const wholeBuckets = bucketByWeight(data.wholeLines, data.stock);
  const miscBuckets = bucketByWeight(data.miscLines);
  const hasStock = data.stock.length > 0;

  renderBandTable("turkeyWholeTable", wholeBuckets, true, hasStock);
  renderBandTable("turkeyMiscTable", miscBuckets, false, false);

  turkeyWholeChartInstance = renderBandChart("turkeyWholeChart", wholeBuckets, turkeyWholeChartInstance, hasStock);
  turkeyMiscChartInstance = renderBandChart("turkeyMiscChart", miscBuckets, turkeyMiscChartInstance, false);

  document.getElementById("turkeyPlanSeasonNote").textContent = `Showing orders for: ${viewSeasonLabel()}`;
  document.getElementById("turkeyPlanStockNote").textContent = data.stockError
    ? "Turkey stock couldn't be loaded. Ask your support person to check the turkey_stock table has been created."
    : hasStock ? "" : "No turkey stock entered yet. Add it on the Turkey Stock page to see In Stock and Spare / Short here.";
}

// Dashboard strip: total ordered vs in stock, and which weight bands are short.
async function renderTurkeyDashboard() {
  const cards = document.getElementById("turkeyDashCards");
  const note = document.getElementById("turkeyDashNote");
  if (!cards || !note) return;
  const data = await loadTurkeyPlanningData();
  if (!data) return;

  const buckets = bucketByWeight(data.wholeLines, data.stock);
  const ordered = buckets.reduce((s, b) => s + b.ordered, 0);
  const stock = buckets.reduce((s, b) => s + b.stock, 0);
  const hasStock = data.stock.length > 0;
  const spare = stock - ordered;
  const seasonSpan = document.getElementById("turkeyDashSeason");
  if (seasonSpan) seasonSpan.textContent = `(whole birds, ${viewSeasonLabel()}; cancelled orders left out)`;

  const card = (value, label, warn) => `<div class="kpi-card${warn ? " kpi-warning" : ""}"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
  cards.innerHTML =
    card(ordered, "Turkeys Ordered", false) +
    card(hasStock ? stock : "—", "Turkeys In Stock", false) +
    card(hasStock ? (spare < 0 ? `Short by ${-spare}` : `${spare} spare`) : "—", "Overall", hasStock && spare < 0);

  if (data.stockError) {
    note.textContent = "Turkey stock couldn't be loaded. Ask your support person to check the turkey_stock table has been created.";
    return;
  }
  if (!hasStock) {
    note.textContent = "No turkey stock entered yet. Add it on the Turkey Stock page.";
    return;
  }
  const short = buckets.filter((b) => b.spare < 0).map((b) => `${b.label} kg (short by ${-b.spare})`);
  const tight = buckets.filter((b) => b.ordered > 0 && b.spare >= 0 && stockStatus(b.ordered, b.stock).level === "tight").map((b) => `${b.label} kg (${b.spare} spare)`);
  const parts = [];
  if (short.length) parts.push("Short: " + short.join(", "));
  if (tight.length) parts.push("Tight: " + tight.join(", "));
  note.textContent = parts.length ? parts.join(". ") + "." : (ordered > 0 ? "Every weight band has enough stock." : "");
}

// ---------------------------------------------------------------------------
// TURKEY STOCK (the birds you raised, entered by weight)
// ---------------------------------------------------------------------------
let turkeyStockRows = [];

function wireTurkeyStock() {
  document.getElementById("tsAddBtn").addEventListener("click", addTurkeyStock);
  document.querySelector("#tsTable tbody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    if (e.target.classList.contains("ts-save")) saveTurkeyStockRow(tr);
    if (e.target.classList.contains("ts-remove")) removeTurkeyStockRow(tr);
  });
}

async function renderTurkeyStock() {
  const { data, error } = await sb.from("turkey_stock").select("*").order("weight_kg");
  if (error) {
    showMsg("tsMsg", "Couldn't load turkey stock: " + error.message + " (has the turkey_stock SQL been run in Supabase?)", "error");
    return;
  }
  turkeyStockRows = data || [];
  const tbody = document.querySelector("#tsTable tbody");
  tbody.innerHTML = turkeyStockRows.map((r) => `
    <tr data-id="${r.id}">
      <td><input type="number" class="ts-weight" step="0.1" min="0.1" value="${r.weight_kg}" style="width:90px"></td>
      <td>${findWeightBand(r.weight_kg).label}</td>
      <td><input type="number" class="ts-qty" step="1" min="0" value="${r.quantity}" style="width:90px"></td>
      <td><input type="text" class="ts-notes" value="${escHtml(r.notes)}"></td>
      <td><button class="btn btn-secondary small ts-save">Save</button> <button class="btn btn-ghost small ts-remove">✖ Remove</button></td>
    </tr>`).join("");
  const total = turkeyStockRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  document.querySelector("#tsTable tfoot").innerHTML = `<tr><td>TOTAL</td><td></td><td>${total}</td><td colspan="2"></td></tr>`;
}

// Shared checks for the add form and the Save button on a row.
function validateTurkeyStock(weight, qty, minQty, ignoreId) {
  if (!(weight > 0)) return "Enter a weight above 0 kg.";
  if (!Number.isInteger(qty) || qty < minQty) return minQty > 0 ? "Enter a whole number of birds, 1 or more." : "Enter a whole number of birds, 0 or more.";
  const dup = turkeyStockRows.find((r) => Number(r.weight_kg) === weight && String(r.id) !== String(ignoreId));
  if (dup) return `You already have a row for ${weight} kg. Edit that row instead of adding another.`;
  return null;
}

async function addTurkeyStock() {
  const weight = Number(document.getElementById("tsWeight").value);
  const qty = Number(document.getElementById("tsQty").value);
  const notes = document.getElementById("tsNotes").value.trim();
  const problem = validateTurkeyStock(weight, qty, 1, null);
  if (problem) { showMsg("tsMsg", problem, "error"); return; }
  const { error } = await sb.from("turkey_stock").insert({ weight_kg: weight, quantity: qty, notes: notes || null });
  if (error) { showMsg("tsMsg", error.message, "error"); return; }
  ["tsWeight", "tsQty", "tsNotes"].forEach((id) => (document.getElementById(id).value = ""));
  showMsg("tsMsg", `Added ${qty} x ${weight} kg.`, "success");
  await renderTurkeyStock();
  renderTurkeyDashboard();
}

async function saveTurkeyStockRow(tr) {
  const id = tr.dataset.id;
  const weight = Number(tr.querySelector(".ts-weight").value);
  const qty = Number(tr.querySelector(".ts-qty").value);
  const notes = tr.querySelector(".ts-notes").value.trim();
  const problem = validateTurkeyStock(weight, qty, 0, id);
  if (problem) { showMsg("tsMsg", problem, "error"); return; }
  const { error } = await sb.from("turkey_stock").update({ weight_kg: weight, quantity: qty, notes: notes || null }).eq("id", id);
  if (error) { showMsg("tsMsg", error.message, "error"); return; }
  showMsg("tsMsg", "Saved.", "success");
  await renderTurkeyStock();
  renderTurkeyDashboard();
}

async function removeTurkeyStockRow(tr) {
  const id = tr.dataset.id;
  const row = turkeyStockRows.find((r) => String(r.id) === String(id));
  const label = row ? `${row.quantity} x ${row.weight_kg} kg` : "this row";
  if (!confirm(`Remove ${label} from turkey stock?`)) return;
  const { error } = await sb.from("turkey_stock").delete().eq("id", id);
  if (error) { showMsg("tsMsg", error.message, "error"); return; }
  showMsg("tsMsg", "Removed.", "success");
  await renderTurkeyStock();
  renderTurkeyDashboard();
}

// ---------------------------------------------------------------------------
// SALES HISTORY
// ---------------------------------------------------------------------------
let allSalesCache = [];
let currentSalesHistoryView = [];

function wireSalesHistory() {
  document.getElementById("shFilterBtn").addEventListener("click", applySalesHistoryFilter);
  document.getElementById("shResetBtn").addEventListener("click", () => {
    document.getElementById("shFromDate").value = "";
    document.getElementById("shToDate").value = "";
    renderSalesHistoryTable(allSalesCache);
  });
  document.getElementById("shExportBtn").addEventListener("click", exportSalesHistoryCsv);
  document.getElementById("shRcptPrintBtn").addEventListener("click", () => window.print());
  document.getElementById("shRcptCloseBtn").addEventListener("click", () => {
    document.getElementById("shReceiptDoc").classList.add("hidden");
  });
}

async function loadAndRenderSalesHistory() {
  const { data, error } = await sb.from("sales").select("*").order("sale_date", { ascending: false });
  if (error) { console.error(error); return; }
  allSalesCache = (data || []).filter((s) => s.status !== "Voided");
  renderSalesHistoryTable(allSalesCache);
}

function applySalesHistoryFilter() {
  const from = document.getElementById("shFromDate").value;
  const to = document.getElementById("shToDate").value;
  let filtered = allSalesCache;
  if (from) filtered = filtered.filter((s) => s.sale_date >= from);
  if (to) {
    const toEnd = to + "T23:59:59";
    filtered = filtered.filter((s) => s.sale_date <= toEnd);
  }
  renderSalesHistoryTable(filtered);
}

function exportSalesHistoryCsv() {
  if (currentSalesHistoryView.length === 0) { alert("No sales to export for the current filter."); return; }
  const csvField = (v) => `"${String(v).replace(/"/g, '""')}"`; // quote every field so commas inside values (e.g. in the date) can't corrupt columns
  const header = "SaleID,DateTime,PaymentMethod,Subtotal,AmountTendered,ChangeGiven\n";
  const rows = currentSalesHistoryView
    .map((s) => [
      s.id, new Date(s.sale_date).toLocaleString("en-GB"), s.payment_method,
      s.subtotal, s.amount_tendered ?? "", s.change_given ?? "",
    ].map(csvField).join(","))
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SalesHistory_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderSalesHistoryTable(sales) {
  currentSalesHistoryView = sales;
  const tbody = document.querySelector("#shTable tbody");
  tbody.innerHTML = sales.map((s) => `
    <tr class="sh-row" data-sale-id="${s.id}" style="cursor:pointer;">
      <td>${new Date(s.sale_date).toLocaleString("en-GB")}</td>
      <td>${s.id}</td>
      <td>${s.payment_method}</td>
      <td>${money(s.subtotal)}</td>
    </tr>
  `).join("");

  const total = sales.reduce((sum, s) => sum + Number(s.subtotal || 0), 0);
  document.querySelector("#shTable tfoot").innerHTML =
    `<tr><td>TOTAL</td><td></td><td>${sales.length} sale(s)</td><td>${money(total)}</td></tr>`;

  tbody.querySelectorAll(".sh-row").forEach((tr) => {
    tr.addEventListener("click", () => viewHistoricSale(tr.dataset.saleId));
  });
}

async function viewHistoricSale(saleId) {
  const sale = allSalesCache.find((s) => s.id === saleId);
  if (!sale) return;
  const { data: items, error } = await sb.from("sale_items").select("*").eq("sale_id", saleId).order("line_no");
  if (error) { console.error(error); return; }

  renderReceiptInto("shRcpt", saleId, sale.payment_method, sale.amount_tendered, sale.change_given, sale.subtotal, items || []);
  document.getElementById("shRcptDate").textContent = new Date(sale.sale_date).toLocaleString("en-GB");
  document.getElementById("shReceiptDoc").classList.remove("hidden");
  document.getElementById("shReceiptDoc").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// BACKUP — full data export, since Supabase's free tier has no automated
// backups. This is a plain JSON snapshot of every table; if the database is
// ever lost or corrupted, this file has everything needed to rebuild it.
// ---------------------------------------------------------------------------
const BACKUP_TABLES = [
  "customers", "products", "turkey_pricing", "orders", "order_details",
  "payments", "unassigned", "sales", "sale_items", "turkey_stock", "settings",
];

function wireBackup() {
  document.getElementById("backupBtn").addEventListener("click", downloadFullBackup);
  document.getElementById("backupExcelBtn").addEventListener("click", downloadExcelBackup);
}

async function fetchAllBackupTables() {
  const result = {};
  let hadError = false;
  for (const table of BACKUP_TABLES) {
    const { data, error } = await sb.from(table).select("*");
    if (error) {
      console.error(table, error);
      hadError = true;
      result[table] = [];
    } else {
      result[table] = data || [];
    }
  }
  return { result, hadError };
}

async function downloadFullBackup() {
  showMsg("backupMsg", "Fetching all data…", "");
  const { result, hadError } = await fetchAllBackupTables();
  const backup = { exported_at: new Date().toISOString(), ...result };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ConisbeeBackup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  if (hadError) {
    showMsg("backupMsg", "Backup downloaded, but one or more tables had an error — check the browser console.", "error");
  } else {
    const counts = BACKUP_TABLES.map((t) => `${t}: ${backup[t].length}`).join(", ");
    showMsg("backupMsg", `Backup downloaded. Rows included — ${counts}.`, "success");
  }
}

async function downloadExcelBackup() {
  if (!window.XLSX) {
    showMsg("backupMsg", "Excel export library didn't load — check your internet connection and try again.", "error");
    return;
  }
  showMsg("backupMsg", "Fetching all data…", "");
  const { result, hadError } = await fetchAllBackupTables();

  const workbook = XLSX.utils.book_new();
  BACKUP_TABLES.forEach((table) => {
    const rows = result[table];
    const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);
    XLSX.utils.book_append_sheet(workbook, sheet, table.slice(0, 31));
  });

  XLSX.writeFile(workbook, `ConisbeeBackup_${new Date().toISOString().slice(0, 10)}.xlsx`);

  if (hadError) {
    showMsg("backupMsg", "Excel file downloaded, but one or more tables had an error — check the browser console.", "error");
  } else {
    const counts = BACKUP_TABLES.map((t) => `${t}: ${result[t].length}`).join(", ");
    showMsg("backupMsg", `Excel file downloaded. Rows included — ${counts}.`, "success");
  }
}

// ---------------------------------------------------------------------------
// SECURITY — Two-Factor Authentication (per-user, set up while logged in)
// ---------------------------------------------------------------------------
let pendingMfaFactorId = null;

function wireSecurity() {
  document.getElementById("mfaSetupBtn").addEventListener("click", startMfaEnrollment);
  document.getElementById("mfaConfirmBtn").addEventListener("click", confirmMfaEnrollment);
  document.getElementById("mfaRemoveBtn").addEventListener("click", removeMfa);
}

async function renderMfaStatus() {
  const { data, error } = await sb.auth.mfa.listFactors();
  const statusEl = document.getElementById("mfaStatusText");
  if (error) { statusEl.textContent = "Couldn't check status."; return; }

  const verified = (data?.totp || []).filter((f) => f.status === "verified");
  document.getElementById("mfaSetupArea").classList.add("hidden");
  document.getElementById("mfaMsg").textContent = "";

  if (verified.length > 0) {
    statusEl.textContent = "✅ 2FA is enabled on your account.";
    document.getElementById("mfaSetupBtn").classList.add("hidden");
    document.getElementById("mfaRemoveBtn").classList.remove("hidden");
  } else {
    statusEl.textContent = "2FA is not enabled yet.";
    document.getElementById("mfaSetupBtn").classList.remove("hidden");
    document.getElementById("mfaRemoveBtn").classList.add("hidden");
  }
}

async function startMfaEnrollment() {
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp" });
  if (error) { showMsg("mfaMsg", error.message, "error"); return; }

  pendingMfaFactorId = data.id;
  document.getElementById("mfaQrCode").innerHTML =
    `<img src="${data.totp.qr_code}" alt="2FA QR code" style="max-width:180px;">`;
  document.getElementById("mfaSecretText").textContent = data.totp.secret;
  document.getElementById("mfaSetupArea").classList.remove("hidden");
  document.getElementById("mfaEnrollCode").value = "";
  showMsg("mfaMsg", "", "");
}

async function confirmMfaEnrollment() {
  const code = document.getElementById("mfaEnrollCode").value.trim();
  if (!/^\d{6}$/.test(code)) {
    showMsg("mfaMsg", "Enter the 6-digit code shown in your authenticator app.", "error");
    return;
  }
  if (!pendingMfaFactorId) {
    showMsg("mfaMsg", "Click Set Up 2FA first.", "error");
    return;
  }

  const { data: challenge, error: challErr } = await sb.auth.mfa.challenge({ factorId: pendingMfaFactorId });
  if (challErr) { showMsg("mfaMsg", challErr.message, "error"); return; }

  const { error } = await sb.auth.mfa.verify({ factorId: pendingMfaFactorId, challengeId: challenge.id, code });
  if (error) { showMsg("mfaMsg", "Incorrect code — check your authenticator app and try again.", "error"); return; }

  pendingMfaFactorId = null;
  showMsg("mfaMsg", "2FA enabled. You'll be asked for a code next time you log in.", "success");
  renderMfaStatus();
}

async function removeMfa() {
  if (!confirm("Remove 2FA from your account? You'll only need your password to log in after this.")) return;

  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) { showMsg("mfaMsg", error.message, "error"); return; }
  const factor = (data?.totp || [])[0];
  if (!factor) { showMsg("mfaMsg", "No 2FA factor found.", "error"); return; }

  const { error: unenrollErr } = await sb.auth.mfa.unenroll({ factorId: factor.id });
  if (unenrollErr) { showMsg("mfaMsg", unenrollErr.message, "error"); return; }

  showMsg("mfaMsg", "2FA removed from your account.", "success");
  renderMfaStatus();
}

// ---------------------------------------------------------------------------
// HELP PANEL — a simple in-site assistant: browse by topic, or type a
// question and get keyword-matched to the closest topic. Not real AI — just
// scoring keyword overlap against the same content as the Staff User Guide.
// Zero cost, zero new backend, since it only ever reads this hardcoded list.
// ---------------------------------------------------------------------------
const HELP_TOPICS = [
  {
    id: "login", title: "Logging In",
    keywords: ["log in", "login", "sign in", "password", "locked out"],
    body: "Enter your email and password, then click Log In. There's no \"forgot password\" link — if you're locked out, ask whoever set up the system to reset it for you.",
  },
  {
    id: "checkout", title: "Checkout — Counter Sales",
    keywords: ["checkout", "till", "counter sale", "ring up", "cash", "card", "change due", "receipt"],
    body: "Choose the product, then By Weight or By Quantity. Price fills in automatically for fixed-price items. Click + Add to Cart, repeat for each item, choose Cash or Card, then Complete Sale. A printable receipt appears afterwards.",
  },
  {
    id: "orderEntry", title: "Order Entry — Pre-Orders",
    keywords: ["order entry", "pre-order", "christmas order", "new order", "turkey number", "delivery method", "collection date"],
    body: "Choose the customer (or create a new one), set delivery method/status/dates, add each item with its weight or quantity, then Save Order. You can save just to update delivery/status without adding new items. The Order box shows the customer's orders: by default new lines go into this season's order, or choose New separate order to start another one (for example ORD-C009-2). If the customer already has an order, its saved lines appear at the top: change a weight, price or detail and click Save on that line, or Remove it. Cancel Order marks the whole order Cancelled; it stays on record but no longer counts in totals or turkey numbers.",
  },
  {
    id: "customerSearch", title: "Customer Search & Payments",
    keywords: ["customer search", "find customer", "record payment", "deposit", "balance", "refund"],
    body: "Pick the customer to see their profile and balance. To change their name, phone, email, address, delivery preference, marketing opt-in or notes, open Edit customer details, change them and click Save details. To record a deposit or payment: choose which order it applies to, enter the amount, choose the type, click Record Payment. Fully settling the balance automatically marks the order Ready.",
  },
  {
    id: "invoice", title: "Invoice",
    keywords: ["invoice", "print invoice", "pdf"],
    body: "Choose the order, click Generate, then Print / Save as PDF. To email it, click Email Invoice: your email app opens with the message ready, and you press Send. To attach a PDF, save it first and attach the file.",
  },
  {
    id: "dashboard", title: "Dashboard",
    keywords: ["dashboard", "overview", "total order value", "kpi", "till sales"],
    body: "The overview page — total order value, deposits, balance outstanding, unassigned total, the full order list, and breakdowns by Status and Payment, plus Till Sales for Today/Week/Month/Year.",
  },
  {
    id: "salesHistory", title: "Sales History",
    keywords: ["sales history", "past sales", "old receipt", "reprint", "export csv sales"],
    body: "Every past counter sale, newest first. Filter by date, click a row to view/reprint its receipt, or Export CSV to download the list.",
  },
  {
    id: "marketing", title: "Marketing",
    keywords: ["marketing", "mailing list", "customer list", "opt-in"],
    body: "Filter by delivery method and/or opt-in, click Generate List, then Export CSV. The list includes each customer's email address. Only email customers whose opt-in is Y.",
  },
  {
    id: "seasons", title: "Seasons",
    keywords: ["season", "new season", "last year", "christmas 2026", "old orders", "start of season", "new christmas"],
    body: "Every order belongs to a season, such as Christmas 2026. The Season box at the top of the page chooses which season the Dashboard, Turkey Planning and Marketing totals show, or All seasons. New orders always go in the current season. At the start of a new Christmas, take a Backup and then use Start a New Season on the Backup page. Last season's orders stay on record.",
  },
  {
    id: "turkeyStock", title: "Turkey Stock",
    keywords: ["turkey stock", "how many turkeys do we have", "inventory", "stock", "birds", "enough turkeys"],
    body: "Type in the turkeys you have by weight, for example 100 birds of 8 kg. Use Save to change a row and Remove to delete one. The Dashboard and Turkey Planning compare this stock with what customers have ordered. Stock does not go down automatically, so update the quantities when your numbers change.",
  },
  {
    id: "turkeyPlanning", title: "Turkey Planning",
    keywords: ["turkey planning", "turkey allocation", "how many turkeys", "weight band", "allocated"],
    body: "Shows whole-turkey and crown/misc orders grouped into weight bands, so you know how many birds of each size to source. \"Allocated\" means a Turkey Number has been entered against that order. Cancelled orders are left out. \"In Stock\" and \"Spare / Short\" compare the birds you have (from the Turkey Stock page) with what has been ordered: red means short, amber means within 10% of running out, green means enough.",
  },
  {
    id: "unassigned", title: "Unassigned",
    keywords: ["unassigned", "no customer name", "resolve", "orphaned transaction"],
    body: "Old transactions with no customer name attached. Match one to an existing customer, or create a new one, using the panel at the bottom of the page.",
  },
  {
    id: "backup", title: "Backup",
    keywords: ["backup", "export data", "download data", "excel export", "csv export data"],
    body: "Download a full snapshot of every table — as JSON (exact, for restoring) or as Excel (.xlsx, one tab per table, for actually reading the data).",
  },
  {
    id: "security", title: "Security (2FA)",
    keywords: ["security", "2fa", "two factor", "authenticator", "mfa"],
    body: "Set up a 6-digit authenticator app code as a second login step, for your own account. If you lose access to your authenticator, someone with Supabase dashboard access will need to manually remove it to let you back in.",
  },
];

function helpBestMatch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let best = null, bestScore = 0;
  HELP_TOPICS.forEach((topic) => {
    let score = 0;
    topic.keywords.forEach((kw) => { if (q.includes(kw) || kw.includes(q)) score += kw.length; });
    if (score > bestScore) { bestScore = score; best = topic; }
  });
  return best;
}

function helpCurrentTabTopic() {
  const activeBtn = document.querySelector(".tab-btn.active");
  if (!activeBtn) return HELP_TOPICS[0];
  return HELP_TOPICS.find((t) => t.id === activeBtn.dataset.tab) || HELP_TOPICS[0];
}

function helpShowTopic(topic) {
  const el = document.getElementById("helpAnswer");
  el.innerHTML = `<strong>${topic.title}</strong>${topic.body}`;
  el.classList.remove("hidden");
}

function helpRenderTopicList() {
  const el = document.getElementById("helpTopicList");
  el.innerHTML = HELP_TOPICS.map((t) => `<button class="help-topic-btn" data-topic="${t.id}">${t.title}</button>`).join("");
  el.querySelectorAll(".help-topic-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const topic = HELP_TOPICS.find((t) => t.id === btn.dataset.topic);
      helpShowTopic(topic);
    });
  });
}

function wireHelp() {
  const fab = document.getElementById("helpBtn");
  const panel = document.getElementById("helpPanel");
  const searchInput = document.getElementById("helpSearchInput");

  helpRenderTopicList();

  fab.addEventListener("click", () => {
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden");
    if (opening) {
      helpShowTopic(helpCurrentTabTopic());
      searchInput.value = "";
      searchInput.focus();
    }
  });

  document.getElementById("helpCloseBtn").addEventListener("click", () => panel.classList.add("hidden"));

  searchInput.addEventListener("input", () => {
    const match = helpBestMatch(searchInput.value);
    if (match) helpShowTopic(match);
  });
}

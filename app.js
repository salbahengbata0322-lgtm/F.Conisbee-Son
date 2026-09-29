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

let supabase = null;
let currentUser = null;

// In-memory caches, refreshed on load / after writes
let CACHE = {
  customers: [],
  products: [],
  turkeyTiers: [],
  orders: [],        // from order_balances view, joined with customer name
  unassigned: [],
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
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  wireLoginScreen();
  wireTabs();
  wireOrderEntry();
  wireCustomerSearch();
  wireInvoice();
  wireMarketing();
  wireUnassigned();
  wireCheckout();

  // Resume session if already logged in (e.g. page refresh)
  supabase.auth.getSession().then(({ data }) => {
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
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    currentUser = null;
    document.getElementById("appShell").classList.add("hidden");
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    return;
  }
  onLoggedIn(data.user);
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
    });
  });
}

// ---------------------------------------------------------------------------
// Shared data loading
// ---------------------------------------------------------------------------
async function refreshAllData() {
  await Promise.all([loadCustomers(), loadProducts(), loadTurkeyTiers(), loadUnassigned()]);
  await loadOrderBalances();
  populateAllCustomerDropdowns();
  populateOrderDropdown();
  renderDashboard();
  renderUnassigned();
  if (document.querySelector("#oeLinesTable tbody").children.length === 0) addOeLine();
  populateCheckoutProductDropdown();
  refreshTodaySalesSummary();
}

async function loadCustomers() {
  const { data, error } = await supabase.from("customers").select("*").order("id");
  if (error) { console.error(error); return; }
  CACHE.customers = data || [];
}

async function loadProducts() {
  const { data, error } = await supabase.from("products").select("*").order("product_name");
  if (error) { console.error(error); return; }
  CACHE.products = data || [];
}

async function loadTurkeyTiers() {
  const { data, error } = await supabase.from("turkey_pricing").select("*").order("weight_min");
  if (error) { console.error(error); return; }
  CACHE.turkeyTiers = data || [];
}

async function loadUnassigned() {
  const { data, error } = await supabase.from("unassigned").select("*").order("id");
  if (error) { console.error(error); return; }
  CACHE.unassigned = data || [];
}

async function loadOrderBalances() {
  const { data, error } = await supabase.from("order_balances").select("*");
  if (error) { console.error(error); return; }
  const balances = data || [];
  const { data: orders, error: ordErr } = await supabase.from("orders").select("*");
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

function populateOrderDropdown() {
  const el = document.getElementById("invOrder");
  const opts = CACHE.orders
    .map((o) => `<option value="${o.id}">${o.id} — ${o.customer_name}</option>`)
    .join("");
  el.innerHTML = `<option value="">— select —</option>` + opts;
}

function money(n) {
  return "£" + (Number(n) || 0).toFixed(2);
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
  const { data, error } = await supabase.from(table).select("id");
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
  const totalOrderValue = CACHE.orders.reduce((s, o) => s + o.subtotal, 0);
  const totalPaid = CACHE.orders.reduce((s, o) => s + o.amount_paid, 0);
  const totalBalance = CACHE.orders.reduce((s, o) => s + o.balance_due, 0);
  const totalUnassigned = CACHE.unassigned.reduce((s, u) => s + Number(u.total || 0), 0);

  document.getElementById("kpiTotalOrderValue").textContent = money(totalOrderValue);
  document.getElementById("kpiDeposits").textContent = money(totalPaid);
  document.getElementById("kpiBalance").textContent = money(totalBalance);
  document.getElementById("kpiUnassigned").textContent = money(totalUnassigned);

  const tbody = document.querySelector("#dashOrdersTable tbody");
  tbody.innerHTML = CACHE.orders
    .map(
      (o) => `<tr>
        <td>${o.customer_name}</td><td>${o.status}</td><td>${o.delivery_method || ""}</td>
        <td>${money(o.subtotal)}</td><td>${money(o.amount_paid)}</td><td>${money(o.balance_due)}</td>
      </tr>`
    )
    .join("");

  renderOrderChart();
}

let chartInstance = null;
function renderOrderChart() {
  const ctx = document.getElementById("orderChart");
  if (!ctx || !window.Chart) return;
  const labels = CACHE.orders.map((o) => o.customer_name);
  const values = CACHE.orders.map((o) => o.subtotal);
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
  // Note: the first empty line row is added once product data has loaded — see refreshAllData().
}

async function onOeCustomerChange() {
  const custId = document.getElementById("oeCustomer").value;
  if (!custId) {
    document.getElementById("oeOrderId").value = "";
    return;
  }
  const orderId = "ORD-" + custId;
  document.getElementById("oeOrderId").value = orderId;

  const existing = CACHE.orders.find((o) => o.id === orderId);
  if (existing) {
    document.getElementById("oeDelivery").value = existing.delivery_method || "Unknown";
    document.getElementById("oeStatus").value = existing.status || "Pending";
    showMsg("oeMsg", "An order already exists for this customer — new lines will be added to it.", "success");
  } else {
    showMsg("oeMsg", "", "");
  }
  recalcOeTotals();
}

async function createCustomerInline() {
  const name = document.getElementById("oeNewName").value.trim();
  const phone = document.getElementById("oeNewPhone").value.trim();
  if (!name || !phone) {
    showMsg("oeMsg", "Enter both a name and phone number for the new customer.", "error");
    return;
  }
  const newId = await nextSequentialId("customers", "C", 3);
  const { error } = await supabase.from("customers").insert({
    id: newId, name, telephone: phone, delivery_method: "Unknown", marketing_opt_in: "Y",
  });
  if (error) { showMsg("oeMsg", error.message, "error"); return; }

  await loadCustomers();
  populateAllCustomerDropdowns();
  document.getElementById("oeCustomer").value = newId;
  document.getElementById("oeNewCustomerForm").classList.add("hidden");
  document.getElementById("oeNewName").value = "";
  document.getElementById("oeNewPhone").value = "";
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

  const custId = document.getElementById("oeCustomer").value;
  const existing = CACHE.orders.find((o) => o.customer_id === custId);
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
    const product = tr.querySelector(".oe-product").value;
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
        product, weight, price,
        quantity: qtyVal ? Number(qtyVal) : null,
        turkey_type: turkeyType || null,
        weight_mode: weightMode || null,
        weight_range_kg: weightRange ? Number(weightRange) : null,
        turkey_number: turkeyNumber || null,
        stuffing_type: stuffingType || null,
      });
    }
  });
  if (lines.length === 0) { showMsg("oeMsg", "Add at least one line item.", "error"); return; }

  const status = document.getElementById("oeStatus").value;
  const delivery = document.getElementById("oeDelivery").value;
  const collectionDate = document.getElementById("oeCollectionDate").value || null;
  const deliveryDate = document.getElementById("oeDeliveryDate").value || null;

  const existing = CACHE.orders.find((o) => o.id === orderId);
  if (!existing) {
    const { error } = await supabase.from("orders").insert({
      id: orderId, customer_id: custId, status, delivery_method: delivery,
      collection_date: collectionDate, delivery_date: deliveryDate,
    });
    if (error) { showMsg("oeMsg", error.message, "error"); return; }
  } else {
    await supabase.from("orders").update({
      status, delivery_method: delivery, collection_date: collectionDate, delivery_date: deliveryDate,
    }).eq("id", orderId);
  }

  const { data: existingLines } = await supabase.from("order_details").select("line_no").eq("order_id", orderId);
  let maxLine = 0;
  (existingLines || []).forEach((l) => { if (l.line_no > maxLine) maxLine = l.line_no; });

  const rows = lines.map((l, i) => ({
    order_id: orderId, line_no: maxLine + i + 1, product_name: l.product, weight_kg: l.weight, price_per_kg: l.price,
    quantity: l.quantity, turkey_type: l.turkey_type, weight_mode: l.weight_mode,
    weight_range_kg: l.weight_range_kg, turkey_number: l.turkey_number, stuffing_type: l.stuffing_type,
  }));
  const { error: insErr } = await supabase.from("order_details").insert(rows);
  if (insErr) { showMsg("oeMsg", insErr.message, "error"); return; }

  showMsg("oeMsg", `Order ${orderId} saved (${lines.length} line(s)).`, "success");
  await loadOrderBalances();
  populateOrderDropdown();
  renderDashboard();
  clearOrderForm();
}

function clearOrderForm() {
  document.getElementById("oeCustomer").value = "";
  document.getElementById("oeOrderId").value = "";
  document.getElementById("oeDelivery").value = "Unknown";
  document.getElementById("oeStatus").value = "Pending";
  document.getElementById("oeCollectionDate").value = "";
  document.getElementById("oeDeliveryDate").value = "";
  document.querySelector("#oeLinesTable tbody").innerHTML = "";
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
  document.getElementById("csCustomer").addEventListener("change", renderCustomerProfile);
  document.getElementById("csPayBtn").addEventListener("click", recordPayment);
}

function renderCustomerProfile() {
  const custId = document.getElementById("csCustomer").value;
  const cust = CACHE.customers.find((c) => c.id === custId);
  if (!cust) {
    ["csName", "csPhone", "csAddress", "csDelivery", "csOptIn", "csNotes"].forEach((id) => (document.getElementById(id).textContent = "—"));
    document.querySelector("#csOrdersTable tbody").innerHTML = "";
    return;
  }
  document.getElementById("csName").textContent = cust.name || "—";
  document.getElementById("csPhone").textContent = cust.telephone || "—";
  document.getElementById("csAddress").textContent = cust.address || "—";
  document.getElementById("csDelivery").textContent = cust.delivery_method || "—";
  document.getElementById("csOptIn").textContent = cust.marketing_opt_in || "—";
  document.getElementById("csNotes").textContent = cust.notes || "—";

  const orders = CACHE.orders.filter((o) => o.customer_id === custId);
  document.querySelector("#csOrdersTable tbody").innerHTML = orders
    .map((o) => `<tr><td>${o.id}</td><td>${o.status}</td><td>${money(o.subtotal)}</td><td>${money(o.amount_paid)}</td><td>${money(o.balance_due)}</td></tr>`)
    .join("");
}

async function recordPayment() {
  const custId = document.getElementById("csCustomer").value;
  const amount = Number(document.getElementById("csPayAmount").value);
  const type = document.getElementById("csPayType").value;

  if (!custId) { showMsg("csMsg", "Select a customer first.", "error"); return; }
  if (!amount || amount <= 0) { showMsg("csMsg", "Enter a positive amount.", "error"); return; }

  const orderId = "ORD-" + custId;
  const orderExists = CACHE.orders.some((o) => o.id === orderId);
  if (!orderExists) {
    if (!confirm(`No order exists yet for ${custId}. Record the payment anyway? It will apply once an order is saved for them.`)) return;
  }

  const storedAmount = type === "Refund" ? amount : -amount;
  const paymentId = await nextSequentialId("payments", "PAY", 3);

  const { error } = await supabase.from("payments").insert({
    id: paymentId, customer_id: custId, order_id: orderExists ? orderId : null, amount: storedAmount, type,
  });
  if (error) { showMsg("csMsg", error.message, "error"); return; }

  showMsg("csMsg", `${paymentId} recorded (${type}, ${money(amount)}).`, "success");
  document.getElementById("csPayAmount").value = "";
  await loadOrderBalances();
  renderCustomerProfile();
  renderDashboard();
}

// ---------------------------------------------------------------------------
// INVOICE
// ---------------------------------------------------------------------------
function wireInvoice() {
  document.getElementById("invGenerateBtn").addEventListener("click", generateInvoice);
  document.getElementById("invPrintBtn").addEventListener("click", () => window.print());
}

async function generateInvoice() {
  const orderId = document.getElementById("invOrder").value;
  if (!orderId) { showMsg("invMsg", "Select an order.", "error"); return; }

  const order = CACHE.orders.find((o) => o.id === orderId);
  if (!order) { showMsg("invMsg", "Order not found.", "error"); return; }
  const cust = CACHE.customers.find((c) => c.id === order.customer_id);

  const { data: lines, error } = await supabase.from("order_details").select("*").eq("order_id", orderId).order("line_no");
  if (error) { showMsg("invMsg", error.message, "error"); return; }

  document.getElementById("invNumber").textContent = "INV-" + order.customer_id;
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
      const order = CACHE.orders.find((o) => o.customer_id === c.id);
      return { ...c, order_total: order ? order.subtotal : 0 };
    });

  document.querySelector("#mktTable tbody").innerHTML = lastMarketingResults
    .map((c) => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.telephone || ""}</td><td>${c.delivery_method || ""}</td><td>${money(c.order_total)}</td></tr>`)
    .join("");
}

function exportMarketingCsv() {
  if (lastMarketingResults.length === 0) { alert("Click 'Generate List' first."); return; }
  const header = "CustomerID,Name,Telephone,Delivery,OrderTotal\n";
  const rows = lastMarketingResults.map((c) => `${c.id},${c.name},${c.telephone || ""},${c.delivery_method || ""},${c.order_total}`).join("\n");
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
    const { error } = await supabase.from("customers").insert({
      id: custId, name: newName, telephone: newPhone, delivery_method: "Unknown", marketing_opt_in: "Y",
      notes: "Created via Unassigned Resolution on " + new Date().toISOString().slice(0, 10),
    });
    if (error) { showMsg("resMsg", error.message, "error"); return; }
  }

  const orderId = "ORD-" + custId;
  const { data: existingOrder } = await supabase.from("orders").select("id").eq("id", orderId).maybeSingle();
  if (!existingOrder) {
    const { error } = await supabase.from("orders").insert({
      id: orderId, customer_id: custId, status: "Pending", delivery_method: "Unknown",
      notes: "Includes a line resolved from Unassigned Review",
    });
    if (error) { showMsg("resMsg", error.message, "error"); return; }
  }

  const { data: existingLines } = await supabase.from("order_details").select("line_no").eq("order_id", orderId);
  let maxLine = 0;
  (existingLines || []).forEach((l) => { if (l.line_no > maxLine) maxLine = l.line_no; });

  const { error: insErr } = await supabase.from("order_details").insert({
    order_id: orderId, line_no: maxLine + 1, product_name: row.product, weight_kg: row.weight_kg, price_per_kg: row.price_per_kg,
    source_item_no: row.item_no,
    flag: `Resolved from Unassigned Review on ${new Date().toISOString().slice(0, 10)} (originally on ${row.source_sheet} sheet)`,
  });
  if (insErr) { showMsg("resMsg", insErr.message, "error"); return; }

  const { error: delErr } = await supabase.from("unassigned").delete().eq("id", row.id);
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
  const { error: saleErr } = await supabase.from("sales").insert({
    id: saleId, sale_date: new Date().toISOString(), payment_method: paymentMethod,
    amount_tendered: tendered, change_given: change, subtotal: total,
  });
  if (saleErr) { showMsg("coMsg", saleErr.message, "error"); return; }

  const rows = cart.map((item, i) => ({
    sale_id: saleId, line_no: i + 1, product_name: item.product, mode: item.mode,
    weight_kg: item.weight, quantity: item.qty, price: item.price,
  }));
  const { error: itemsErr } = await supabase.from("sale_items").insert(rows);
  if (itemsErr) { showMsg("coMsg", itemsErr.message, "error"); return; }

  renderReceipt(saleId, paymentMethod, tendered, change, total);
  cart = [];
  renderCart();
  document.getElementById("coTendered").value = "";
  showMsg("coMsg", "", "");
  refreshTodaySalesSummary();
}

function renderReceipt(saleId, paymentMethod, tendered, change, total) {
  document.getElementById("rcptNumber").textContent = saleId;
  document.getElementById("rcptDate").textContent = new Date().toLocaleString("en-GB");
  document.getElementById("rcptPayment").textContent = paymentMethod;
  document.getElementById("rcptItemsBody").innerHTML = cart.map((item) => {
    const qtyDisplay = item.mode === "Weight" ? `${item.weight} kg` : `x${item.qty}`;
    const lineTotal = (item.mode === "Weight" ? item.weight : item.qty) * item.price;
    return `<tr><td>${item.product}</td><td>${qtyDisplay}</td><td>${money(item.price)}</td><td>${money(lineTotal)}</td></tr>`;
  }).join("");
  document.getElementById("rcptTotal").textContent = money(total);
  const isCash = paymentMethod === "Cash";
  document.getElementById("rcptCashRow").classList.toggle("hidden", !isCash);
  document.getElementById("rcptChangeRow").classList.toggle("hidden", !isCash);
  if (isCash) {
    document.getElementById("rcptTendered").textContent = money(tendered);
    document.getElementById("rcptChange").textContent = money(change);
  }
  document.getElementById("receiptDoc").classList.remove("hidden");
}

function startNewSale() {
  document.getElementById("receiptDoc").classList.add("hidden");
}

async function refreshTodaySalesSummary() {
  const el = document.getElementById("coTodaySummary");
  if (!el) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from("sales").select("*");
  if (error) { console.error(error); return; }
  const todaySales = (data || []).filter((s) => (s.sale_date || "").slice(0, 10) === todayStr && s.status !== "Voided");
  const todayTotal = todaySales.reduce((s, sale) => s + Number(sale.subtotal || 0), 0);
  el.textContent = `Today: ${todaySales.length} sale(s), ${money(todayTotal)} total.`;
}

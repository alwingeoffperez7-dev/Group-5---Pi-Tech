// Data comes from the backend through WasteLessAPI (/js/api.js).
// Not logged in as a vendor -> api.js sends you to the log-in page.
let stallData = { stall_id: "", stall_name: "" };
let categories = [];
let packagingList = []; // [{ packaging_id, packaging_name, description, example }]
let products = [];
let submissions = [];

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Show a backend error (and its field messages) under a form.
function showError(elId, err) {
  const details = Object.values(err.details || {});
  document.getElementById(elId).classList.remove("ok");
  document.getElementById(elId).textContent =
    err.message + (details.length ? "\n- " + details.join("\n- ") : "");
}

// ---------- Loading from the backend ----------
async function loadStall() {
  const s = await WasteLessAPI.getStall();
  stallData = s;
  initStallInfo();
}

// ---------- Sidebar pages (#dashboard, #listing, #feedback) ----------
function showPage() {
  const name = location.hash.slice(1) || "dashboard";
  const page = document.getElementById("page-" + name) ? name : "dashboard";
  document.querySelectorAll(".page").forEach((p) => {
    p.hidden = p.id !== "page-" + page;
  });
  document.querySelectorAll(".sidebar-nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + page);
  });
  window.scrollTo(0, 0);
  if (page === "dashboard") loadEcoTips().catch(console.error); // pop-up on every dashboard visit
}
window.addEventListener("hashchange", showPage);

async function loadCategories() {
  const list = await WasteLessAPI.getCategories();
  categories = list.map((c) => c.category_name);
  initCategories();
}

async function loadPackaging() {
  packagingList = await WasteLessAPI.getPackaging();
  const select = document.getElementById("formPackaging");
  if (select) {
    select.innerHTML = "";
    packagingList.forEach((pk) => {
      const opt = document.createElement("option");
      opt.value = pk.packaging_id;
      opt.textContent = pk.packaging_name;
      if (pk.example) opt.title = "e.g. " + pk.example; // shows on hover
      select.appendChild(opt);
    });
  }
}

async function loadProducts() {
  const data = await WasteLessAPI.getProducts();
  // backend sends category_name; this page uses `category`
  products = data.products.map((p) => ({ ...p, category: p.category_name }));
  renderDashboard();
  applyFilters();
}

async function loadSubmissions() {
  const data = await WasteLessAPI.getSubmissions();
  submissions = data.submissions.map((s) => ({
    id: s.feedback_id,
    type: s.feedback_type,
    subject: s.subject,
    date: String(s.created_at).split("T")[0],
    status: s.status,
  }));
  renderSubmissions();
}

// DOMContentLoaded Initialization
document.addEventListener("DOMContentLoaded", async () => {
  showPage();
  setupEventListeners();
  try {
    await Promise.all([
      loadStall(),
      loadCategories(),
      loadPackaging(),
      loadSubmissions(),
      loadDashboard(),
      loadReportStatus(),
      loadNotifications(),
    ]);
    await loadProducts();
  } catch (err) {
    console.error(err);
  }
});

// Dashboard cards: Products, Package Category
function renderDashboard() {
  const pad = (n) => (n < 10 ? `0${n}` : String(n));
  const countBadge = document.getElementById("count");
  const breakdown = document.getElementById("packageBreakdown");
  const soldItems = document.getElementById("vendor-sold-items");

  if (countBadge) countBadge.textContent = pad(products.length);

  if (breakdown) {
    breakdown.innerHTML = packagingList
      .map((pk) => {
        const n = products.filter(
          (p) => p.packaging_id === pk.packaging_id,
        ).length;
        return `<li>${escapeHtml(pk.packaging_name)}: <strong>${n}</strong></li>`;
      })
      .join("");
  }

  if (soldItems) {
    soldItems.textContent =
      stallData.summary?.plastic_items_sold_this_week ?? 0;
  }
}

// ---------- Dashboard graphs (Chart.js) ----------
const charts = {};
// One colour per packaging category line (in order); repeats if the admin adds more than 6
const LINE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#d97706",
  "#16a34a",
  "#7c3aed",
  "#0891b2",
];

// Draws (or redraws) one chart; shows a message instead when there's nothing to draw.
function drawChart(id, config, emptyMessage) {
  const status = document.getElementById(id + "Status");
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
  if (typeof Chart === "undefined") {
    if (status) status.textContent = "Chart library failed to load.";
    return;
  }
  if (status) status.textContent = emptyMessage || "";
  config.options = { responsive: false, animation: false, ...config.options };
  charts[id] = new Chart(document.getElementById(id), config);
}

// Packaging line graph (one line per packaging category)
// Range comes from the "Show" dropdown above the graph (7 / 14 / 30 days)
async function loadDashboard() {
  const range = document.getElementById("packagingRange");
  const data = await WasteLessAPI.getDashboard(range ? range.value : 7);

  const anySold = data.lines.some((line) => line.values.some((n) => n > 0));
  drawChart(
    "packagingChart",
    {
      type: "line",
      data: {
        labels: data.labels.map((d) =>
          new Date(d + "T00:00").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
        ),
        datasets: data.lines.map((line, i) => ({
          label: line.label,
          data: line.values,
          borderColor: LINE_COLORS[i % LINE_COLORS.length],
          backgroundColor: LINE_COLORS[i % LINE_COLORS.length],
          cubicInterpolationMode: "monotone", // smooth, but never dips below 0 between points
        })),
      },
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            title: { display: true, text: "Items sold" },
          },
        },
      },
    },
    anySold ? "" : `No sales recorded in the last ${data.days} days yet.`,
  );
}

// ---------- Eco-Tip pop-up ----------
// The backend checks this week's plastic waste against the rules (admin page > Eco-Tips).
// Over the weekly limit -> the pop-up opens (on every dashboard visit) with the effects and
// tips of the top plastic categories. Under the limit -> the banner congratulates instead.
async function loadEcoTips() {
  const data = await WasteLessAPI.getEcoTips();
  const warning = data.level === "warning";

  const banner = document.getElementById("ecoTipBanner");
  const bannerText = document.getElementById("ecoTipBannerText");
  const openBtn = document.getElementById("ecoTipOpenBtn");
  if (bannerText) {
    bannerText.textContent = warning
      ? `Your stall is over the weekly plastic limit (${data.week_total} of ${data.limit} pieces).`
      : data.title + ". " + data.tip;
  }
  if (banner) banner.classList.toggle("positive", !warning);
  if (openBtn) openBtn.hidden = !warning;

  document.getElementById("ecoTipTitle").textContent = "WARNING: " + data.title;
  document.getElementById("ecoTipMessage").textContent = data.tip;
  document.getElementById("ecoTipCategories").innerHTML = data.categories
    .map(
      (c) => `
    <section class="eco-category">
      <h3>${escapeHtml(c.packaging_name)}: ${c.pieces} pieces (${c.percent}%)</h3>
      ${
        c.effects.length
          ? `<p>Negative community and environmental effects:</p>
        <ul>${c.effects.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`
          : ""
      }
      <p class="eco-tip-text"><strong>Eco-Tip:</strong> ${escapeHtml(c.tip)}</p>
    </section>`,
    )
    .join("");

  const onDashboard = !document.getElementById("page-dashboard").hidden; // still there when the data arrives
  if (warning && onDashboard) openEcoTip();
  else if (!warning) closeEcoTip();
}

function openEcoTip() {
  const popup = document.getElementById("ecoTipPopup");
  popup.hidden = false;
  popup.scrollIntoView({ block: "center" });
  document.getElementById("ecoTipCloseBtn").focus();
}

function closeEcoTip() {
  document.getElementById("ecoTipPopup").hidden = true;
}

// ---------- Download Report (PDF, once every 7 days) ----------
const formatWhen = (d) =>
  new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// Button says when the next report can be downloaded
async function loadReportStatus() {
  const status = await WasteLessAPI.getReportStatus();
  const btn = document.getElementById("downloadReportBtn");
  if (!btn) return;
  btn.disabled = !status.available;
  btn.textContent = status.available
    ? "Download Report"
    : "Next report: " + formatWhen(status.next_available_at);
  btn.title = status.last_downloaded_at
    ? "Last downloaded " + formatWhen(status.last_downloaded_at)
    : "";
}

async function downloadReport() {
  const btn = document.getElementById("downloadReportBtn");
  if (
    !confirm(
      "You can download the report only once every 7 days. Download it now?",
    )
  )
    return;
  btn.disabled = true;
  btn.textContent = "Preparing report...";
  try {
    const res = await fetch("/api/stall/report", { method: "POST" });
    if (res.status === 401) {
      location.href = "log-in.html";
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not create the report.");
    }
    // Save the PDF the server sent
    const blob = await res.blob();
    const name = (res.headers.get("Content-Disposition") || "").match(
      /filename="(.+)"/,
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name ? name[1] : "WasteLess-Report.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showListingMsg("Report downloaded.");
  } catch (err) {
    alert(err.message);
  } finally {
    loadReportStatus();
  }
}

// Initialize Stall Header details
function initStallInfo() {
  const stallIdLabel = document.getElementById("stallIdLabel");
  const stallNameHeader = document.getElementById("stall");
  const subtitle = document.querySelector(".modal-subtitle");

  if (stallIdLabel)
    stallIdLabel.textContent = `Stall ID #${stallData.stall_id}`;
  if (stallNameHeader) stallNameHeader.textContent = stallData.stall_name;
  if (subtitle)
    subtitle.textContent = `Stall ${stallData.stall_id} ${stallData.stall_name}`;
}

// Populate Category Dropdowns
function initCategories() {
  const filterCat = document.getElementById("filterCat");
  const formCat = document.getElementById("formCat");

  if (filterCat) {
    // Clear and add 'All' plus categories
    filterCat.innerHTML = '<option value="All">All Categories</option>';
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      filterCat.appendChild(opt);
    });
  }

  if (formCat) {
    formCat.innerHTML = "";
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      formCat.appendChild(opt);
    });
  }
}

// ---------- Product table (edited cell by cell, like a spreadsheet) ----------
// Each row is a copy of <template id="rowTemplate">. A changed cell is saved right away
// (PUT with just that field). Stock +/- changes the stock; Sold +/- records / undoes a sale.

// Fill one row's cells from a product (also used to undo a cell the server refused).
function fillRow(tr, prod) {
  tr.dataset.productId = prod.product_id;
  tr.querySelector(".cell-id").textContent = prod.product_id;
  const img = tr.querySelector(".row-img");
  if (prod.image_url) { img.src = prod.image_url; img.hidden = false; img.alt = prod.product_name; }
  else { img.removeAttribute("src"); img.hidden = true; }

  const field = (name) => tr.querySelector(`[data-field="${name}"]:not(button)`);
  field("product_name").value = prod.product_name;
  field("description").value = prod.description || "";
  field("unit_price").value = Number(prod.unit_price).toFixed(2);
  field("stock").value = prod.stock;
  field("sold").value = prod.sold;
  field("stock").classList.toggle("low-stock", prod.is_low_stock);
  field("stock").title = prod.is_low_stock ? "Low stock" : "";

  const packaging = field("packaging_id");
  packaging.innerHTML = packagingList
    .map((pk) => `<option value="${pk.packaging_id}">${escapeHtml(pk.packaging_name)}</option>`)
    .join("");
  packaging.value = prod.packaging_id;

  const category = field("category");
  category.innerHTML = categories.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
  category.value = prod.category;
}

function renderProducts(dataToRender) {
  const tbody = document.getElementById("rows");
  const template = document.getElementById("rowTemplate");
  if (!tbody || !template) return;

  tbody.innerHTML = "";
  if (dataToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-row">No products found.</td></tr>`;
    return;
  }
  dataToRender.forEach((prod) => {
    const tr = template.content.firstElementChild.cloneNode(true);
    fillRow(tr, prod);
    tbody.appendChild(tr);
  });
}

// Keep the local copy + that row up to date after the server answers.
function updateProduct(prod) {
  prod = { ...prod, category: prod.category_name };
  products = products.map((p) => (p.product_id === prod.product_id ? prod : p));
  const tr = document.querySelector(`#rows tr[data-product-id="${prod.product_id}"]`);
  if (tr) fillRow(tr, prod);
  renderDashboard();
}

function rowProduct(tr) {
  return products.find((p) => String(p.product_id) === tr.dataset.productId);
}

// A cell was changed: save just that field.
async function saveCell(input) {
  const tr = input.closest("tr");
  const prod = rowProduct(tr);
  const fd = new FormData();
  fd.append(input.dataset.field, input.value);
  try {
    updateProduct(await WasteLessAPI.editProduct(prod.product_id, fd));
    showListingMsg("Saved.");
  } catch (err) {
    fillRow(tr, prod); // put the old value back
    alert(err.message + (Object.values(err.details || {}).length ? "\n" + Object.values(err.details).join("\n") : ""));
  }
}

// Stock +/- (change the number, then save) and Sold +/- (record / undo a sale).
async function stepQuantity(btn) {
  const tr = btn.closest("tr");
  const prod = rowProduct(tr);
  const plus = btn.dataset.qty === "plus";
  btn.disabled = true;
  try {
    if (btn.dataset.field === "sold") {
      updateProduct(plus ? await WasteLessAPI.recordSale(prod.product_id) : await WasteLessAPI.undoSale(prod.product_id));
      loadStall().then(renderDashboard).catch(console.error); // "Items Sold This Week" card
      loadEcoTips().catch(console.error);
    } else {
      const input = tr.querySelector('input[data-field="stock"]');
      input.value = Math.max(0, (parseInt(input.value, 10) || 0) + (plus ? 1 : -1));
      await saveCell(input);
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Notification bell (messages from the admin) ----------
async function loadNotifications() {
  const data = await WasteLessAPI.getNotifications();
  const badge = document.getElementById("notifBadge");
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  if (badge) { badge.textContent = data.unread; badge.hidden = !data.unread; }
  if (empty) empty.hidden = data.notifications.length > 0;
  if (!list) return;
  list.innerHTML = data.notifications.map((n) => `
    <li class="notif-item${n.is_read ? " read" : ""}" data-notif-id="${n.notification_id}">
      <div class="notif-text">
        <strong class="notif-subject">${escapeHtml(n.product_name || "Message from the admin")}</strong>
        <p class="notif-message">${escapeHtml(n.message)}</p>
        <small class="stat-note">${escapeHtml(formatWhen(n.created_at))}</small>
      </div>
      ${n.is_read ? `<span class="notif-status">Read</span>`
        : `<button type="button" class="btn outline btn-sm notif-read-btn">Read</button>`}
    </li>`).join("");
}

// Render Submissions List
function renderSubmissions() {
  const subsList = document.getElementById("subs");
  if (!subsList) return;

  subsList.innerHTML = "";
  if (submissions.length === 0) {
    subsList.innerHTML = `<li class="empty-row">No submissions yet.</li>`;
    return;
  }

  submissions.forEach((sub) => {
    const li = document.createElement("li");
    li.className = "submission-item";
    li.innerHTML = `
      <div>
        <strong>[${escapeHtml(sub.type)}] ${escapeHtml(sub.subject)}</strong>
        <div class="stat-note">Date: ${escapeHtml(sub.date)}</div>
      </div>
      <span class="status-badge ${sub.status.toLowerCase()}">${sub.status}</span>
    `;
    subsList.appendChild(li);
  });
}

// Search & category filter (runs on the products already loaded)
function applyFilters() {
  const searchInput = document.getElementById("q");
  const filterCat = document.getElementById("filterCat");
  const query = searchInput ? searchInput.value.toLowerCase() : "";
  const selectedCat = filterCat ? filterCat.value : "All";

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.product_name.toLowerCase().includes(query) ||
      (p.description || "").toLowerCase().includes(query);
    const matchesCat = selectedCat === "All" || p.category === selectedCat;
    return matchesSearch && matchesCat;
  });

  renderProducts(filtered);
}

// Event Listeners Setup
function setupEventListeners() {
  // Search & Filter
  const searchInput = document.getElementById("q");
  const filterCat = document.getElementById("filterCat");
  const refreshBtn = document.getElementById("refresh");

  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (filterCat) filterCat.addEventListener("change", applyFilters);
  if (refreshBtn)
    refreshBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (filterCat) filterCat.value = "All";
      loadProducts();
    });

  // Modal / Add Form Toggles
  const openAddModalBtn = document.getElementById("openAddModalBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelEditBtn = document.getElementById("cancelEdit");
  const productFormContainer = document.getElementById("productFormContainer");
  const productForm = document.getElementById("productForm");

  if (openAddModalBtn) {
    openAddModalBtn.addEventListener("click", () => openProductModal(null));
  }

  const closeForm = () => productFormContainer.close();

  if (closeModalBtn) closeModalBtn.addEventListener("click", closeForm);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeForm);

  // Product table: cells save on change; +/- buttons; Delete
  const rows = document.getElementById("rows");
  if (rows) {
    rows.addEventListener("change", (e) => {
      const input = e.target.closest(".inline-input");
      if (input && input.dataset.field) saveCell(input);
    });
    rows.addEventListener("click", (e) => {
      const qty = e.target.closest(".qty-btn");
      if (qty) return stepQuantity(qty);
      const del = e.target.closest(".row-delete-btn");
      if (del) window.deleteProduct(Number(del.closest("tr").dataset.productId));
    });
  }

  // Notification bell: open/close the list, mark one as read
  const notifBtn = document.getElementById("notifBtn");
  const notifPanel = document.getElementById("notifPanel");
  if (notifBtn && notifPanel) {
    notifBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notifPanel.hidden = !notifPanel.hidden;
      notifBtn.setAttribute("aria-expanded", String(!notifPanel.hidden));
      if (!notifPanel.hidden) loadNotifications().catch(console.error);
    });
    document.addEventListener("click", (e) => {
      if (!notifPanel.hidden && !notifPanel.contains(e.target)) {
        notifPanel.hidden = true;
        notifBtn.setAttribute("aria-expanded", "false");
      }
    });
    notifPanel.addEventListener("click", async (e) => {
      const btn = e.target.closest(".notif-read-btn");
      if (!btn) return;
      try {
        await WasteLessAPI.markNotificationRead(btn.closest(".notif-item").dataset.notifId);
        await loadNotifications();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const ecoTipCloseBtn = document.getElementById("ecoTipCloseBtn");
  const ecoTipOpenBtn = document.getElementById("ecoTipOpenBtn");
  if (ecoTipCloseBtn) ecoTipCloseBtn.addEventListener("click", closeEcoTip);
  if (ecoTipOpenBtn) ecoTipOpenBtn.addEventListener("click", openEcoTip);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEcoTip();
  });

  // Graph range dropdown (7 / 14 / 30 days)
  const packagingRange = document.getElementById("packagingRange");
  if (packagingRange)
    packagingRange.addEventListener("change", () =>
      loadDashboard().catch(console.error),
    );

  // Preview the picked image before saving
  const imageInput = document.getElementById("imageInput");
  if (imageInput) {
    imageInput.addEventListener("change", () => {
      const file = imageInput.files[0];
      showImagePreview(file ? URL.createObjectURL(file) : currentImageUrl);
    });
  }

  // Add Product form -> POST (editing happens in the table now)
  if (productForm) {
    productForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(productForm);
      formData.delete("product_id");
      if (!formData.get("image") || !formData.get("image").size)
        formData.delete("image");

      try {
        await WasteLessAPI.addProduct(formData);
        productFormContainer.close();
        showListingMsg("Product added successfully!");
        await loadProducts();
      } catch (err) {
        showError("productMsg", err);
      }
    });
  }

  // Feedback Form Submission -> POST /api/feedback
  const feedbackForm = document.getElementById("feedbackForm");
  if (feedbackForm) {
    feedbackForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(feedbackForm);
      if (!formData.get("attachment") || !formData.get("attachment").size)
        formData.delete("attachment");

      try {
        await WasteLessAPI.sendFeedback(formData);
        feedbackForm.reset();
        await loadSubmissions();
        document.getElementById("feedbackMsg").classList.add("ok");
        document.getElementById("feedbackMsg").textContent =
          "Message sent to admin successfully!";
        setTimeout(() => {
          document.getElementById("feedbackMsg").textContent = "";
        }, 3000);
      } catch (err) {
        showError("feedbackMsg", err);
      }
    });
  }

  // Download Report Button Action
  const downloadReportBtn = document.getElementById("downloadReportBtn");
  if (downloadReportBtn) {
    downloadReportBtn.addEventListener("click", downloadReport);
  }

  // Log Out
  const logoutLink = document.querySelector(".logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await WasteLessAPI.logout();
      window.location.href = "landing.html";
    });
  }
}

// Image shown under the file input (the newly picked file)
let currentImageUrl = null;
function showImagePreview(url) {
  const img = document.getElementById("imagePreview");
  if (!img) return;
  img.hidden = !url;
  if (url) img.src = url;
  else img.removeAttribute("src");
}

// Open the Add Product pop-up, cleared first (no leftovers from last time or an Esc close).
function openProductModal() {
  const modal = document.getElementById("productFormContainer");
  const form = document.getElementById("productForm");
  form.reset();
  if (form.product_id) form.product_id.value = "";
  document.getElementById("productMsg").textContent = "";
  currentImageUrl = null;
  showImagePreview(null);
  document.getElementById("formTitle").textContent = "Add Product";
  document.getElementById("saveBtn").textContent = "Save Product";
  modal.showModal();
}

// Short message above the product table (e.g. after saving)
function showListingMsg(text) {
  const el = document.getElementById("listingMsg");
  if (!el) return;
  el.textContent = text;
  setTimeout(() => {
    el.textContent = "";
  }, 3000);
}

window.deleteProduct = async function (productId) {
  if (!confirm("Are you sure you want to delete this product?")) return;
  try {
    await WasteLessAPI.deleteProduct(productId);
    await loadProducts();
  } catch (err) {
    alert(err.message);
  }
};

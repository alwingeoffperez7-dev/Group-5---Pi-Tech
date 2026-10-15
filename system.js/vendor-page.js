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
  document.getElementById(elId).textContent = err.message + (details.length ? "\n- " + details.join("\n- ") : "");
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
  document.querySelectorAll(".page").forEach(p => { p.hidden = p.id !== "page-" + page; });
  document.querySelectorAll(".sidebar-nav a").forEach(a => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + page);
  });
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showPage);

async function loadCategories() {
  const list = await WasteLessAPI.getCategories();
  categories = list.map(c => c.category_name);
  initCategories();
}

async function loadPackaging() {
  packagingList = await WasteLessAPI.getPackaging();
  const select = document.getElementById("formPackaging");
  if (select) {
    select.innerHTML = "";
    packagingList.forEach(pk => {
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
  products = data.products.map(p => ({ ...p, category: p.category_name }));
  renderDashboard();
  applyFilters();
}

async function loadSubmissions() {
  const data = await WasteLessAPI.getSubmissions();
  submissions = data.submissions.map(s => ({
    id: s.feedback_id,
    type: s.feedback_type,
    subject: s.subject,
    date: String(s.created_at).split("T")[0],
    status: s.status
  }));
  renderSubmissions();
}

// DOMContentLoaded Initialization
document.addEventListener("DOMContentLoaded", async () => {
  showPage();
  setupEventListeners();
  try {
    await Promise.all([loadStall(), loadCategories(), loadPackaging(), loadSubmissions(), loadDashboard(), loadReportStatus()]);
    await loadProducts();
  } catch (err) {
    console.error(err);
  }
});

// Dashboard cards: Products, Package Category
function renderDashboard() {
  const pad = n => (n < 10 ? `0${n}` : String(n));
  const countBadge = document.getElementById("count");
  const breakdown = document.getElementById("packageBreakdown");

  if (countBadge) countBadge.textContent = pad(products.length);
  if (breakdown) {
    breakdown.innerHTML = packagingList.map(pk => {
      const n = products.filter(p => p.packaging_id === pk.packaging_id).length;
      return `<li>${escapeHtml(pk.packaging_name)}: <strong>${n}</strong></li>`;
    }).join("");
  }
}

// ---------- Dashboard graphs (Chart.js) ----------
const charts = {};
// One colour per packaging category line (in order); repeats if the admin adds more than 6
const LINE_COLORS = ["#2563eb", "#dc2626", "#d97706", "#16a34a", "#7c3aed", "#0891b2"];

// Draws (or redraws) one chart; shows a message instead when there's nothing to draw.
function drawChart(id, config, emptyMessage) {
  const status = document.getElementById(id + "Status");
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  if (typeof Chart === "undefined") {
    if (status) status.textContent = "Chart library failed to load.";
    return;
  }
  if (status) status.textContent = emptyMessage || "";
  config.options = { responsive: false, animation: false, ...config.options };
  charts[id] = new Chart(document.getElementById(id), config);
}

// "Sales & Revenue" card + packaging line graph (one line per packaging category)
async function loadDashboard() {
  const data = await WasteLessAPI.getDashboard();
  const total = document.getElementById("salesTotal");
  if (total) total.textContent = "₱" + data.revenue_total.toFixed(2);

  const anySold = data.lines.some(line => line.values.some(n => n > 0));
  drawChart("packagingChart", {
    type: "line",
    data: {
      labels: data.labels.map(d => new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })),
      datasets: data.lines.map((line, i) => ({
        label: line.label,
        data: line.values,
        borderColor: LINE_COLORS[i % LINE_COLORS.length],
        backgroundColor: LINE_COLORS[i % LINE_COLORS.length],
        cubicInterpolationMode: "monotone" // smooth, but never dips below 0 between points
      }))
    },
    options: {
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Items sold" } } }
    }
  }, anySold ? "" : "No sales recorded in the last 7 days yet.");
}

// ---------- Download Report (PDF, once every 7 days) ----------
const formatWhen = d => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Button says when the next report can be downloaded
async function loadReportStatus() {
  const status = await WasteLessAPI.getReportStatus();
  const btn = document.getElementById("downloadReportBtn");
  if (!btn) return;
  btn.disabled = !status.available;
  btn.textContent = status.available ? "Download Report" : "Next report: " + formatWhen(status.next_available_at);
  btn.title = status.last_downloaded_at ? "Last downloaded " + formatWhen(status.last_downloaded_at) : "";
}

async function downloadReport() {
  const btn = document.getElementById("downloadReportBtn");
  if (!confirm("You can download the report only once every 7 days. Download it now?")) return;
  btn.disabled = true;
  btn.textContent = "Preparing report...";
  try {
    const res = await fetch("/api/stall/report");
    if (res.status === 401) { location.href = "log-in.html"; return; }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not create the report.");
    }
    // Save the PDF the server sent
    const blob = await res.blob();
    const name = (res.headers.get("Content-Disposition") || "").match(/filename="(.+)"/);
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

  if (stallIdLabel) stallIdLabel.textContent = `Stall ID #${stallData.stall_id}`;
  if (stallNameHeader) stallNameHeader.textContent = stallData.stall_name;
  if (subtitle) subtitle.textContent = `Stall ${stallData.stall_id} ${stallData.stall_name}`;
}

// Populate Category Dropdowns
function initCategories() {
  const filterCat = document.getElementById("filterCat");
  const formCat = document.getElementById("formCat");

  if (filterCat) {
    // Clear and add 'All' plus categories
    filterCat.innerHTML = '<option value="All">All Categories</option>';
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      filterCat.appendChild(opt);
    });
  }

  if (formCat) {
    formCat.innerHTML = "";
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      formCat.appendChild(opt);
    });
  }
}

// Render Products Table
function renderProducts(dataToRender) {
  const tbody = document.getElementById("rows");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (dataToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-row">No products found.</td></tr>`;
    return;
  }

  dataToRender.forEach(prod => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${prod.product_id}</td>
      <td>${prod.image_url ? `<img class="product-thumb" src="${escapeHtml(prod.image_url)}" width="48" height="48" alt="${escapeHtml(prod.product_name)}">` : "No image"}</td>
      <td><strong>${escapeHtml(prod.product_name)}</strong></td>
      <td>${escapeHtml(prod.description) || "—"}</td>
      <td>${escapeHtml(prod.packaging_name)}</td>
      <td>₱${Number(prod.unit_price).toFixed(2)}</td>
      <td class="${prod.is_low_stock ? "low-stock" : ""}">${prod.stock}${prod.is_low_stock ? " (low)" : ""}</td>
      <td>${escapeHtml(prod.category)}</td>
      <td>
        <button class="btn outline btn-sm" onclick="editProduct(${prod.product_id})">Edit</button>
        <button class="btn outline btn-sm text-danger" onclick="deleteProduct(${prod.product_id})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
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

  submissions.forEach(sub => {
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

  const filtered = products.filter(p => {
    const matchesSearch = p.product_name.toLowerCase().includes(query) || (p.description || "").toLowerCase().includes(query);
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
  if (refreshBtn) refreshBtn.addEventListener("click", () => {
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

  // Preview the picked image before saving
  const imageInput = document.getElementById("imageInput");
  if (imageInput) {
    imageInput.addEventListener("change", () => {
      const file = imageInput.files[0];
      showImagePreview(file ? URL.createObjectURL(file) : currentImageUrl);
    });
  }

  // Product Form Submission -> POST (add) or PUT (edit)
  if (productForm) {
    productForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(productForm);
      const id = formData.get("product_id");
      formData.delete("product_id");
      if (!formData.get("image") || !formData.get("image").size) formData.delete("image");

      try {
        if (id) {
          await WasteLessAPI.editProduct(id, formData);
        } else {
          await WasteLessAPI.addProduct(formData);
        }
        productFormContainer.close();
        showListingMsg(id ? "Product updated successfully!" : "Product added successfully!");
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
      if (!formData.get("attachment") || !formData.get("attachment").size) formData.delete("attachment");

      try {
        await WasteLessAPI.sendFeedback(formData);
        feedbackForm.reset();
        await loadSubmissions();
        document.getElementById("feedbackMsg").classList.add("ok");
        document.getElementById("feedbackMsg").textContent = "Message sent to admin successfully!";
        setTimeout(() => { document.getElementById("feedbackMsg").textContent = ""; }, 3000);
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

// Global functions for table row actions
window.editProduct = function(productId) {
  const prod = products.find(p => p.product_id === productId);
  if (!prod) return;

  const productForm = document.getElementById("productForm");
  if (!productForm) return;

  openProductModal(prod);
  productForm.product_id.value = prod.product_id;
  productForm.product_name.value = prod.product_name;
  productForm.category.value = prod.category;
  productForm.description.value = prod.description || "";
  productForm.packaging_id.value = prod.packaging_id;
  productForm.unit_price.value = prod.unit_price;
  productForm.stock.value = prod.stock;
  currentImageUrl = prod.image_url;
  showImagePreview(prod.image_url);
};

// Image shown under the file input (current image when editing, or the newly picked file)
let currentImageUrl = null;
function showImagePreview(url) {
  const img = document.getElementById("imagePreview");
  if (!img) return;
  img.hidden = !url;
  if (url) img.src = url;
  else img.removeAttribute("src");
}

// Open the Add / Edit Product pop-up (prod = null for Add).
// Clears it first, so leftovers from last time (or an Esc close) never show.
function openProductModal(prod) {
  const modal = document.getElementById("productFormContainer");
  const form = document.getElementById("productForm");
  form.reset();
  form.product_id.value = "";
  document.getElementById("productMsg").textContent = "";
  currentImageUrl = null;
  showImagePreview(null);
  document.getElementById("formTitle").textContent = prod ? "Edit Product" : "Add Product";
  document.getElementById("saveBtn").textContent = prod ? "Save Changes" : "Save Product";
  modal.showModal();
}

// Short message above the product table (e.g. after saving)
function showListingMsg(text) {
  const el = document.getElementById("listingMsg");
  if (!el) return;
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 3000);
}

window.deleteProduct = async function(productId) {
  if (!confirm("Are you sure you want to delete this product?")) return;
  try {
    await WasteLessAPI.deleteProduct(productId);
    await loadProducts();
  } catch (err) {
    alert(err.message);
  }
};

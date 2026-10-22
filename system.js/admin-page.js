let currentAccounts = [];
let currentStalls = [];
let currentProducts = [];
let currentCategories = [];
let allCategories = []; // ALL categories (used by the dropdowns)
let currentConditions = [];
let currentEcoTips = [];

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findById(list, idKey, id) {
  return list.find(function (item) {
    return String(item[idKey]) === String(id);
  });
}

function getListOptions(prefix) {
  return {
    search: byId(prefix + "-search").value,
    filter: byId(prefix + "-filter").value,
    sort: byId(prefix + "-sort").value,
  };
}

function makeOptions(items, valueKey, labelKey, selectedValue) {
  let html = "";
  items.forEach(function (item) {
    const selected =
      String(item[valueKey]) === String(selectedValue) ? " selected" : "";
    html += `<option value="${escapeHtml(item[valueKey])}"${selected}>${escapeHtml(item[labelKey])}</option>`;
  });
  return html;
}

function fillSelect(selectId, items, valueKey, labelKey, firstText) {
  const select = byId(selectId);
  const oldValue = select.value;
  select.innerHTML =
    `<option value="">${firstText}</option>` +
    makeOptions(items, valueKey, labelKey, oldValue);
}

function listenToTableClicks(tbodyId, handlers) {
  byId(tbodyId).addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (handlers[action]) handlers[action](button.dataset.id);
  });
}

function showSection(name) {
  document.querySelectorAll(".page").forEach(function (page) {
    page.hidden = page.id !== "section-" + name; // hide every section except the chosen one
  });
  const button = document.querySelector('[data-section="' + name + '"]');
  byId("page-title").textContent = button.dataset.title;
}

document.querySelectorAll("[data-section]").forEach(function (button) {
  button.addEventListener("click", function () {
    showSection(button.dataset.section);
  });
});

byId("back-btn").addEventListener("click", function () {
  window.history.back();
});

/* ========== backend here =========== */

const api = WasteLessAPI.request; // from /js/api.js

// Shows backend errors (e.g. "That name is already used") instead of failing silently
function showApiError(err) {
  console.error(err);
  alert(err.message);
}

function listUrl(path, options) {
  return path + "?" + new URLSearchParams(options);
}

const ACCOUNT_STATUSES = ["Pending", "Approved", "Declined"].map(function (s) {
  return { value: s, label: s };
});

function loadDashboard() {
  api("GET", "/api/admin/stats").then(renderDashboardStats).catch(showApiError);
  // TODO (frontend/charts): draw your charts inside #chart-1 and #chart-2
}

function loadFeedback() {
  const sort = byId("feedback-sort").value; // "", "newest", "oldest"
  api("GET", listUrl("/api/admin/feedback", { sort: sort }))
    .then(renderFeedback)
    .catch(showApiError);
}

function loadAccounts() {
  const options = getListOptions("account"); // { search, filter, sort }
  fillSelect(
    "account-filter",
    ACCOUNT_STATUSES,
    "value",
    "label",
    "Filter/Category",
  );
  api("GET", listUrl("/api/admin/accounts", options))
    .then(renderAccounts)
    .catch(showApiError);
}

function loadStalls() {
  const options = getListOptions("stall");
  api("GET", listUrl("/api/admin/stalls", options))
    .then(renderStalls)
    .catch(showApiError);
}

function loadProducts() {
  const options = getListOptions("product"); // options.filter = a category_id
  api("GET", listUrl("/api/admin/products", options))
    .then(renderProducts)
    .catch(showApiError);
}

function loadCategories() {
  const options = getListOptions("category");
  api("GET", listUrl("/api/admin/packaging", options))
    .then(renderCategories)
    .catch(showApiError);
}

function loadEcoTips() {
  api("GET", "/api/admin/eco/conditions")
    .then(renderConditions)
    .catch(showApiError);
  api("GET", "/api/admin/eco/tips").then(renderEcoTips).catch(showApiError);
}

// Dropdown lists need ALL categories and ALL stalls (not the searched/filtered ones)
function loadDropdownOptions() {
  api("GET", "/api/packaging").then(renderCategoryOptions).catch(showApiError); // packaging categories
  api("GET", "/api/categories")
    .then(renderFoodCategoryOptions)
    .catch(showApiError); // Meals, Snacks, ...
  api("GET", "/api/admin/stalls").then(renderStallOptions).catch(showApiError);
}

/* ======================================================================================= */

function renderDashboardStats(stats) {
  byId("total-stalls").textContent = stats.total_stalls;
  byId("total-categories").textContent = stats.total_categories;
  byId("total-products").textContent = stats.total_products;
}

function renderFeedback(messages) {
  byId("feedback-count").textContent = messages.length;
  let html = "";
  messages.forEach(function (m) {
    const tags = Array.isArray(m.tags)
      ? m.tags
      : String(m.tags || "").split(",");
    let tagHtml = "";
    tags.forEach(function (tag) {
      if (tag.trim() !== "")
        tagHtml += `<span>[${escapeHtml(tag.trim())}]</span> `;
    });
    html += `<article>
      <h3>${escapeHtml(m.subject)}</h3>
      <p>${escapeHtml(m.message)}</p>
      <p>${tagHtml}</p>
    </article>`;
  });
  byId("feedback-list").innerHTML = html;
}

function renderAccounts(accounts) {
  currentAccounts = accounts;
  byId("account-count").textContent = accounts.length;
  let rows = "";
  accounts.forEach(function (a) {
    rows += `<tr>
      <td>${escapeHtml(a.business_name)}</td>
      <td>${escapeHtml(a.email)}</td>
      <td>${escapeHtml(a.contact_person)}</td>
      <td>${escapeHtml(a.contact_number)}</td>
      <td>
        <button type="button" data-action="approve" data-id="${escapeHtml(a.account_id)}">Approve</button>
        <button type="button" data-action="decline" data-id="${escapeHtml(a.account_id)}">Decline</button>
      </td>
    </tr>`;
  });
  byId("account-table-body").innerHTML = rows;
}

function renderStalls(stalls) {
  currentStalls = stalls;
  byId("stall-count").textContent = stalls.length;
  let rows = "";
  stalls.forEach(function (s) {
    rows += `<tr>
      <td>${escapeHtml(s.stall_id)}</td>
      <td>${escapeHtml(s.business_name)}</td>
      <td>${escapeHtml(s.contact_person)}</td>
      <td>${escapeHtml(s.contact_number)}<br>${escapeHtml(s.email)}</td>
      <td>
        <button type="button" data-action="edit" data-id="${escapeHtml(s.stall_id)}">Edit</button>
        <button type="button" data-action="delete" data-id="${escapeHtml(s.stall_id)}">Delete</button>
      </td>
    </tr>`;
  });
  byId("stall-table-body").innerHTML = rows;
}

function renderProducts(products) {
  currentProducts = products;
  byId("product-count").textContent = products.length;
  let rows = "";
  products.forEach(function (p) {
    rows += `<tr>
      <td>${escapeHtml(p.product_id)}</td>
      <td>${escapeHtml(p.product_name)}</td>
      <td>
        <select data-action="change-category" data-id="${escapeHtml(p.product_id)}">
          ${makeOptions(allCategories, "packaging_id", "packaging_name", p.packaging_id)}
        </select>
      </td>
      <td>${escapeHtml(p.stall_id)}</td>
      <td>
        <button type="button" data-action="edit" data-id="${escapeHtml(p.product_id)}">Edit</button>
        <button type="button" data-action="delete" data-id="${escapeHtml(p.product_id)}">Delete</button>
      </td>
    </tr>`;
  });
  byId("product-table-body").innerHTML = rows;
}

function renderCategories(categories) {
  currentCategories = categories;
  byId("category-count").textContent = categories.length;
  let rows = "";
  categories.forEach(function (c) {
    let arrow = "";
    if (c.trend === "up") arrow = "▲";
    if (c.trend === "down") arrow = "▼";
    rows += `<tr>
      <td>${escapeHtml(c.packaging_id)}</td>
      <td>${escapeHtml(c.packaging_name)}</td>
      <td>${escapeHtml(c.description)}</td>
      <td>${escapeHtml(c.example)}</td>
      <td>${escapeHtml(c.item_count)} ${arrow}</td>
      <td>
        <button type="button" data-action="edit" data-id="${escapeHtml(c.packaging_id)}">Edit</button>
        <button type="button" data-action="delete" data-id="${escapeHtml(c.packaging_id)}">Delete</button>
      </td>
    </tr>`;
  });
  byId("category-table-body").innerHTML = rows;
}

function multiline(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function renderConditions(conditions) {
  currentConditions = conditions;
  let rows = "";
  conditions.forEach(function (c) {
    rows += `<tr>
      <td>${escapeHtml(c.condition_name)}</td>
      <td>${escapeHtml(c.threshold)} ${escapeHtml(c.unit)}</td>
      <td>${escapeHtml(c.min_pieces)}</td>
      <td>${escapeHtml(c.tip_text)}</td>
      <td><button type="button" data-action="edit" data-id="${escapeHtml(c.condition_id)}">Edit</button></td>
    </tr>`;
  });
  byId("condition-table-body").innerHTML = rows;
}

function renderEcoTips(tips) {
  currentEcoTips = tips;
  let rows = "";
  tips.forEach(function (t) {
    rows += `<tr>
      <td>${escapeHtml(t.packaging_name)}</td>
      <td>${multiline(t.effects)}</td>
      <td>${t.tip_text ? escapeHtml(t.tip_text) : "(no tip yet: the general tip is used)"}</td>
      <td><button type="button" data-action="edit" data-id="${escapeHtml(t.packaging_id)}">Edit</button></td>
    </tr>`;
  });
  byId("ecotip-table-body").innerHTML = rows;
}

// "categories" here = packaging categories (Tetra Pak, Polystyrene, ...)
function renderCategoryOptions(categories) {
  allCategories = categories;
  fillSelect(
    "product-filter",
    categories,
    "packaging_id",
    "packaging_name",
    "Filter/Category",
  );
  fillSelect(
    "product-form-category",
    categories,
    "packaging_id",
    "packaging_name",
    "-- Select packaging category --",
  );
  renderProducts(currentProducts); // redraw so the row dropdowns get their options
}

// Food categories (Meals, Snacks, ...) for the product form
function renderFoodCategoryOptions(categories) {
  fillSelect(
    "product-form-foodcat",
    categories,
    "category_id",
    "category_name",
    "-- Select category --",
  );
}

function renderStallOptions(stalls) {
  fillSelect(
    "product-form-stall",
    stalls,
    "stall_id",
    "business_name",
    "-- Select stall --",
  );
}

/* ===================================================================================================== */

const sectionLoaders = {
  account: loadAccounts,
  stall: loadStalls,
  product: loadProducts,
  category: loadCategories,
};

Object.keys(sectionLoaders).forEach(function (name) {
  byId(name + "-search").addEventListener("input", sectionLoaders[name]);
  byId(name + "-filter").addEventListener("change", sectionLoaders[name]);
  byId(name + "-sort").addEventListener("change", sectionLoaders[name]);
});

byId("feedback-sort").addEventListener("change", loadFeedback);

/* ====================================================================================== */

function openForm(formId, item) {
  const form = byId(formId);
  form.reset();
  form.querySelectorAll('input[type="hidden"]').forEach(function (input) {
    input.value = "";
  });
  if (item) {
    Object.keys(item).forEach(function (key) {
      if (form.elements[key]) form.elements[key].value = item[key];
    });
  }
  form.closest("dialog").showModal();
}

function handleFormSubmit(formId, idField, url, reloadFunction) {
  const form = byId(formId);
  form.addEventListener("submit", async function (event) {
    event.preventDefault(); // stop the page from reloading
    const data = Object.fromEntries(new FormData(form)); // e.g. { business_name: "...", ... }

    try {
      if (data[idField] === "") {
        await api("POST", url, data);
      } else {
        await api("PUT", url + "/" + data[idField], data);
      }
    } catch (err) {
      return showApiError(err); // keep the dialog open so they can fix it
    }

    form.closest("dialog").close();
    reloadFunction(); // refresh the table
    loadDashboard();
    loadDropdownOptions();
  });
}

handleFormSubmit("stall-form", "stall_id", "/api/admin/stalls", loadStalls);
handleFormSubmit(
  "product-form",
  "product_id",
  "/api/admin/products",
  loadProducts,
);
handleFormSubmit(
  "category-form",
  "packaging_id",
  "/api/admin/packaging",
  function () {
    loadCategories();
    loadEcoTips();
  },
);
handleFormSubmit(
  "condition-form",
  "condition_id",
  "/api/admin/eco/conditions",
  loadEcoTips,
); // edit only
handleFormSubmit(
  "ecotip-form",
  "packaging_id",
  "/api/admin/eco/tips",
  loadEcoTips,
); // edit only

// Delete a record, then refresh its table + the dashboard totals
function deleteRecord(url, reloadFunction) {
  api("DELETE", url)
    .then(function () {
      reloadFunction();
      loadDashboard();
      loadDropdownOptions();
    })
    .catch(showApiError);
}

byId("stall-add-button").addEventListener("click", function () {
  openForm("stall-form");
});
byId("product-add-button").addEventListener("click", function () {
  openForm("product-form");
});
byId("category-add-button").addEventListener("click", function () {
  openForm("category-form");
});

document.addEventListener("click", function (event) {
  if (event.target.dataset.action === "close-dialog") {
    event.target.closest("dialog").close();
  }
});

/* =============================================================================================== */

listenToTableClicks("stall-table-body", {
  edit: function (id) {
    openForm("stall-form", findById(currentStalls, "stall_id", id));
  },
  delete: function (id) {
    if (!confirm("Delete this stall?")) return;
    deleteRecord("/api/admin/stalls/" + id, function () {
      loadStalls();
      loadProducts();
    });
  },
});

listenToTableClicks("product-table-body", {
  edit: function (id) {
    openForm("product-form", findById(currentProducts, "product_id", id));
  },
  delete: function (id) {
    if (!confirm("Delete this product?")) return;
    deleteRecord("/api/admin/products/" + id, function () {
      loadProducts();
      loadCategories();
    });
  },
});

listenToTableClicks("category-table-body", {
  edit: function (id) {
    openForm("category-form", findById(currentCategories, "packaging_id", id));
  },
  delete: function (id) {
    if (!confirm("Delete this packaging category?")) return;
    deleteRecord("/api/admin/packaging/" + id, function () {
      loadCategories();
      loadEcoTips();
    });
  },
});

listenToTableClicks("condition-table-body", {
  edit: function (id) {
    const condition = findById(currentConditions, "condition_id", id);
    openForm("condition-form", condition);
    byId("condition-form-unit").textContent = condition.unit;
  },
});

listenToTableClicks("ecotip-table-body", {
  edit: function (id) {
    openForm("ecotip-form", findById(currentEcoTips, "packaging_id", id));
  },
});

listenToTableClicks("account-table-body", {
  approve: function (id) {
    api("POST", "/api/admin/accounts/" + id + "/approve")
      .then(function () {
        loadAccounts();
        loadStalls();
        loadDashboard();
        loadDropdownOptions();
      })
      .catch(showApiError);
  },
  decline: function (id) {
    api("POST", "/api/admin/accounts/" + id + "/decline")
      .then(function () {
        loadAccounts();
        loadStalls();
        loadDashboard();
        loadDropdownOptions();
      })
      .catch(showApiError);
  },
});

// Changing the Packaging Category dropdown inside a product row
byId("product-table-body").addEventListener("change", function (event) {
  if (event.target.dataset.action !== "change-category") return;
  const productId = event.target.dataset.id;
  const newCategoryId = event.target.value;
  api("PUT", "/api/admin/products/" + productId, {
    packaging_id: newCategoryId,
  })
    .then(loadCategories) // item counts change
    .catch(function (err) {
      showApiError(err);
      loadProducts();
    });
});

/* ============================================================================================ */

showSection("dashboard");
loadDashboard();
loadFeedback();
loadAccounts();
loadStalls();
loadProducts();
loadCategories();
loadEcoTips();
loadDropdownOptions();

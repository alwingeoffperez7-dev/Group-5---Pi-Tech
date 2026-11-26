// =====================================================================
// WasteLess API helper — for the front-end team.
// Include on any page:  <script src="/js/api.js"></script>
// Every function returns a Promise. On error it throws an Error with
// .message (sentence for the user) and .details ({ field: message }).
// =====================================================================
const WasteLessAPI = (() => {
  async function request(method, url, body) {
    const opts = { method, headers: {} };
    if (body instanceof FormData) {
      opts.body = body; // browser sets multipart headers
    } else if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) location.href = "/system.html/log-in.html"; // not logged in
    if (!res.ok) {
      let msg = data.error || `Request failed (${res.status})`;
      if (res.status === 403 && /Only (admin|vendor) accounts/i.test(msg)) {
        msg = "Your session switched to another role in another tab. Please log in again.";
      }
      const err = new Error(msg);
      err.status = res.status;
      err.details = data.details || {};
      throw err;
    }
    return data;
  }

  // Styled toast notification (replaces browser alert())
  function toast(message, type = "info") {
    let stack = document.querySelector(".wl-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "wl-toast-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = `wl-toast wl-toast-${type}`;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    const text = document.createElement("span");
    text.textContent = String(message || "");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "wl-toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", () => el.remove());
    el.append(text, close);
    stack.appendChild(el);
    setTimeout(() => el.remove(), type === "error" ? 5500 : 3500);
  }

  // Styled confirmation dialog (replaces browser confirm())
  function confirmDialog(message, okText = "Confirm", danger = false) {
    let dlg = document.getElementById("wlConfirmDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "wlConfirmDialog";
      dlg.className = "wl-confirm-dialog";
      dlg.innerHTML = `<form method="dialog" class="wl-confirm-form">
        <p class="wl-confirm-msg"></p>
        <div class="dialog-actions">
          <button type="button" class="btn outline wl-confirm-cancel">Cancel</button>
          <button type="submit" class="btn primary wl-confirm-ok">Confirm</button>
        </div>
      </form>`;
      document.body.appendChild(dlg);
    }
    dlg.querySelector(".wl-confirm-msg").textContent = message;
    const okBtn = dlg.querySelector(".wl-confirm-ok");
    const cancelBtn = dlg.querySelector(".wl-confirm-cancel");
    okBtn.textContent = okText;
    okBtn.classList.toggle("danger", Boolean(danger));

    return new Promise((resolve) => {
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        dlg.removeEventListener("close", onClose);
        cancelBtn.removeEventListener("click", onCancel);
        okBtn.removeEventListener("click", onOk);
        if (dlg.open) dlg.close();
        resolve(val);
      };
      const onOk = (e) => { e.preventDefault(); finish(true); };
      const onCancel = () => finish(false);
      const onClose = () => finish(false);
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      dlg.addEventListener("close", onClose);
      dlg.showModal();
    });
  }

  return {
    // Any route, e.g. request('GET', '/api/admin/stalls?search=x'). Used by the admin page.
    request,
    toast,
    confirm: confirmDialog,
    logout: () => request("POST", "/api/auth/logout"),

    // Header + My Stall page
    getStall: () => request("GET", "/api/stall"),
    getDashboard: (days = 7) =>
      request("GET", `/api/stall/dashboard?days=${days}`), // days: 7 | 14 | 30
    // Download Report: { available, last_downloaded_at, next_available_at }. The PDF itself is POST /api/stall/report
    getReportStatus: () => request("GET", "/api/stall/report/status"),
    getEcoTips: () => request("GET", "/api/stall/eco-tips"),

    // Category chips
    getCategories: () => request("GET", "/api/categories"),

    // Plastic packaging categories (Tetra Pak, Polystyrene, ...) for the packaging dropdown
    getPackaging: () => request("GET", "/api/packaging"),

    // Product Listing: filters are optional { q: 'adobo', category: 'Meals' }
    getProducts: (filters = {}) => {
      const qs = new URLSearchParams();
      if (filters.q) qs.set("q", filters.q);
      if (filters.category && filters.category !== "All")
        qs.set("category", filters.category);
      return request("GET", "/api/products" + (qs.toString() ? "?" + qs : ""));
    },
    getProduct: (id) => request("GET", `/api/products/${id}`),

    // Pass the <form> element or a FormData with fields:
    // product_name, description, category (name) or category_id,
    // packaging_id (from getPackaging), unit_price, stock, image (file)
    addProduct: (form) => request("POST", "/api/products", toFormData(form)),
    editProduct: (id, form) =>
      request("PUT", `/api/products/${id}`, toFormData(form)),
    deleteProduct: (id) => request("DELETE", `/api/products/${id}`),
    // Sold +/- buttons: record a sale (stock goes down) / undo the last sale of the past 7 days. Both return the updated product.
    recordSale: (id, quantity = 1) => request("POST", `/api/products/${id}/sales`, { quantity }),
    undoSale: (id) => request("DELETE", `/api/products/${id}/sales/last`),

    // Notification bell: { unread, notifications: [...] } sent by the admin
    getNotifications: () => request("GET", "/api/notifications"),
    markNotificationRead: (id) => request("POST", `/api/notifications/${id}/read`),

    // Feedback / Report: feedback_type, subject, message, attachment (file)
    getSubmissions: () => request("GET", "/api/feedback"),
    getSubmission: (id) => request("GET", `/api/feedback/${id}`),
    sendFeedback: (form) => request("POST", "/api/feedback", toFormData(form)),
  };

  function toFormData(form) {
    if (form instanceof FormData) return form;
    if (form instanceof HTMLFormElement) return new FormData(form);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, v);
    });
    return fd;
  }
})();

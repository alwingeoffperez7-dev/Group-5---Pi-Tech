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
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) location.href = '/system.html/log-in.html'; // not logged in
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.details = data.details || {};
      throw err;
    }
    return data;
  }

  return {
    // Any route, e.g. request('GET', '/api/admin/stalls?search=x'). Used by the admin page.
    request,
    logout: () => request('POST', '/api/auth/logout'),

    // Header + My Stall page
    getStall: () => request('GET', '/api/stall'),
    getDashboard: (days = 7) => request('GET', `/api/stall/dashboard?days=${days}`), // days: 7 | 14 | 30
    // Download Report: { available, last_downloaded_at, next_available_at }. The PDF itself is GET /api/stall/report
    getReportStatus: () => request('GET', '/api/stall/report/status'),

    // Category chips
    getCategories: () => request('GET', '/api/categories'),

    // Plastic packaging categories (Tetra Pak, Polystyrene, ...) for the packaging dropdown
    getPackaging: () => request('GET', '/api/packaging'),

    // Product Listing: filters are optional { q: 'adobo', category: 'Meals' }
    getProducts: (filters = {}) => {
      const qs = new URLSearchParams();
      if (filters.q) qs.set('q', filters.q);
      if (filters.category && filters.category !== 'All') qs.set('category', filters.category);
      return request('GET', '/api/products' + (qs.toString() ? '?' + qs : ''));
    },
    getProduct: (id) => request('GET', `/api/products/${id}`),

    // Pass the <form> element or a FormData with fields:
    // product_name, description, category (name) or category_id,
    // packaging_type (Plastic|Paper|Reusable), unit_price, stock, image (file)
    addProduct: (form) => request('POST', '/api/products', toFormData(form)),
    editProduct: (id, form) => request('PUT', `/api/products/${id}`, toFormData(form)),
    deleteProduct: (id) => request('DELETE', `/api/products/${id}`),

    // Feedback / Report: feedback_type, subject, message, attachment (file)
    getSubmissions: () => request('GET', '/api/feedback'),
    getSubmission: (id) => request('GET', `/api/feedback/${id}`),
    sendFeedback: (form) => request('POST', '/api/feedback', toFormData(form))
  };

  function toFormData(form) {
    if (form instanceof FormData) return form;
    if (form instanceof HTMLFormElement) return new FormData(form);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
    return fd;
  }
})();

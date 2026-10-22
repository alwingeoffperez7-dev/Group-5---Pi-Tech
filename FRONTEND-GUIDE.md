# Front-end Guide: changing the HTML/CSS without breaking the backend

This is for whoever styles the pages in `system.html/` and `system.css/`.
The pages are already connected to the backend through the scripts in `system.js/`.
Those scripts find elements by their **`id`**, **`class`**, **`name`** and **`data-…`** attributes.
**Keep those exactly the same** and you can change everything else.

---

## The 6 rules

1. **Never rename or delete an `id`, `name`, or `data-…` attribute listed below.** If you must, change the same word in the matching `system.js/*.js` file too.
2. **You can freely add** your own classes, wrapper `<div>`s, icons, text and new elements. Extra classes don't break anything (`class="stat-card my-new-card"` is fine).
3. **Don't remove a class that is listed below** (some are used by the scripts, not just by CSS).
4. **Keep these HTML parts:** the `<script>` tags at the bottom of each page (and their order), `<form>` tags and their `name="…"` inputs, `<dialog>` tags, and the `hidden` attribute on the pages that start hidden.
5. **Pages that start empty are filled by JavaScript.** Things like `<tbody id="rows">` and `<ul id="subs">` look empty in the HTML. Don't put content inside them, because it gets replaced. Style the rows the scripts create using the "generated classes" listed per page.
6. **Always open the site through the server** (http://localhost:3000 after `npm start`). Live Preview / "Go Live" and double-clicking a file **can't** log in or load data.

### CSS tips that save you a headache
- **Show/hide uses the `hidden` attribute.** If you write `.page { display: flex; }`, hidden pages will show up again. Add this once to every stylesheet:
  ```css
  [hidden] { display: none !important; }
  ```
- **Pop-ups are native `<dialog>` elements.** Style them with `dialog { … }` and the dim background with `dialog::backdrop { … }`. Don't replace them with `<div>`s.
- **Graphs:** the vendor graph's size comes from the `width`/`height` attributes on `<canvas id="packagingChart">`. Change those numbers instead of resizing the canvas with CSS, or it gets blurry. The landing graph (`#waste-chart`) fills `#chart-container`, so size the container.
- **Adding a stylesheet to a page:** put the file in `system.css/` and link it in the page's `<head>`:
  `<link rel="stylesheet" href="../system.css/landing.css" />`
- **External fonts / CDNs (e.g. Google Fonts) are blocked** by the site's security policy. To allow them, ask the backend person to add the address to the `Content-Security-Policy` in `wasteless-backend/src/server.js`. Fonts saved inside `system.css/` work without any change.
- **Don't add `<script>` tags that load from other websites** for the same reason.
- After changing CSS, press **Ctrl + F5** to see it (the browser caches the old file).

### Quick self-test after a change
1. `npm start`, then open http://localhost:3000.
2. Press **F12 → Console**. Red errors like `Cannot read properties of null` mean an `id` the script needs is missing.
3. Click through the page: log in, switch tabs, open pop-ups, save something.

---

## Page by page

The tables list what the scripts need. Anything **not** listed is safe to change.

### `landing.html` (script: `system.js/landing.js`)

| Keep this | What it is |
|---|---|
| `id="chart-range"` | "Show" dropdown (keep the `<option value="7">`, `value="14"` and `value="30"`) |
| `id="chart-container"` | box around the graph (the graph fills it) |
| `id="waste-chart"` | the graph `<canvas>` |
| `id="chart-status"` | message under the graph ("No sales recorded yet.") |
| `id="summary-title"`, `id="summary-list"`, `id="summary-status"` | Summary card (title, the `<dl>` that gets filled, status message) |
| `href="log-in.html"`, `href="register.html"`, `href="cookie-policy.html"` | links to the other pages |
| `<script src="…chart.umd.min.js">` before `<script src="../system.js/landing.js">` | Chart.js must load first |

### `log-in.html` (script: `system.js/login.js`)

| Keep this | What it is |
|---|---|
| `id="loginForm"` | the form |
| `name="email"`, `name="password"` | inputs sent to the server |
| two `<button type="submit" name="role">` with `value="vendor"` and `value="admin"` | which login was clicked (the value decides vendor vs admin) |
| `id="loginFeedback"` | where "Invalid email or password." etc. appears |

### `register.html` (script: `system.js/register.js`)

| Keep this | What it is |
|---|---|
| `id="registerForm"` | the form |
| `name="business_name"`, `name="email"`, `name="user_pass"`, `name="contact_number"` | inputs sent to the server |
| `id="registerFeedback"` | success / error message |

### `vendor-page.html` (scripts: `/js/api.js`, then `system.js/vendor-page.js`; also Chart.js)

**Layout and navigation**

| Keep this | What it is |
|---|---|
| `class="sidebar-nav"` with links `href="#dashboard"`, `href="#listing"`, `href="#feedback"` | sidebar; the script adds `class="active"` to the current link |
| `id="page-dashboard"`, `id="page-listing"`, `id="page-feedback"` + `class="page"` | the three pages; only one is shown, the others get `hidden` |
| `class="logout-link"` | Log Out link |
| `id="stallIdLabel"`, `id="stall"` | header: "Stall ID #7" and the stall name |

**Dashboard**

| Keep this | What it is |
|---|---|
| `id="count"` | Products card number |
| `id="packageBreakdown"` | Package Category card list (filled with one `<li>` per packaging category) |
| `id="packagingRange"` | "Show" dropdown (keep the `value="7"`, `value="14"` and `value="30"` options) |
| `id="packagingChart"` | graph `<canvas>` (size = its `width`/`height` attributes) |
| `id="packagingChartStatus"` | message under the graph |
| `id="ecoTipBanner"`, `id="ecoTipBannerText"` | EcoTip banner; the script changes the text and adds `class="positive"` when it congratulates |
| `id="ecoTipOpenBtn"` | "View Eco-Tip" button in the banner (hidden unless there's a warning) |

**Eco-Tip pop-up** (a `<div>`, shown on the dashboard while the stall is over the weekly limit)

| Keep this | What it is |
|---|---|
| `<div id="ecoTipPopup" class="eco-tip-popup" hidden>` | the pop-up itself. It's a plain `<div>`, so style it as an overlay (e.g. `position: fixed`) and keep the `[hidden]` rule above |
| `id="ecoTipTitle"`, `id="ecoTipMessage"` | heading ("WARNING: …") and the general tip |
| `id="ecoTipCategories"` | filled with one `<section class="eco-category">` per top plastic category (max 3), each with an `<h3>`, an effects `<ul>` and `<p class="eco-tip-text">` |
| `id="ecoTipCloseBtn"` | "Got it" (Esc also closes) |

**Product Listing**

| Keep this | What it is |
|---|---|
| `id="downloadReportBtn"` | Download Report (PDF). Its text and disabled state are changed by the script |
| `id="openAddModalBtn"` | + Add Product |
| `id="q"`, `id="filterCat"`, `id="refresh"` | search box, category filter, Refresh |
| `id="listingMsg"` | "Product added successfully!" message |
| `id="rows"` | the table body (filled by the script; keep the 9 `<th>` columns in the same order: ID, Image, Name, Description, Packaging Category, Price, Stock, Category, Action) |

**Add / Edit Product pop-up**

| Keep this | What it is |
|---|---|
| `<dialog id="productFormContainer">` | the pop-up itself |
| `id="formTitle"`, `class="modal-subtitle"` | "Add Product" / "Edit Product" and the "Stall 7 …" line |
| `id="closeModalBtn"`, `id="cancelEdit"`, `id="saveBtn"` | ×, Cancel, Save |
| `id="productForm"` | the form |
| `name="product_id"` (hidden), `name="product_name"`, `name="category"` + `id="formCat"`, `name="description"`, `name="packaging_id"` + `id="formPackaging"`, `name="unit_price"`, `name="stock"`, `name="image"` + `id="imageInput"` | the fields (the `name`s are what the server receives) |
| `id="imagePreview"` | image preview `<img>` |
| `id="productMsg"` | error messages inside the pop-up |

**Feedback & Reports**

| Keep this | What it is |
|---|---|
| `id="feedbackForm"` with `name="feedback_type"`, `name="subject"`, `name="message"`, `name="attachment"` | New Message to Admin (keep the 4 `<option>` texts: Inquiry, Report a Problem, Suggestion, Stall Info Change) |
| `id="feedbackMsg"` | sent / error message |
| `id="subs"` | My Submissions list (filled by the script) |

**Classes the script puts on generated content (style these freely):**
`product-thumb` (table image), `empty-row` ("No products found." / "No submissions yet."), `btn outline btn-sm` and `text-danger` (Edit / Delete buttons in rows), `submission-item` (each submission), `status-badge` plus `pending` / `replied` / `resolved` (status pill), `stat-note` (small grey text), `form-msg ok` (green success message), `active` (current sidebar link), `eco-category` and `eco-tip-text` (Eco-Tip pop-up), `positive` (on the banner when congratulating).

### `admin-page.html` (scripts: `/js/api.js`, then `system.js/admin-page.js`)

**Navigation**

| Keep this | What it is |
|---|---|
| `<button data-section="dashboard" data-title="Dashboard">` (and `accounts`, `stalls`, `products`, `categories`, `eco`) | sidebar buttons; `data-section` picks the page, `data-title` is the heading text |
| `id="section-dashboard"`, `id="section-accounts"`, `id="section-stalls"`, `id="section-products"`, `id="section-categories"`, `id="section-eco"` + `class="page"` | the pages (hidden / shown) |
| `id="page-title"`, `id="back-btn"` | heading and back button |

**Dashboard:** `id="total-stalls"`, `id="total-categories"`, `id="total-products"`, `id="feedback-count"`, `id="feedback-sort"`, `id="feedback-list"`. `id="chart-1"` and `id="chart-2"` are empty spots reserved for graphs.

**Each list page** uses the same pattern, where `X` is `account`, `stall`, `product` or `category`:

| Keep this | What it is |
|---|---|
| `id="X-search"`, `id="X-filter"`, `id="X-sort"` | search box, filter dropdown, sort dropdown (keep the sort `<option value="…">`s) |
| `id="X-count"` | the count |
| `id="X-table-body"` | table body (filled by the script; keep the `<th>` columns in the same order) |
| `id="stall-add-button"`, `id="product-add-button"`, `id="category-add-button"` | + Add buttons |

**Pop-ups (`<dialog>`)**

| Dialog / form | Field `name`s to keep |
|---|---|
| `id="stall-dialog"` / `id="stall-form"` | `stall_id` (hidden), `business_name`, `contact_person`, `contact_number`, `email` |
| `id="product-dialog"` / `id="product-form"` | `product_id` (hidden), `product_name`, `packaging_id` (`id="product-form-category"`), `category_id` (`id="product-form-foodcat"`), `stall_id` (`id="product-form-stall"`) |
| `id="category-dialog"` / `id="category-form"` (packaging categories) | `packaging_id` (hidden), `packaging_name`, `description`, `example` |

| `id="condition-dialog"` / `id="condition-form"` (Eco-Tip rules, edit only) | `condition_id` (hidden), `condition_name` (read-only), `threshold`, `tip_text`; keep `id="condition-form-threshold-row"` (hidden for "Good Work") and `id="condition-form-unit"` |
| `id="ecotip-dialog"` / `id="ecotip-form"` (tip per packaging category, edit only) | `packaging_id` (hidden), `packaging_name` (read-only), `effects` (one per line), `tip_text` |

**Eco-Tips page:** tables `id="condition-table-body"` (4 columns: Condition, Threshold, Eco-Tip, Action/Edit) and `id="ecotip-table-body"` (4 columns), filled by the script.

Cancel buttons need `data-action="close-dialog"`.

**Buttons the script creates inside table rows** use `data-action="edit"`, `"delete"`, `"approve"`, `"decline"`, plus `data-id`, and the row dropdown uses `data-action="change-category"`. You can style them with CSS like `button[data-action="delete"] { … }`.

### `cookie-policy.html`
Plain page with no script. Change anything (the IDs are only there to make styling easy).

### Every page
Keep the footer link to `cookie-policy.html` on the landing, log-in and register pages.

---

## Where things live

| I want to… | Edit |
|---|---|
| change colours, fonts, spacing | `system.css/` (link the file from the page) |
| change text, layout, add icons/wrappers | `system.html/*.html` (keep the attributes above) |
| change what a button does / what data loads | `system.js/*.js` (talk to the backend person) |
| change data, rules or the PDF | `wasteless-backend/` (backend) |

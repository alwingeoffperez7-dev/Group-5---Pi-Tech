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
- **Graphs:** both line graphs fill their `.chart-box` (`height` in `wasteless.css`), so to make a graph bigger or smaller change the `.chart-box` height, not the `<canvas>`. Their look (colours, dash patterns, busiest-day dot and tag, scale on the right) is in `system.js/charts.js`, shared by both pages. The Package Category donut (`#packageDonut`) is sized by its `width`/`height` attributes and `.donut`.
- **Adding a stylesheet to a page:** put the file in `system.css/` and link it in the page's `<head>`:
  `<link rel="stylesheet" href="../system.css/landing.css" />`
- **Google Fonts are allowed** (the `@import` in `wasteless.css` works). **Other external fonts / CDNs are blocked** by the site's security policy. To allow one, ask the backend person to add the address to the `Content-Security-Policy` in `wasteless-backend/src/server.js`. Fonts saved inside `system.css/` work without any change.
- **Don't add `<script>` tags that load from other websites** for the same reason.
- After changing CSS, press **Ctrl + F5** to see it (the browser caches the old file).

### Quick self-test after a change
1. `npm start`, then open http://localhost:3000.
2. Press **F12 → Console**. Red errors like `Cannot read properties of null` mean an `id` the script needs is missing.
3. Click through the page: log in, switch tabs, open pop-ups, save something.

---

## Page by page

The tables list what the scripts need. Anything **not** listed is safe to change.

### `landing.html` (scripts: Chart.js, `system.js/charts.js`, then `system.js/landing.js`)

| Keep this | What it is |
|---|---|
| `id="chart-range"` | graph dropdown (keep the `<option value="7">`, `value="14"` and `value="30"`) |
| `id="waste-chart"` inside a `.chart-box` | the graph `<canvas>` (fills the box) |
| `id="chart-status"` | text under the graph ("Plastic Wrapper was used most…" or "No sales recorded yet.") |
| `id="week-total"`, `id="week-change"`, `id="week-sparkline"` (an `<svg>`) | big "Plastic items sold this week" card: the number, "↓ 12% from last week", the green trend line |
| `id="summary-list"` (a `<dl>`), `id="summary-status"` | the small cards beside it; the script fills one `<div class="card">` per item |
| `id="packaging-list"` | "What we track" cards (filled from the packaging categories) |
| `href="log-in.html"`, `href="register.html"`, `href="cookie-policy.html"` | links to the other pages |
| Chart.js, then `charts.js`, then `landing.js` | load order |

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
| `id="stallIdLabel"`, `id="stall"` | header eyebrow: "Stall ID #7" · stall name |
| `id="pageTitle"` | header title; the script sets it to Dashboard / Product Listing / Feedback |
| `data-page="listing"` on the header's `.action-buttons` | shown only on that page (Download Report + Add Product live in the header now) |
| `id="sidebarStallName"`, `id="sidebarStallId"` | stall card at the bottom of the sidebar |
| `.dropzone` with an `<input type="file">` and a `.dropzone-title` inside | file pickers (Add Product image, Feedback screenshot); the script shows the picked file name in `.dropzone-title` |

**Dashboard**

| Keep this | What it is |
|---|---|
| `id="packagingRange"` | graph dropdown (keep the `value="7"`, `value="14"` and `value="30"` options) |
| `id="vendor-sold-items"`, `id="chartHeadlineLabel"`, `id="chartHeadlineNote"` | graph headline: "57", "items sold this week", "Polystyrene (PS) was used most…" |
| `id="packagingChart"` inside a `.chart-box` | graph `<canvas>` (fills the box) |
| `id="packagingChartStatus"` | message under the graph when nothing was sold |
| `id="runningLowList"`, `id="runningLowEmpty"` | Running low card (up to 3 products) and its "Everything is well stocked." text |
| `id="ecoTipBanner"` | Eco-Tips card; the script adds `class="warning"` when the stall is over the weekly limit |
| `id="ecoStatusTitle"`, `id="ecoStatusCount"`, `id="ecoBarFill"`, `id="ecoTipBannerText"` | "Good Work!" / "Over the limit", "57 of 90 pieces", the bar (its width is set), the note |
| `id="ecoTipList"` | tips per packaging category (only when over the limit) |
| `id="ecoTipOpenBtn"` | "View Eco-Tip" button (hidden unless there's a warning) |
| `id="packageDonut"`, `id="count"` | Package Category donut and the product count in its middle |
| `id="packageBreakdown"` | list under the donut (one `<li>` per packaging category, with a colour `.swatch`) |
| `system.js/charts.js` before `/js/api.js` | shared graph style; must load after Chart.js |

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
| `id="rows"` | the table body (filled by the script; keep the 10 `<th>` columns in the same order: ID, Image, Name, Description, Packaging Category, Price, Stock, Sold, Category, Action) |
| `<template id="rowTemplate">` | the structure of every table row (the script copies it per product). Keep: `class="cell-id"`, the image cell (`class="row-img-btn"` button with `class="row-img"` + `class="row-img-none"` "Add image", and the hidden `<input type="file" class="row-image-input">`: clicking the image picks a new one, saved right away), the cells with `class="inline-input"` + `data-field` = `product_name`, `description`, `packaging_id`, `unit_price`, `stock`, `category`; the Sold `<input data-field="sold" readonly>`; the `.qty-btn` buttons with `data-qty="minus"/"plus"` + `data-field="stock"` or `"sold"`; and `class="row-delete-btn"`. A changed cell saves by itself (no Save button) |

**Notification bell** (messages from the admin)

| Keep this | What it is |
|---|---|
| `id="notifBtn"`, `id="notifBadge"` | the bell and its unread count (hidden when 0) |
| `id="notifPanel"`, `id="notifList"`, `id="notifEmpty"` | the pop-up list. The script adds one `<li class="notif-item">` per message (`.notif-subject`, `.notif-message`, and `.notif-actions` with `.notif-read-btn` / `.notif-status` "Read" + `.notif-reply-btn` "Reply" which jumps to `#feedback`); read ones also get `class="read"` |

**Add Product pop-up** (editing happens in the table)

| Keep this | What it is |
|---|---|
| `<dialog id="productFormContainer">` | the pop-up itself |
| `id="formTitle"`, `class="modal-subtitle"` | "Add Product" and the "Stall 7 …" line |
| `id="closeModalBtn"`, `id="cancelEdit"`, `id="saveBtn"` | ×, Cancel, Save |
| `id="productForm"` | the form |
| `name="product_id"` (hidden), `name="product_name"`, `name="category"` + `id="formCat"`, `name="description"`, `name="packaging_id"` + `id="formPackaging"`, `name="unit_price"`, `name="stock"`, `name="image"` + `id="imageInput"` | the fields (the `name`s are what the server receives) |
| `id="imagePreview"` | image preview `<img>` |
| `id="productMsg"` | error messages inside the pop-up |

**Feedback**

| Keep this | What it is |
|---|---|
| `id="feedbackForm"` with `name="feedback_type"`, `name="subject"`, `name="message"`, `name="attachment"` | New Message to Admin (keep the 4 `<option>` texts: Inquiry, Report a Problem, Suggestion, Stall Info Change) |
| `id="feedbackMsg"` | sent / error message |
| `id="subs"` | My Submissions list (filled by the script, with `.sub-view-btn` "View" buttons) |
| `<dialog id="submissionDialog">` | pop-up showing full submission (`id="subDialogTitle"`, `id="subDialogMeta"`, `id="subDialogMessage"`, `id="subDialogAttachment"`, `id="subDialogReplyWrap"`, `id="subDialogReply"`, `id="closeSubDialogBtn"`, `id="closeSubDialogFooterBtn"`) |

**Classes the script puts on generated content (style these freely):**
`product-thumb` (table image), `empty-row` ("No products found." / "No submissions yet."), `btn outline btn-sm` and `text-danger` (Edit / Delete buttons in rows), `submission-item` (each submission), `status-badge` plus `pending` / `replied` / `resolved` (status pill), `stat-note` (small grey text), `form-msg ok` (green success message), `active` (current sidebar link), `eco-category` and `eco-tip-text` (Eco-Tip pop-up), `positive` (on the banner when congratulating).

### `admin-page.html` (scripts: `/js/api.js`, then `system.js/admin-page.js`)

**Navigation**

| Keep this | What it is |
|---|---|
| `<button data-section="dashboard" data-title="Dashboard">` (and `accounts`, `stalls`, `products`, `categories`, `eco`) | sidebar buttons; `data-section` picks the page, `data-title` is the heading text |
| `id="section-dashboard"`, `id="section-accounts"`, `id="section-stalls"`, `id="section-products"`, `id="section-categories"`, `id="section-eco"` + `class="page"` | the pages (hidden / shown) |
| `id="page-title"`, `id="back-btn"` | heading and back button (the back button is hidden in the new design but the script still needs it) |
| `id="admin-logout"` | Log Out button at the bottom of the sidebar |
| `data-only="stalls"` / `"products"` / `"categories"` | header buttons shown only on that section (Add Stall, Add Product + bell, Add Category) |

**Dashboard:** `id="total-stalls"`, `id="total-categories"`, `id="total-products"`, `id="pending-accounts"` (the 4 stat cards), `id="plastic-by-stall"` + `id="plastic-by-stall-note"` (Plastic by stall bars inside `id="chart-1"`; data from `GET /api/admin/stats`), `id="feedback-count"`, `id="feedback-filter"`, `id="feedback-sort"`, `id="feedback-list"` (Vendor feedback cards).

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
| `id="feedback-reply-dialog"` / `id="feedback-reply-form"` (reply to vendor feedback) | `feedback_id` (hidden), `id="feedback-reply-subject"`, `id="feedback-reply-message"`, `status` (`id="feedback-reply-status"`), `admin_reply` (`id="feedback-reply-text"`) |

**Eco-Tips page:** tables `id="condition-table-body"` (4 columns: Condition, Threshold, Eco-Tip, Action/Edit) and `id="ecotip-table-body"` (4 columns), filled by the script.

Cancel buttons need `data-action="close-dialog"`.

**Notify vendors** (Product Management): `id="notif-btn"` + `id="notif-count"` (bell + unread count), `id="notif-panel"` / `id="notif-list"` / `id="notif-empty"` (sent messages, filled by the script), `<dialog id="notify-dialog">` / `id="notify-form"` with `name="product_id"`, `name="stall_id"` (hidden), `id="notify-vendor-name"`, `id="notify-product-name"` (filled by the script) and `name="comments"` (`id="notify-comments"`). The Stall Management panel `id="notification-list"` shows the same list.

**Buttons the script creates inside table rows** use `data-action="notify"` (products), `"edit"`, `"delete"`, `"approve"`, `"decline"`, plus `data-id`, and the row dropdown uses `data-action="change-category"`. You can style them with CSS like `button[data-action="delete"] { … }`.

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

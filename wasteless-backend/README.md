# WasteLess — Vendor Page Backend

Backend for the vendor side of WasteLess: **My Stall**, **Product Listing** (add / edit / delete pop-ups), and **Feedback / Report**.
Stack: HTML + CSS + JavaScript (Node.js + Express) + SQL (MySQL / MariaDB).

Business Analytics and Eco-Tip logic are **not** in here yet (other members / later phase), but their tables already exist in the database.

## Setup

1. Install **Node.js** (v18+) and **MySQL** (XAMPP's MariaDB works too — start it from the XAMPP panel).
2. Create the database:
   ```
   mysql -u root -p < database/schema.sql
   mysql -u root -p wasteless < database/seed.sql
   ```
   (Or paste both files into phpMyAdmin → SQL tab, schema first.)
3. Copy `.env.example` to `.env` and put your MySQL username/password.
4. Install and run:
   ```
   npm install
   npm start
   ```
5. Open **http://localhost:3000** — a plain test page. Add a product, then check phpMyAdmin → `wasteless` → `product`. It's there.

## For the front-end team

Include `public/js/api.js` and call the functions — no need to write fetch code:

```html
<script src="/js/api.js"></script>
<script>
  WasteLessAPI.getProducts({ q: 'adobo', category: 'Meals' }).then(d => console.log(d.products));
  WasteLessAPI.addProduct(document.querySelector('#addForm'));   // a <form> with the field names below
</script>
```

The page is in the repo root: `index.html`, `script.js`, `style.css` (served at http://localhost:3000). It's only a test page with no design. Replace it with the real screens.

## API

| Wireframe action | Method & URL | Send | Get back |
|---|---|---|---|
| Header (Stall ID / Name), My Stall info + 3 cards | `GET /api/stall` | — | stall info + `summary.products_listed`, `low_stock_items`, `plastic_items_sold_this_week` |
| Category chips | `GET /api/categories` | — | list of categories |
| Product table, search box, category filter | `GET /api/products?q=&category=` | — | `count` (Product Count) + `products` |
| Open Edit pop-up | `GET /api/products/:id` | — | one product |
| Add Product → Save Product | `POST /api/products` | FormData | the new product |
| Edit Product → Save Changes | `PUT /api/products/:id` | FormData (only changed fields needed) | the updated product |
| Delete pop-up → Delete | `DELETE /api/products/:id` | — | `{ deleted: true }` |
| Send to Admin | `POST /api/feedback` | FormData | the new submission |
| My Submissions list | `GET /api/feedback` | — | `submissions` (newest first) |
| View button | `GET /api/feedback/:id` | — | full submission + admin reply |

**Product fields:** `product_name`, `description`, `category` (name like `Meals`) or `category_id`, `packaging_type` (`Plastic` / `Paper` / `Reusable`), `unit_price`, `stock`, `image` (file, optional, ≤2 MB).

**Feedback fields:** `feedback_type` (`Inquiry` / `Report a Problem` / `Suggestion` / `Stall Info Change`), `subject`, `message`, `attachment` (image, optional).

**Errors** come back as status 400/404 with `{ "error": "...", "details": { "field": "message" } }` so the front end can highlight each bad field.

## What happens behind the scenes

- Every product is tied to the current stall. A stall can't see or change another stall's products.
- Adding a product writes a `stocklog` row (`initial`). Changing stock in Edit writes another (`restock` or `adjustment`), so stock history is kept.
- Delete is a **soft delete** (`is_active = 0`). Old sales and waste records still point to it, so analytics don't break.
- Uploaded images go to `/uploads` and are served at `image_url`.

## Not done yet

- **Login:** no login yet, so every request acts as the stall in `DEFAULT_CANTEEN_ID` (`.env`). When login is built, set `req.canteenId` from the logged-in staff in `src/middleware.js`.
- **Eco-Tip:** `conditions`, `eco_tip`, `notification` tables exist; logic comes later.
- **Business Analytics:** `sales_record` table and a `business_analytics` view exist for the other members.
- **Spreadsheet version** of Product Listing (2-ALT) isn't wired; the same endpoints can back it if the team picks it.

## Changes from the ERD (2nd draft)

- `packaging_type` moved from **Category** to **Product** — the wireframe lets each product pick its own packaging.
- **Product** gained `description`, `stock`, `image_path`, `is_active` (all shown in the Add/Edit pop-up).
- **Canteen** gained `business_email` and `contact_email` (shown on My Stall).
- New **Feedback** table for the Feedback / Report page.
- **Business_Analytics** is a view, not a table — it's computed from `sales_record`, so it can't go out of sync.
- **Sales_Record** gained `unit_price` and `sold_at` so revenue and "this week" can be computed.

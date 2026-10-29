# WasteLess — Canteen Inventory and Plastic Waste Monitoring System

Group 5 · Pi-Tech · QCU Cooperative

WasteLess tracks each canteen vendor's products and **plastic packaging** (Tetra Pak, Polystyrene, Plastic Container, Plastic Wrapper, Plastic Lid / Cap), so the Coop can see how much plastic leaves the canteen.

| Page | Who | What it does |
|---|---|---|
| Landing | anyone | Packaging graph for **all stalls** (last 7 / 14 / 30 days) + summary |
| Register / Log In | anyone | Vendors sign up (admin must approve), vendors and admins log in |
| Vendor page | vendor | Dashboard + packaging graph + **Eco-Tip** (warning pop-up / congratulation), Product Listing (add / edit / delete, images), weekly PDF report, Feedback to admin |
| Admin page | admin | Approve accounts, manage stalls, products, packaging categories, Eco-Tip rules and tips, read feedback |

**Stack:** HTML + CSS + JavaScript (front end) · Node.js + Express (back end) · MySQL / MariaDB (XAMPP)

---

## How to run it

### What you need (install once)
- **Node.js 18 or newer**: https://nodejs.org (the LTS version)
- **XAMPP**: https://www.apachefriends.org (for MySQL / MariaDB and phpMyAdmin)
- **VS Code** (recommended) and **Git**

### First-time setup (do once per computer)

1. **Get the code**
   ```
   git clone https://github.com/alwingeoffperez7-dev/Group-5---Pi-Tech.git
   cd Group-5---Pi-Tech
   ```
2. **Start MySQL**: open the XAMPP Control Panel → click **Start** next to **MySQL** (and **Apache** if you want phpMyAdmin).
3. **Create the database**: open http://localhost/phpmyadmin → **SQL** tab:
   1. Paste everything from `wasteless-backend/database/schema.sql` → **Go**.
   2. Click the new `wasteless` database on the left → **SQL** tab → paste `wasteless-backend/database/seed.sql` → **Go**.
   3. *(Optional, for graphs with data)* same way, paste `wasteless-backend/database/demo-data.sql` → **Go**.
4. **Make your `.env` file**: in the `wasteless-backend` folder, copy `.env.example` and rename the copy to `.env`.
   XAMPP's default login is `root` with no password, which is already what the file says. If your MySQL has a password, put it after `DB_PASSWORD=`.
5. **Install the packages**: in VS Code open **Terminal → New Terminal** and run (one line at a time):
   ```
   cd wasteless-backend
   npm install
   ```

### Every time you want to run it
1. XAMPP Control Panel → **Start MySQL**.
2. In the VS Code terminal:
   ```
   cd wasteless-backend
   npm start
   ```
   Wait for `WasteLess running at http://localhost:3000`.
3. Open **http://localhost:3000** in **Chrome or Edge**.
   Do **not** use VS Code's Live Preview / "Go Live" or double-click the HTML files: logging in only works through the server.
4. To stop: click the terminal and press `Ctrl + C`.

### Test accounts

| Role | Email | Password | Comes from |
|---|---|---|---|
| Admin | admin@wasteless.local | admin123 | `seed.sql` |
| Vendor | juan@example.com | vendor123 | `seed.sql` |
| Vendor | rosa@demo.local / bea@demo.local / kape@demo.local | demo123 | `demo-data.sql` |

New sign-ups from the Register page are **Pending** until the admin clicks **Approve** in Account Management.
These are test passwords only. Change them before real use.

### After pulling new code from GitHub
```
git checkout main
git pull
cd wasteless-backend
npm install
```
If your database was made **before 2026-10-15**, run `wasteless-backend/database/migrate.sql` once (phpMyAdmin → `wasteless` → SQL tab). It keeps your data.
If it was made **before 2026-10-22** (no Eco-Tips tab on the admin page, or it shows "Min. Pieces"), also run `wasteless-backend/database/migrate-eco-tip.sql` once, the same way.

### Common problems

| You see | Fix |
|---|---|
| `npm.ps1 cannot be loaded because running scripts is disabled` | Use `npm.cmd start` / `npm.cmd install`, or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `&&` is not a valid statement separator | VS Code's PowerShell: type the commands on separate lines |
| `EADDRINUSE` (port 3000 in use) | Another server (or VS Code Live Preview) is already on port 3000. Close it, or press `Ctrl + C` in the other terminal |
| `ECONNREFUSED` / database error | MySQL isn't started in XAMPP, or the password in `.env` is wrong |
| `WasteLessAPI is not defined` | You opened the page without the server. Use http://localhost:3000 |
| Page looks old after an update | Hard refresh: `Ctrl + F5` |
| Eco-Tip doesn't show / admin Eco-Tips tab shows "Min. Pieces" or an error | The database is older than the code: run `migrate-eco-tip.sql` (see "After pulling new code") |
| MySQL won't start (`Aria recovery failed` or `Incorrect file format`) | Don't copy XAMPP's `backup` folder over `data` (that hides every database). Ask the backend person; the fix is in their notes |
| Everyone got logged out | Normal after restarting the server (logins are kept in memory) |
| "Too many wrong passwords" | 5 wrong tries locks that email for 15 minutes (or restart the server) |

---

## Project folders

```
Group-5---Pi-Tech/
├── system.html/        ← the pages (front end)
├── system.js/          ← one script per page (front end + calls to the backend)
├── system.css/         ← stylesheets
├── FRONTEND-GUIDE.md   ← how to change the HTML/CSS without breaking the backend
├── ECO-TIP-GUIDE.md    ← Eco-Tip rules + how the team built them
├── wasteless-backend/
│   ├── src/            ← Express server + API routes
│   ├── public/js/api.js← shared helper the pages use to talk to the backend
│   ├── database/       ← schema.sql, seed.sql, migrate*.sql, demo-data.sql
│   ├── uploads/        ← product images / screenshots (not on GitHub)
│   └── README.md       ← API reference for the backend
└── index.html, script.js, style.css  ← old backend test page (http://localhost:3000/index.html)
```

- **Changing the look (HTML/CSS)?** Read **[FRONTEND-GUIDE.md](FRONTEND-GUIDE.md)** first.
- **Backend API details:** [wasteless-backend/README.md](wasteless-backend/README.md).

---

## Security and cookies (what's built in)

- **One cookie only**, `sid`, to keep you logged in: `HttpOnly` (page scripts can't read it), `SameSite=Strict` (never sent from other websites), expires after **8 hours** or on Log Out. Set `COOKIE_SECURE=true` in `.env` when the site runs on HTTPS. Details for users: the **Cookie & Privacy Policy** page (linked in the footer of the landing, log-in and register pages).
- **Passwords** are hashed with scrypt + a random salt; nobody can read them.
- **Access control:** vendors only ever see and change their own stall. Admin pages need an admin login. A stall that the admin declines or removes is logged out immediately.
- **Login lockout:** 5 wrong passwords → that email is locked for 15 minutes.
- **Uploads:** images only (JPG, PNG, WEBP, GIF, up to 2 MB). The server picks the file extension, so an upload can never run as a web page.
- **Security headers** on every page: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a Content Security Policy (scripts/styles/images only from this server, plus Chart.js from cdnjs and the Inter font from Google Fonts).
- **SQL injection:** every query uses placeholders (`?`), never pasted-in text.
- **Weekly PDF report:** one download per stall every 7 days, enforced by the server.

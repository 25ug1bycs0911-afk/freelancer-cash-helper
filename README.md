# Freelancer Cash Helper

A simple, no-login web app to track what clients owe you. Built for a freelance designer who bills each project in three parts (40% deposit, 30% midway, 30% final). All money is shown in Indian rupees, e.g. ₹1,20,000.

It is plain HTML, CSS and JavaScript. There is no framework, no build step and no npm.

## Screens

- **Clients** – each client with type (Agency or Direct), project count and total unpaid. Grand total unpaid at the top.
- **Client page** – each project with its invoices, status and dates, plus unpaid totals.
- **All invoices** – every invoice in one table.

Invoice statuses: **Paid** (green), **Unpaid** (amber), **Overdue** (red), **Draft** (grey). Statuses are worked out from the dates; they are not stored.

## How to run

**Option 1 – double-click:** open `index.html` in your browser.

**Option 2 – local server:** in this folder, run

```
python3 -m http.server 8000
```

then open http://localhost:8000 in your browser.

## Where the sample data lives

All the sample data is in `data/sample-data.js`. Edit that file to change clients, projects, invoices or amounts. The file has comments explaining the fields. Dates are day offsets from today (negative = days ago, positive = days ahead).

## Files

- `index.html` – page layout and navigation
- `css/styles.css` – styles (mobile first)
- `js/app.js` – logic and screens
- `data/sample-data.js` – all sample data

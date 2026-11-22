# Freelancer Cash Helper

A simple, no-login web app that shows a freelancer who owes them money, predicts their cash for the next 30 to 90 days, and tells them what to do today.

**Live demo:** https://25ug1bycs0911-afk.github.io/freelancer-cash-helper/

## The problem

Built for Problem Statement 1, Small Business Operations ("The One-Person Back Office"). Small business owners run on WhatsApp chats and spreadsheets, so invoices go unchased and they cannot tell if they can cover next month's bills.

The app is built for one user: Kabir, a freelance designer in India who bills each project in three parts (40% deposit, 30% midway, 30% final). Money is shown in rupees, e.g. ₹1,20,000.

## Screens and features

- **Dashboard**: cards for cash at the end of the period (with the lowest balance and its date), total owed, overdue, not yet sent, and biggest client share. A "Do this today" list gives each item a next action, such as See forecast, Draft reminder, or Mark as sent.
- **Draft reminder**: opens a reminder for one invoice, with Copy message, Send on WhatsApp, and Mark reminder as sent. The tone changes with how late the invoice is (heads-up, nudge, or firm).
- **Send on WhatsApp**: opens WhatsApp with the reminder message already filled in. No phone number is set.
- **Record payment**: enter an amount and the date received, then save.
- **Reset demo data**: clears everything saved in this browser (recorded payments, sent marks, added clients and projects, bills, and the opening balance) and goes back to the sample data.
- **Forecast**: switch between Next 30, 60 and 90 days. The cash forecast chart shows grey dashed = normal forecast, solid = what-if, and red = below zero. Hover over the chart to see the date, the balance, and that day's payments and bills.
- **What if?**: pick a client and a delay of 7, 15 or 30 days (e.g. Nova Studio paying 15 days later). It compares lowest balance, days below zero, and cash at end of period. Clear what-if removes it.
- **Clients**: each client with type (Agency or Direct), projects, total unpaid, and a payment habit learned from past paid invoices ("Pays about N days late", "Usually pays on time", or "No history yet").
- **Client page**: each project with its invoices, status and dates, with a link back to Clients.
- **All invoices**: every invoice in one table, with status filters.
- **Pricing**: Free (₹0) with up to 3 active projects, cash forecast and reminders. Pro is ₹499 per month and shows "Coming soon". The 3-project limit is shown on the page but not enforced yet.

Invoice statuses are **Draft**, **Unpaid**, **Part-paid**, **Overdue** and **Paid**. They are worked out from the dates and amounts paid each time the page is shown. They are not stored.

## How the forecast works

Each client's expected payment date is their invoice due date plus their average days late, based on their fully paid invoices. Nova Studio pays about 31 days late, so its invoices are expected about a month after they fall due. Bills are taken out on their due dates and repeat monthly where set. Draft invoices are left out unless marked sent. If an expected date has already passed, the payment is moved to 7 days from today.

## How to run

**Option 1: open the file.** Open `index.html` in your browser.

**Option 2: local server.** In this folder, run:

```
python3 -m http.server 8000
```

then open http://localhost:8000 in your browser.

## Sample data

All sample data is in `data/sample-data.js`. It holds seven clients (Nova Studio, Brightleaf Organics, Kestrel Fitness, Urban Pour Cafe, Meridian Law LLP, Sprout Kids Books, Orbit Analytics), their projects and invoices, an opening cash balance, and a list of bills.

Edit that file to change clients, projects, invoices or amounts. The comments at the top explain each field. Dates are day offsets from today: `-5` means 5 days ago and `10` means 10 days ahead. Amounts are plain numbers.

All of this is sample data. Nothing is saved to a server; changes you make in the app are kept only in this browser.

## Files

- `index.html`: page layout and navigation
- `css/styles.css`: styles
- `js/app.js`: logic and screens
- `data/sample-data.js`: all sample data

- `README.md`: this file

## Built with

Plain HTML, CSS and JavaScript. No framework, no build step, no npm. Built solo entirely in Codebenders, from the first prompt to the deployed link.

## Next steps

- **Accounts**
- **Cloud sync**
- **WhatsApp Business sending**

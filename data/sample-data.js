/*
  SAMPLE DATA - edit this file to change the app's data.

  - amount is in rupees (a plain number, no commas or ₹ sign).
  - Dates are day OFFSETS from today:
      dueOffset  -> when the invoice is due   (-5 = 5 days ago, 10 = 10 days ahead)
      paidOffset -> when it was paid (only add this when the invoice is paid)
  - draft: true  -> invoice not sent yet (shows as "Draft")
  - Status (Paid / Unpaid / Overdue / Draft) is worked out automatically. Do not type it in.
  - type must be "agency" or "direct".
  - label must be "Deposit", "Midway", "Final" or "Single".
*/
window.SAMPLE_DATA = {
  openingCashBalance: 40000,

  clients: [
    {
      id: "nova",
      name: "Nova Studio",
      type: "agency",
      projects: [
        {
          id: "nova-brand",
          name: "Brand refresh",
          total: 400000,
          invoices: [
            { id: "nova-brand-1", label: "Deposit", amount: 160000, dueOffset: -100, paidOffset: -72 },
            { id: "nova-brand-2", label: "Midway", amount: 120000, dueOffset: -60, paidOffset: -26 },
            { id: "nova-brand-3", label: "Final", amount: 120000, dueOffset: -22 }
          ]
        },
        {
          id: "nova-pitch",
          name: "Pitch deck design",
          total: 50000,
          invoices: [
            { id: "nova-pitch-1", label: "Single", amount: 50000, dueOffset: -150, paidOffset: -119 }
          ]
        }
      ]
    },
    {
      id: "brightleaf",
      name: "Brightleaf Organics",
      type: "direct",
      projects: [
        {
          id: "brightleaf-packaging",
          name: "Packaging design",
          total: 90000,
          invoices: [
            { id: "brightleaf-packaging-1", label: "Deposit", amount: 36000, dueOffset: -45, paidOffset: -45 },
            { id: "brightleaf-packaging-2", label: "Midway", amount: 27000, dueOffset: 6 },
            { id: "brightleaf-packaging-3", label: "Final", amount: 27000, dueOffset: 30 }
          ]
        }
      ]
    },
    {
      id: "kestrel",
      name: "Kestrel Fitness",
      type: "direct",
      projects: [
        {
          id: "kestrel-website",
          name: "Website design",
          total: 150000,
          invoices: [
            { id: "kestrel-website-1", label: "Deposit", amount: 60000, dueOffset: -70, paidOffset: -68 },
            { id: "kestrel-website-2", label: "Midway", amount: 45000, dueOffset: -9 },
            { id: "kestrel-website-3", label: "Final", amount: 45000, dueOffset: 24 }
          ]
        }
      ]
    },
    {
      id: "urbanpour",
      name: "Urban Pour Cafe",
      type: "direct",
      projects: [
        {
          id: "urbanpour-menu",
          name: "Menu and signage",
          total: 40000,
          invoices: [
            { id: "urbanpour-menu-1", label: "Deposit", amount: 16000, dueOffset: -30, paidOffset: -30 },
            { id: "urbanpour-menu-2", label: "Midway", amount: 12000, dueOffset: 14 },
            { id: "urbanpour-menu-3", label: "Final", amount: 12000, dueOffset: 40 }
          ]
        }
      ]
    },
    {
      id: "meridian",
      name: "Meridian Law LLP",
      type: "direct",
      projects: [
        {
          id: "meridian-logo",
          name: "Logo and stationery",
          total: 60000,
          invoices: [
            { id: "meridian-logo-1", label: "Deposit", amount: 24000, dueOffset: -80, paidOffset: -80 },
            { id: "meridian-logo-2", label: "Midway", amount: 18000, dueOffset: -40, paidOffset: -37 },
            { id: "meridian-logo-3", label: "Final", amount: 18000, dueOffset: -5 }
          ]
        }
      ]
    },
    {
      id: "sprout",
      name: "Sprout Kids Books",
      type: "direct",
      projects: [
        {
          id: "sprout-illustration",
          name: "Illustration set",
          total: 80000,
          invoices: [
            { id: "sprout-illustration-1", label: "Deposit", amount: 32000, dueOffset: -50, paidOffset: -50 },
            { id: "sprout-illustration-2", label: "Midway", amount: 24000, dueOffset: 20 },
            { id: "sprout-illustration-3", label: "Final", amount: 24000, dueOffset: 50 }
          ]
        }
      ]
    },
    {
      id: "orbit",
      name: "Orbit Analytics",
      type: "direct",
      projects: [
        {
          id: "orbit-dashboard",
          name: "Dashboard UI",
          total: 200000,
          invoices: [
            { id: "orbit-dashboard-1", label: "Deposit", amount: 80000, dueOffset: 7, draft: true },
            { id: "orbit-dashboard-2", label: "Midway", amount: 60000, dueOffset: 35, draft: true },
            { id: "orbit-dashboard-3", label: "Final", amount: 60000, dueOffset: 65, draft: true }
          ]
        }
      ]
    }
  ],

  // Personal bills: stored only, no screen uses them yet.
  bills: [
    { name: "Co-working rent", amount: 15000, dueOffset: 2, monthly: true },
    { name: "Software subscriptions", amount: 6500, dueOffset: 2, monthly: true },
    { name: "Living costs", amount: 45000, dueOffset: 3, monthly: true },
    { name: "Laptop EMI", amount: 8000, dueOffset: 5, monthly: true },
    { name: "Internet and phone", amount: 2000, dueOffset: 9, monthly: true },
    { name: "Health insurance", amount: 3500, dueOffset: 15, monthly: true },
    { name: "New laptop", amount: 120000, dueOffset: 14, monthly: false }
  ]
};

/**
 * Single source of truth for every permission in the system.
 * Adding a permission here without adding a row to the role matrix in
 * tests/authz.matrix.test.ts fails CI.
 */
export const PERMISSIONS = {
  // Inventory
  "inventory.read": "View lodges, categories, units, rooms and bedspaces",
  "inventory.write": "Create and edit lodges, units, rooms and bedspaces",
  "inventory.block": "Block bedspaces or put units into maintenance",
  "pricing.write": "Change category prices",
  "capacity.write": "Change room or unit capacity",

  // Bookings and allocation
  "booking.read": "Search and view bookings and occupants",
  "booking.cancel": "Cancel bookings",
  "booking.allocate": "Allocate occupants to rooms or bedspaces",
  "booking.reallocate": "Move an occupant to different inventory",

  // Payments
  "payment.read": "View payment status and transactions",
  "payment.reconcile": "Upload and resolve Paystack reconciliation",
  "payment.refund_record": "Record a refund against a booking",
  "payment.override": "Override a payment outcome (audited, reason required)",

  // Operations
  "checkin.perform": "Check occupants in",
  "checkin.override": "Check in an unpaid or unallocated booking (audited)",
  "checkout.perform": "Check occupants out",
  "keys.read": "View key status and logs",
  "keys.issue": "Issue a room key to an occupant",
  "keys.return": "Record a room key return",
  "keys.manage": "Mark keys missing, in maintenance, or restore them",

  // Support
  "support.create": "Create or report a ticket",
  "support.read": "View support tickets",
  "support.manage": "Assign, update and resolve tickets",

  // Reporting
  "reports.read": "View dashboard and reports",
  "reports.export": "Export reports to CSV/Excel",

  // Administration
  "users.manage": "Create, edit and disable staff accounts",
  "roles.manage": "Edit roles and permission assignments",
  "settings.manage": "Change system settings",
  "events.manage": "Create and edit events",
  "audit.read": "View the audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

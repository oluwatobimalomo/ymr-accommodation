import { ALL_PERMISSIONS, type Permission } from "./permissions";

export type RoleKey =
  | "super_admin"
  | "accommodation_admin"
  | "accommodation_officer"
  | "support_agent";

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  /** Permissions only apply to lodges the user is assigned to. */
  lodgeScoped: boolean;
  permissions: readonly Permission[];
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full access.",
    lodgeScoped: false,
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "accommodation_admin",
    name: "Accommodation Admin",
    description: "Inventory, bookings, allocation, operations and reports.",
    lodgeScoped: false,
    permissions: [
      "inventory.read",
      "inventory.write",
      "inventory.block",
      "pricing.write",
      "capacity.write",
      "booking.read",
      "booking.cancel",
      "booking.allocate",
      "booking.reallocate",
      "payment.read",
      "payment.reconcile",
      "payment.refund_record",
      "checkin.perform",
      "checkin.override",
      "checkout.perform",
      "keys.read",
      "keys.issue",
      "keys.return",
      "keys.manage",
      "support.create",
      "support.read",
      "support.manage",
      "reports.read",
      "reports.export",
      "audit.read",
    ],
  },
  {
    key: "accommodation_officer",
    name: "Accommodation Officer",
    description: "Check-in/out, room occupants and key custody for assigned lodges only.",
    lodgeScoped: true,
    permissions: [
      "inventory.read",
      "booking.read",
      "checkin.perform",
      "checkout.perform",
      "keys.read",
      "keys.issue",
      "keys.return",
      "support.create",
    ],
  },
  {
    key: "support_agent",
    name: "Support Agent",
    description: "Assist customers and manage tickets. Cannot change inventory or payments.",
    lodgeScoped: false,
    permissions: [
      "inventory.read",
      "booking.read",
      "payment.read",
      "support.create",
      "support.read",
      "support.manage",
    ],
  },
];

export function getRoleDefinition(key: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((r) => r.key === key);
}

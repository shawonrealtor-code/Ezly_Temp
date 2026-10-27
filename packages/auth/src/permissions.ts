import type { User } from "@ezly/store";

type Role = User["role"];

const ALL: Role[] = ["ADMIN", "PRODUCER", "CSR", "READ_ONLY"];
const STAFF: Role[] = ["ADMIN", "PRODUCER", "CSR"];

/** What each role may do. Every page and server action checks one of these. Deny by default. */
export const PERMISSIONS = {
  "dashboard:view": ALL,
  "accounts:read": ALL,
  "accounts:write": STAFF,
  "quotes:run": STAFF,
  "policies:write": STAFF,
  "restricted:reveal": ["ADMIN"],
  "reports:export": ["ADMIN"],
  "users:manage": ["ADMIN"],
  "audit:read": ["ADMIN"],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PRODUCER: "Producer",
  CSR: "CSR",
  READ_ONLY: "Read-only",
};

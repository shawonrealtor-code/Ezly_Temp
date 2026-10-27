import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isEncrypted, type Encrypted } from "./crypto.ts";

// Record shapes for every collection. Every record is validated against these before it is saved
// and again when it is loaded, so a hand-edited or damaged file is caught instead of silently used.

const id = () => z.uuid().default(() => randomUUID());
const isoDate = z.iso.date(); // YYYY-MM-DD
const isoDateTime = z.iso.datetime();
const optionalText = z.string().trim().min(1).optional();

/** Restricted values (SSN, driver's license, bank details) can only be stored encrypted. */
const encrypted = z
  .string()
  .refine(isEncrypted, { message: "Restricted fields must be encrypted before saving" })
  .transform((v) => v as Encrypted);

const base = {
  id: z.uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
};
const tenant = { ...base, agencyId: z.uuid() };

export const ROLES = ["ADMIN", "PRODUCER", "CSR", "READ_ONLY"] as const;
export const LOBS = ["auto", "home", "dwelling_fire"] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUOTED", "SOLD", "LOST"] as const;
export const POLICY_STATUSES = ["QUOTED", "BOUND", "ACTIVE", "RENEWING", "CANCELLED", "EXPIRED", "NON_RENEWED"] as const;
export const US_STATE = z.string().regex(/^[A-Z]{2}$/, "Use a two-letter state code");

export const agencySchema = z.object({
  ...base,
  name: z.string().trim().min(1),
  states: z.array(US_STATE).default([]),
});

export const userSchema = z.object({
  ...tenant,
  email: z.email().transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1),
  role: z.enum(ROLES).default("CSR"),
  active: z.boolean().default(true),
  passwordHash: z.string().optional(),
  /** Forces a password change at next sign-in (set for admin-created accounts). */
  mustChangePassword: z.boolean().default(false),
  failedLoginCount: z.number().int().min(0).default(0),
  lockedUntil: isoDateTime.optional(),
  lastLoginAt: isoDateTime.optional(),
  /** Authenticator-app secret. Present but unconfirmed while the user is still enrolling. */
  mfaSecret: encrypted.optional(),
  mfaConfirmedAt: isoDateTime.optional(),
  /** Last accepted TOTP time step, so a code cannot be replayed. */
  lastTotpStep: z.number().int().optional(),
  /** SHA-256 hashes of unused one-time recovery codes. */
  recoveryCodeHashes: z.array(z.string()).default([]),
  /** Bumped to sign the user out everywhere (password change, role change, deactivation). */
  sessionVersion: z.number().int().min(0).default(0),
});

export const sessionSchema = z.object({
  ...tenant,
  /** SHA-256 of the cookie token; the token itself is never stored. */
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  userId: z.uuid(),
  /** False while the user has entered their password but not yet their MFA code. */
  mfaVerified: z.boolean(),
  mfaAttempts: z.number().int().min(0).default(0),
  sessionVersion: z.number().int().min(0),
  lastSeenAt: isoDateTime,
  expiresAt: isoDateTime,
  ip: z.string().optional(),
  userAgent: z.string().max(300).optional(),
});

export const carrierSchema = z.object({
  ...tenant,
  name: z.string().trim().min(1),
  adapterKey: z.string().min(1),
  appointedStates: z.array(US_STATE).default([]),
  enabled: z.boolean().default(true),
});

export const personSchema = z.object({
  id: id(),
  relationship: z.enum(["primary", "spouse", "child", "other"]).default("primary"),
  prefix: optionalText,
  firstName: z.string().trim().min(1),
  middleInitial: optionalText,
  lastName: z.string().trim().min(1),
  suffix: optionalText,
  nickname: optionalText,
  gender: optionalText,
  dateOfBirth: isoDate.optional(),
  maritalStatus: optionalText,
  ssn: encrypted.optional(),
  ssnLast4: z.string().regex(/^\d{4}$/).optional(),
  dlNumber: encrypted.optional(),
  dlStatus: optionalText,
  dlState: US_STATE.optional(),
  education: optionalText,
  industry: optionalText,
  occupation: optionalText,
  preferredLanguage: z.string().default("English"),
});

export const addressSchema = z.object({
  id: id(),
  kind: z.enum(["home", "mailing", "previous"]).default("home"),
  line1: z.string().trim().min(1),
  line2: optionalText,
  unit: optionalText,
  city: z.string().trim().min(1),
  county: optionalText,
  state: US_STATE,
  zip: z.string().regex(/^\d{5}$/, "ZIP must be 5 digits"),
  zip4: z.string().regex(/^\d{4}$/).optional(),
  yearsAt: z.number().int().min(0).max(100).optional(),
  monthsAt: z.number().int().min(0).max(11).optional(),
  isPrimary: z.boolean().default(false),
});

export const phoneSchema = z.object({
  id: id(),
  kind: z.enum(["mobile", "home", "work", "other"]).default("mobile"),
  number: z.string().trim().min(7),
  preferred: z.boolean().default(false),
});

export const emailSchema = z.object({
  id: id(),
  kind: z.enum(["primary", "work", "other"]).default("primary"),
  address: z.email(),
  preferred: z.boolean().default(false),
});

export const accountSchema = z.object({
  ...tenant,
  type: z.enum(["personal", "commercial"]).default("personal"),
  vip: z.boolean().default(false),
  labels: z.array(z.string()).default([]),
  customerSince: isoDate.optional(),
  producerId: z.uuid().optional(),
  csrId: z.uuid().optional(),
  leadSource: optionalText,
  leadStatus: z.enum(LEAD_STATUSES).default("NEW"),
  leadPriority: z.enum(["low", "normal", "high"]).optional(),
  people: z.array(personSchema).min(1),
  addresses: z.array(addressSchema).default([]),
  phones: z.array(phoneSchema).default([]),
  emails: z.array(emailSchema).default([]),
  deletedAt: isoDateTime.optional(),
});

export const applicationSchema = z.object({
  ...tenant,
  accountId: z.uuid(),
  lob: z.enum(LOBS),
  status: z.enum(["draft", "valid", "invalid"]).default("draft"),
  risk: z.record(z.string(), z.unknown()).default({}),
});

export const carrierQuoteSchema = z.object({
  carrierKey: z.string(),
  status: z.enum(["ok", "error"]),
  annualPremium: z.number().nonnegative().optional(),
  termMonths: z.number().int().positive().optional(),
  errors: z.array(z.string()).default([]),
});

export const quoteRunSchema = z.object({
  ...tenant,
  accountId: z.uuid(),
  applicationId: z.uuid(),
  payPlan: z.enum(["full_pay", "monthly", "eft"]).default("full_pay"),
  submittedAt: isoDateTime,
  quotes: z.array(carrierQuoteSchema).default([]),
});

export const policySchema = z.object({
  ...tenant,
  accountId: z.uuid(),
  carrierId: z.uuid(),
  sourceQuoteRunId: z.uuid().optional(),
  lob: z.enum(LOBS),
  policyNumber: optionalText,
  status: z.enum(POLICY_STATUSES).default("BOUND"),
  effectiveDate: isoDate,
  expirationDate: isoDate,
  writtenPremium: z.number().nonnegative(),
});

export const taskSchema = z.object({
  ...tenant,
  accountId: z.uuid().optional(),
  title: z.string().trim().min(1),
  dueDate: isoDate.optional(),
  assigneeId: z.uuid().optional(),
  status: z.enum(["open", "done"]).default("open"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export const CHANGE_ACTIONS = ["create", "update", "delete"] as const;
export const AUTH_ACTIONS = [
  "login.success",
  "login.failure",
  "login.locked",
  "mfa.enrolled",
  "mfa.success",
  "mfa.failure",
  "mfa.recovery_used",
  "mfa.reset",
  "logout",
  "password.changed",
  "user.unlocked",
] as const;
export type AuthAction = (typeof AUTH_ACTIONS)[number];

export const auditEntrySchema = z.object({
  id: z.uuid(),
  at: isoDateTime,
  agencyId: z.uuid().nullable(),
  actorId: z.uuid().nullable(),
  collection: z.string(),
  recordId: z.string(),
  action: z.enum([...CHANGE_ACTIONS, ...AUTH_ACTIONS]),
  changes: z.record(z.string(), z.unknown()).optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  detail: z.string().optional(),
});

type BaseKeys = "id" | "createdAt" | "updatedAt" | "agencyId";
type Input<S extends z.ZodType> = Omit<z.input<S>, BaseKeys>;

export type Agency = z.output<typeof agencySchema>;
export type User = z.output<typeof userSchema>;
export type Carrier = z.output<typeof carrierSchema>;
export type Person = z.output<typeof personSchema>;
export type Address = z.output<typeof addressSchema>;
export type Account = z.output<typeof accountSchema>;
export type Application = z.output<typeof applicationSchema>;
export type QuoteRun = z.output<typeof quoteRunSchema>;
export type Policy = z.output<typeof policySchema>;
export type Task = z.output<typeof taskSchema>;
export type AuditEntry = z.output<typeof auditEntrySchema>;
export type Session = z.output<typeof sessionSchema>;

export type AgencyInput = Omit<z.input<typeof agencySchema>, "id" | "createdAt" | "updatedAt">;
export type UserInput = Input<typeof userSchema>;
export type SessionInput = Input<typeof sessionSchema>;
export type CarrierInput = Input<typeof carrierSchema>;
export type AccountInput = Input<typeof accountSchema>;
export type ApplicationInput = Input<typeof applicationSchema>;
export type QuoteRunInput = Input<typeof quoteRunSchema>;
export type PolicyInput = Input<typeof policySchema>;
export type TaskInput = Input<typeof taskSchema>;

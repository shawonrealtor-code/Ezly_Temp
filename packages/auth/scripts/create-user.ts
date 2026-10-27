// Creates a staff user from the server command line — used to create the first admin.
//   pnpm create-user --email owner@agency.com --name "Owner Name" --role ADMIN --agency-name "Saha Agency"
//   pnpm create-user --email csr@agency.com --name "CSR Name" --role CSR          (uses the only agency)
// The password is typed at a hidden prompt (or passed via EZLY_NEW_PASSWORD for automation).
// The user sets up their authenticator app at first sign-in.
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { ROLES, createStore } from "@ezly/store";
import { checkPasswordPolicy, hashPassword } from "../src/index.ts";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "ADMIN" },
    "agency-name": { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const dataDir = process.env.EZLY_DATA_DIR;
const fieldKey = process.env.EZLY_FIELD_KEY;
if (!dataDir || !fieldKey) fail("Set EZLY_DATA_DIR and EZLY_FIELD_KEY first.");
if (!values.email || !values.name) fail("Required: --email and --name");
const role = values.role as (typeof ROLES)[number];
if (!ROLES.includes(role)) fail(`--role must be one of ${ROLES.join(", ")}`);

const store = createStore({ dataDir, fieldKeys: [fieldKey] });
let agencies = await store.agencies.list();
if (values["agency-name"]) {
  const existing = agencies.find((a) => a.name === values["agency-name"]);
  agencies = existing ? [existing] : [await store.agencies.create({ name: values["agency-name"] }, { actorId: null })];
}
if (agencies.length !== 1) fail(agencies.length ? "Several agencies exist; pass --agency-name." : "No agency yet; pass --agency-name.");

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const output = rl as unknown as { _writeToOutput: (s: string) => void };
  output._writeToOutput = (s) => process.stdout.write(s.includes(question) ? s : "");
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = process.env.EZLY_NEW_PASSWORD ?? (await prompt("Password: "));
if (!process.env.EZLY_NEW_PASSWORD && password !== (await prompt("Repeat password: "))) fail("Passwords don't match.");
const problems = checkPasswordPolicy(password, { email: values.email, name: values.name });
if (problems.length) fail(problems.join("\n"));

const user = await store.forAgency(agencies[0].id).users.create({
  email: values.email,
  name: values.name,
  role,
  passwordHash: await hashPassword(password),
});
console.log(`Created ${user.role} ${user.email} in "${agencies[0].name}". They will set up MFA at first sign-in.`);

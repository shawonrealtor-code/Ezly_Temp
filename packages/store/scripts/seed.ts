// Fills a data directory with a demo agency and fake clients. Never seed real customer data.
// Usage: EZLY_DATA_DIR=... EZLY_FIELD_KEY=... pnpm --filter @ezly/store seed [--reset]
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { simulatedCarriers } from "@ezly/rating";
import { LEAD_STATUSES, LOBS, createStore } from "../src/index.ts";

const dataDir = process.env.EZLY_DATA_DIR;
const fieldKey = process.env.EZLY_FIELD_KEY;
if (!dataDir || !fieldKey) {
  console.error("Set EZLY_DATA_DIR and EZLY_FIELD_KEY (generate one with: pnpm --filter @ezly/store keygen)");
  process.exit(1);
}

if (process.argv.includes("--reset")) {
  await rm(join(dataDir, "collections"), { recursive: true, force: true });
  await rm(join(dataDir, "audit"), { recursive: true, force: true });
}

const store = createStore({ dataDir, fieldKeys: [fieldKey] });
if ((await store.agencies.list()).length > 0) {
  console.error(`${dataDir} already has data. Re-run with --reset to replace it.`);
  process.exit(1);
}

faker.seed(42);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

const agency = await store.agencies.create({ name: "Demo Agency", states: ["MD", "VA"] }, { actorId: null });
const a = store.forAgency(agency.id);
const producer = await a.users.create({ email: "producer@demo.ezly", name: "Jordan Mitchell", role: "PRODUCER" });
const csr = await a.users.create({ email: "csr@demo.ezly", name: "Lena Park", role: "CSR" });
await a.users.create({ email: "admin@demo.ezly", name: "Demo Admin", role: "ADMIN" });

const carriers = [];
for (const c of simulatedCarriers) {
  carriers.push(await a.carriers.create({ name: c.carrierName, adapterKey: c.key, appointedStates: ["MD", "VA"] }));
}

const today = new Date();
for (let i = 0; i < 50; i++) {
  const state = faker.helpers.arrayElement(["MD", "VA"]);
  const ssn = faker.string.numeric(9);
  const leadStatus = faker.helpers.arrayElement(LEAD_STATUSES);
  const account = await a.accounts.create({
    producerId: producer.id,
    csrId: csr.id,
    leadStatus,
    leadSource: faker.helpers.arrayElement(["Referral", "Website", "Walk-in", "Renewal list"]),
    customerSince: leadStatus === "SOLD" ? isoDate(faker.date.past({ years: 3 })) : undefined,
    people: [
      {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        dateOfBirth: isoDate(faker.date.birthdate({ min: 18, max: 80, mode: "age" })),
        ssn: store.cipher.encrypt(ssn),
        ssnLast4: ssn.slice(-4),
      },
    ],
    addresses: [
      {
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        state,
        zip: faker.location.zipCode("#####"),
        isPrimary: true,
        yearsAt: faker.number.int({ min: 0, max: 20 }),
      },
    ],
    phones: [{ number: faker.phone.number({ style: "national" }), preferred: true }],
    emails: [{ address: faker.internet.email().toLowerCase() }],
  });

  if (leadStatus === "SOLD") {
    const effective = faker.date.recent({ days: 330 });
    await a.policies.create({
      accountId: account.id,
      carrierId: faker.helpers.arrayElement(carriers).id,
      lob: faker.helpers.arrayElement(LOBS),
      policyNumber: faker.string.alphanumeric({ length: 10, casing: "upper" }),
      status: "ACTIVE",
      effectiveDate: isoDate(effective),
      expirationDate: isoDate(addDays(effective, 365)),
      writtenPremium: faker.number.int({ min: 800, max: 4500 }),
    });
  }
  if (i % 7 === 0) {
    await a.tasks.create({
      accountId: account.id,
      title: faker.helpers.arrayElement(["Call back about quote", "Collect roof photos", "Send renewal options"]),
      dueDate: isoDate(addDays(today, faker.number.int({ min: -3, max: 14 }))),
      assigneeId: producer.id,
    });
  }
}

console.log(`Seeded ${dataDir}: agency "${agency.name}" with 3 users, ${carriers.length} carriers and 50 fake clients.`);

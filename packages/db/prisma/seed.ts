// Seeds a demo agency with fake data. Never seed real customer data.
import "dotenv/config";
import { faker } from "@faker-js/faker";
import { simulatedCarriers } from "@ezly/rating";
import { prisma } from "../src/index.ts";

faker.seed(42);

async function main() {
  const agency = await prisma.agency.create({ data: { name: "Demo Agency" } });
  const producer = await prisma.user.create({
    data: { agencyId: agency.id, email: "producer@demo.ezly", name: "Demo Producer", role: "PRODUCER" },
  });
  await prisma.carrier.createMany({
    data: simulatedCarriers.map((c) => ({
      agencyId: agency.id, name: c.carrierName, adapterKey: c.key, appointedStates: ["MD", "VA"],
    })),
  });

  for (let i = 0; i < 50; i++) {
    const state = faker.helpers.arrayElement(["MD", "VA"]);
    await prisma.account.create({
      data: {
        agencyId: agency.id,
        producerId: producer.id,
        csrId: producer.id,
        leadStatus: faker.helpers.arrayElement(["NEW", "CONTACTED", "QUOTED", "SOLD"]),
        people: { create: { agencyId: agency.id, firstName: faker.person.firstName(), lastName: faker.person.lastName(),
          dateOfBirth: faker.date.birthdate({ min: 18, max: 80, mode: "age" }) } },
        addresses: { create: { agencyId: agency.id, line1: faker.location.streetAddress(), city: faker.location.city(),
          state, zip: faker.location.zipCode("#####"), isPrimary: true } },
        phones: { create: { agencyId: agency.id, number: faker.phone.number({ style: "national" }) } },
        emails: { create: { agencyId: agency.id, address: faker.internet.email() } },
      },
    });
  }
  console.log(`Seeded agency ${agency.id} with 50 accounts`);
}

main().finally(() => prisma.$disconnect());

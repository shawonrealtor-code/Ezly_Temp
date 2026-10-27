import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requireUser("accounts:import");
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/accounts", label: "Clients" }]}
        title="Import clients"
        subtitle="Bring in a client list from EZLynx or any spreadsheet saved as CSV."
      />
      <ImportWizard />
    </>
  );
}

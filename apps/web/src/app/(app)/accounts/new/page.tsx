import { PageHeader } from "@/components/ui";
import { assignableStaff } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { NewClientWizard } from "./new-client-wizard";

export default async function NewClientPage() {
  const { user, data } = await requireUser("accounts:write");
  const staff = await assignableStaff(data);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/accounts", label: "Clients" }]}
        title="New personal lines client"
        subtitle="Enter it once — Ezly reuses it for every carrier."
      />
      <NewClientWizard
        staff={staff}
        defaultProducerId={staff.producers.some((p) => p.id === user.id) ? user.id : ""}
        defaultCsrId={user.role === "CSR" ? user.id : ""}
      />
    </>
  );
}

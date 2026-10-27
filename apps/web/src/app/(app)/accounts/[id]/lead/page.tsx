import { accountToForm, assignableStaff, loadAccountPage } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { ClientEditor } from "../details/client-editor";

export default async function LeadPage({ params }: PageProps<"/accounts/[id]/lead">) {
  const { id } = await params;
  const { data, can } = await requireUser("accounts:read");
  const { account } = await loadAccountPage(data, id);
  return (
    <ClientEditor accountId={id} initial={accountToForm(account)} mode="lead" staff={await assignableStaff(data)} canEdit={can("accounts:write")} canReveal={false} />
  );
}

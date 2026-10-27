import { accountToForm, assignableStaff, loadAccountPage } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { ClientEditor } from "./client-editor";

export default async function DetailsPage({ params }: PageProps<"/accounts/[id]/details">) {
  const { id } = await params;
  const { data, can } = await requireUser("accounts:read");
  const { account } = await loadAccountPage(data, id);
  return (
    <ClientEditor
      accountId={id}
      initial={accountToForm(account)}
      mode="details"
      staff={await assignableStaff(data)}
      canEdit={can("accounts:write")}
      canReveal={can("restricted:reveal")}
    />
  );
}

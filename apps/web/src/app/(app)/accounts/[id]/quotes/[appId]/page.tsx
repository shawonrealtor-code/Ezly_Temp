import { primaryAddress } from "@ezly/core";
import { LOB_TITLES } from "@/lib/quote-forms";
import { requireUser } from "@/lib/auth";
import { checkApplication, household, loadApplication } from "@/lib/quotes";
import { QuoteEditor } from "./quote-editor";

export default async function ApplicationPage({ params, searchParams }: PageProps<"/accounts/[id]/quotes/[appId]">) {
  const { id, appId } = await params;
  const { fix } = await searchParams;
  const { data, can } = await requireUser("accounts:read");
  const { account, app } = await loadApplication(data, id, appId);
  const address = primaryAddress(account.addresses);
  return (
    <>
      <h2 className="text-lg font-semibold">{LOB_TITLES[app.lob]} quote application</h2>
      <QuoteEditor
        accountId={id}
        appId={appId}
        lob={app.lob}
        initial={app.risk}
        initialIssues={checkApplication(account, app.lob, app.risk).issues}
        household={household(account)}
        propertyAddress={address ? `${address.line1}, ${address.city}, ${address.state} ${address.zip}` : ""}
        canRate={can("quotes:run")}
        fix={typeof fix === "string" ? fix : undefined}
      />
    </>
  );
}

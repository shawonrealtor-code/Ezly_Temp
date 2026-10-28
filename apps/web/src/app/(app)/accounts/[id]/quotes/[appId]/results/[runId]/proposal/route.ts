import { requireUser } from "@/lib/auth";
import { proposalFor } from "../proposal-data";

export async function GET(_req: Request, ctx: RouteContext<"/accounts/[id]/quotes/[appId]/results/[runId]/proposal">) {
  const { id, appId, runId } = await ctx.params;
  const { user, data } = await requireUser("accounts:read");
  const { pdf, fileName } = await proposalFor(data, user, id, appId, runId);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

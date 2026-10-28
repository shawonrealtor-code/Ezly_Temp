import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { payPlanAmounts } from "@ezly/rating";
import type { CarrierQuote } from "@ezly/store";

// One- or two-page quote proposal for the client. Built with pdf-lib (pure JavaScript, no services).

export interface ProposalInput {
  agencyName: string;
  preparedBy: { name: string; email: string };
  clientName: string;
  clientAddress: string;
  lobTitle: string;
  ratedAt: string;
  summary: { label: string; value: string }[];
  quotes: CarrierQuote[];
  simulated: boolean;
}

// Standard PDF fonts only cover Latin-1; replace anything else so generation never fails.
const safe = (s: string) =>
  s.replace(/[‐-―−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const usd = (n: number, cents = false) => `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.4, 0.44, 0.52);
const BRAND = rgb(0.18, 0.33, 0.92);
const LINE = rgb(0.89, 0.91, 0.93);

export async function buildProposalPdf(p: ProposalInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`${p.lobTitle} insurance proposal - ${p.clientName}`));
  doc.setAuthor(safe(p.agencyName));
  doc.setCreator("Ezly");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 50;
  let page: PDFPage = doc.addPage([612, 792]);
  let y = 742;

  const text = (s: string, x: number, size = 10, font: PDFFont = regular, color = INK) => page.drawText(safe(s), { x, y, size, font, color });
  const wrap = (s: string, width: number, size: number, font: PDFFont = regular): string[] => {
    const words = safe(s).split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const ensure = (needed: number) => {
    if (y - needed < 60) {
      page = doc.addPage([612, 792]);
      y = 742;
    }
  };

  // Header
  page.drawRectangle({ x: 0, y: 760, width: 612, height: 32, color: BRAND });
  page.drawText(safe(p.agencyName), { x: M, y: 771, size: 12, font: bold, color: rgb(1, 1, 1) });
  y = 722;
  text(`${p.lobTitle} insurance proposal`, M, 20, bold);
  y -= 20;
  text(`Prepared for ${p.clientName}${p.clientAddress ? ` - ${p.clientAddress}` : ""}`, M, 10, regular, MUTED);
  y -= 14;
  text(`Prepared by ${p.preparedBy.name} (${p.preparedBy.email}) on ${p.ratedAt}`, M, 10, regular, MUTED);
  y -= 28;

  // What was quoted
  text("What we quoted", M, 12, bold);
  y -= 16;
  for (const s of p.summary) {
    const lines = wrap(s.value, 340, 10);
    ensure(lines.length * 13);
    text(s.label, M, 10, regular, MUTED);
    for (const l of lines) {
      text(l, M + 170, 10);
      y -= 13;
    }
  }
  y -= 16;

  // Quotes table
  const ok = p.quotes.filter((q) => q.status === "ok").sort((a, b) => a.annualPremium! - b.annualPremium!);
  text("Your options", M, 12, bold);
  y -= 18;
  const cols = [M, M + 150, M + 245, M + 345];
  const header = () => {
    text("Insurer", cols[0], 9, bold, MUTED);
    text("Pay in full", cols[1], 9, bold, MUTED);
    text("Monthly (bank draft)", cols[2], 9, bold, MUTED);
    text("Key coverages", cols[3], 9, bold, MUTED);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: 562, y }, thickness: 0.5, color: LINE });
    y -= 14;
  };
  header();
  ok.forEach((q, i) => {
    const plans = payPlanAmounts(q.termPremium!, q.termMonths!);
    const cov = wrap(q.coverages.map((c) => `${c.label}: ${c.value}`).join("; "), 212, 8.5);
    const height = Math.max(2, cov.length) * 12 + 8;
    if (y - height < 60) {
      page = doc.addPage([612, 792]);
      y = 742;
      header();
    }
    const top = y;
    text(`${i === 0 ? "* " : ""}${q.carrierName}`, cols[0], 10, bold);
    text(`${usd(plans.full_pay.total)} / ${q.termMonths} mo`, cols[1], 10);
    text(`${plans.eft.payments} x ${usd(plans.eft.perPayment, true)}`, cols[2], 10);
    y -= 12;
    text(`${usd(q.annualPremium!)} per year`, cols[1], 8.5, regular, MUTED);
    text(`total ${usd(plans.eft.total)}`, cols[2], 8.5, regular, MUTED);
    y = top;
    for (const l of cov) {
      text(l, cols[3], 8.5, regular, MUTED);
      y -= 12;
    }
    y = Math.min(y, top - 24) - 6;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: 562, y: y + 6 }, thickness: 0.5, color: LINE });
    y -= 6;
  });
  if (ok.length) {
    text("* Lowest price for the coverage shown.", M, 8.5, regular, MUTED);
    y -= 14;
  }
  const declined = p.quotes.length - ok.length;
  if (declined) {
    text(`${declined} other insurer${declined === 1 ? "" : "s"} could not offer a quote with the information provided.`, M, 9, regular, MUTED);
    y -= 14;
  }

  // Disclaimer
  y -= 10;
  const disclaimer = [
    "These are estimates based on the information you provided and are not a binder or guarantee of coverage.",
    "Final premium, coverage and eligibility are determined by the insurance company after underwriting.",
    "Monthly plans include installment fees. Please review the policy documents for full terms and exclusions.",
    ...(p.simulated ? ["SAMPLE ONLY: prices come from simulated insurers used for testing."] : []),
  ];
  for (const d of disclaimer) {
    for (const l of wrap(d, 512, 8.5)) {
      ensure(12);
      text(l, M, 8.5, regular, MUTED);
      y -= 11;
    }
  }
  return Buffer.from(await doc.save());
}

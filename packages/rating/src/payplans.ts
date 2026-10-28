// How a term premium is paid. Fees are typical carrier installment fees (simulated).

export type PayPlan = "full_pay" | "monthly" | "eft";

export interface PayPlanAmount {
  plan: PayPlan;
  label: string;
  payments: number;
  perPayment: number;
  total: number;
}

const FEES: Record<PayPlan, number> = { full_pay: 0, monthly: 6, eft: 2 };
export const PAY_PLAN_LABELS: Record<PayPlan, string> = { full_pay: "Pay in full", monthly: "Monthly (card or check)", eft: "Monthly (automatic bank draft)" };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function payPlanAmounts(termPremium: number, termMonths: number): Record<PayPlan, PayPlanAmount> {
  const plan = (p: PayPlan): PayPlanAmount => {
    if (p === "full_pay") return { plan: p, label: PAY_PLAN_LABELS[p], payments: 1, perPayment: termPremium, total: termPremium };
    const perPayment = round2(termPremium / termMonths + FEES[p]);
    return { plan: p, label: PAY_PLAN_LABELS[p], payments: termMonths, perPayment, total: round2(perPayment * termMonths) };
  };
  return { full_pay: plan("full_pay"), monthly: plan("monthly"), eft: plan("eft") };
}

import { z } from "zod";
import { infrai } from "./infrai_client.js";

export const paymentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("payment_settled"),
    event_id: z.string().min(1),
    payment_id: z.string().min(1),
    customer_email: z.string().email(),
    amount_cents: z.number().int().positive(),
    currency: z.string().length(3),
  }),
  z.object({
    type: z.literal("payout_requested"),
    event_id: z.string().min(1),
    payment_id: z.string().min(1),
    customer_email: z.string().email(),
    amount_cents: z.number().int().positive(),
    currency: z.string().length(3),
    risk_score: z.number().min(0).max(100),
    new_device: z.boolean(),
  }),
]);

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

type NotificationDecision = {
  action: "receipt_sent" | "payout_confirmed" | "manual_review";
  subject: string;
  audit_reason: string;
};

export function decidePaymentNotification(event: PaymentEvent): NotificationDecision {
  if (event.type === "payment_settled") {
    return {
      action: "receipt_sent",
      subject: `Receipt for payment ${event.payment_id}`,
      audit_reason: "settled_payment",
    };
  }
  if (event.risk_score >= 70 || event.new_device) {
    return {
      action: "manual_review",
      subject: `Payout ${event.payment_id} is under review`,
      audit_reason: event.risk_score >= 70 ? "elevated_risk_score" : "new_device",
    };
  }
  return {
    action: "payout_confirmed",
    subject: `Payout ${event.payment_id} confirmed`,
    audit_reason: "policy_checks_passed",
  };
}

export async function notifyPaymentEvent(event: PaymentEvent) {
  const decision = decidePaymentNotification(event);
  const amount = `${event.currency.toUpperCase()} ${(event.amount_cents / 100).toFixed(2)}`;
  const message = await infrai.email.send({
    to: event.customer_email,
    subject: decision.subject,
    html: `<p>${decision.subject}</p><p>Amount: ${amount}</p><p>Reference: ${event.payment_id}</p>`,
  }, event.event_id);

  return {
    event_id: event.event_id,
    payment_id: event.payment_id,
    action: decision.action,
    audit_reason: decision.audit_reason,
    message_id: message.message_id,
  };
}

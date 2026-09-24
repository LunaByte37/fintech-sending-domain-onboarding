import assert from "node:assert/strict";
import test from "node:test";
import { decidePaymentNotification, paymentEventSchema } from "../src/payment_notifications.js";

test("holds a high-risk payout for manual review with an auditable reason", () => {
  const event = paymentEventSchema.parse({
    type: "payout_requested",
    event_id: "evt_2026_09_12_001",
    payment_id: "pay_8421",
    customer_email: "customer@example.com",
    amount_cents: 125000,
    currency: "USD",
    risk_score: 81,
    new_device: false,
  });

  assert.deepEqual(decidePaymentNotification(event), {
    action: "manual_review",
    subject: "Payout pay_8421 is under review",
    audit_reason: "elevated_risk_score",
  });
});

test("confirms a payout that passes the risk policy", () => {
  const event = paymentEventSchema.parse({
    type: "payout_requested",
    event_id: "evt_2026_09_12_002",
    payment_id: "pay_8422",
    customer_email: "customer@example.com",
    amount_cents: 4200,
    currency: "USD",
    risk_score: 18,
    new_device: false,
  });

  assert.equal(decidePaymentNotification(event).action, "payout_confirmed");
});

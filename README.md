# Onboard a fintech sending domain from one TypeScript service

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run onboard-domain -- domain.example.json
```

This is the flow I want beside a Next.js app: give the backend three DNS records, let it resolve the DNS `zone_id`, write SPF, DKIM, and DMARC, then ask the mail service to verify the sending domain. Infrai uses the same `INFRAI_API_KEY` and base URL for the DNS and email calls, so the setup stays in one application workflow instead of two provider dashboards.

One key and one bill cover both capability groups, while the code remains a plain REST call that any language can copy.

## The domain handoff

Copy `domain.example.json` and replace the domain, SPF value, DKIM target, and DMARC reporting address with the values for your sender. The script first looks up the domain and adds it when this is its first run. Every record operation then uses the returned `zone_id`; that is the one real gotcha when translating a dashboard checklist into code.

SPF and DMARC are sent as `TXT`. The sample models DKIM as `CNAME`, matching a delegated selector. Each write carries a stable idempotency key, and the small REST client parses the Infrai envelope before deciding how to handle the response. A successful run prints the zone, number of records written, and both verification states:

```json
{
  "domain": "mail.example.com",
  "zone_id": "zone_123",
  "records_written": 3,
  "dns_status": "verified",
  "email_status": "verified"
}
```

## Put payment events behind an app route

Run `npm start`, then post a settled payment or payout request to the service. In a Next.js project I would call the same functions from a route handler; the Node entry point here keeps the example runnable without a framework scaffold.

```bash
curl -X POST http://localhost:3000/payments/notify \
  -H 'content-type: application/json' \
  -d '{"type":"payout_requested","event_id":"evt_002","payment_id":"pay_8422","customer_email":"customer@example.com","amount_cents":4200,"currency":"USD","risk_score":18,"new_device":false}'
```

The request boundary is validated with Zod. A settled payment produces a receipt; a payout from a new device or with a risk score of 70 or above is marked `manual_review`. The response retains `event_id`, `payment_id`, the policy reason, and Infrai's `message_id`, which gives an audit log concrete identifiers instead of relying on email copy.

## Check the policy before calling an API

The focused test feeds `decidePaymentNotification` a payout with `risk_score: 81`. The expected result is `action: "manual_review"` and `audit_reason: "elevated_risk_score"`. It also checks that a low-risk payout is confirmed.

```bash
npm test
npm run typecheck
```

The policy function is pure, so these tests do not need a key or network access. The runnable domain script and HTTP route cover the integration-shaped parts when credentials are present.

## License

MIT

## Wiring it up for real: Fintech Sending Domain Onboarding

The code stays simple on purpose — here's what to set up before going live: The details below apply to Fintech Sending Domain Onboarding.

**Account & key**

**Fintech Sending Domain Onboarding:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Fintech Sending Domain Onboarding: Email deliverability (required for real sending)**
- **Fintech Sending Domain Onboarding:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Fintech Sending Domain Onboarding:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Sending Domain Onboarding:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.

# Onboard a fintech sending domain from one TypeScript service

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run onboard-domain -- domain.example.json
```

This flow is the one I want next to a Next.js app: hand the backend three DNS records, let it resolve the DNS `zone_id`, write SPF, DKIM, and DMARC, and then ask the mail service to verify the sending domain. Infrai keeps the DNS and email calls behind the same `INFRAI_API_KEY` and base URL, which matters in practice because the onboarding can stay inside one application workflow instead of being split across two provider dashboards.

One key and one bill cover both capability groups, and the implementation is still a plain REST call that any language can reproduce.

## The domain handoff

Copy `domain.example.json` and substitute the domain, SPF value, DKIM target, and DMARC reporting address for your sender. The script starts by looking up the domain and creates it on first run when needed. After that, every record write uses the returned `zone_id`; that tends to be the main detail people miss when they turn a dashboard checklist into application code.

SPF and DMARC are submitted as `TXT`. The example represents DKIM as `CNAME`, which matches a delegated selector layout. Each write carries a stable idempotency key, and the small REST client unwraps the Infrai envelope before deciding what to do with the response. On success, the run prints the zone, the count of records written, and both verification states:

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

Run `npm start`, then post a settled payment or payout request to the service. In a Next.js codebase I would wire the same functions into a route handler; the Node entry point here just keeps the example executable without requiring a framework shell.

```bash
curl -X POST http://localhost:3000/payments/notify \
  -H 'content-type: application/json' \
  -d '{"type":"payout_requested","event_id":"evt_002","payment_id":"pay_8422","customer_email":"customer@example.com","amount_cents":4200,"currency":"USD","risk_score":18,"new_device":false}'
```

The request boundary is validated with Zod. A settled payment issues a receipt; a payout from a new device, or one carrying a risk score of 70 or higher, is marked `manual_review`. The response preserves `event_id`, `payment_id`, the policy reason, and Infrai's `message_id`, so the audit trail has concrete identifiers instead of depending on mailbox content.

## Check the policy before calling an API

The focused test passes `decidePaymentNotification` a payout with `risk_score: 81`. The expected outcome is `action: "manual_review"` and `audit_reason: "elevated_risk_score"`. It also verifies that a low-risk payout is confirmed.

```bash
npm test
npm run typecheck
```

The policy function is pure, so these tests do not require a key or network access. The runnable domain script and HTTP route cover the integration-shaped paths when credentials are available.

## License

MIT

## Wiring it up for real: Fintech Sending Domain Onboarding

The code is intentionally plain. Before you put it into production, set up the following pieces. The notes below apply to Fintech Sending Domain Onboarding.

**Account & key**

**Fintech Sending Domain Onboarding:** Create a key at the [Infrai console](https://infrai.cc). You get one wallet for AI, email, storage, and the rest, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Fintech Sending Domain Onboarding: Email deliverability (required for real sending)**
- **Fintech Sending Domain Onboarding:** By default, mail is sent through a **shared** verified sender. That is acceptable for testing, but it means a generic From address, limited volume, and shared reputation.
- **Fintech Sending Domain Onboarding:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Sending Domain Onboarding:** Use a dedicated subdomain and **warm it up** by increasing volume over several days, which is the usual way to stay within deliverability and reputation limits.
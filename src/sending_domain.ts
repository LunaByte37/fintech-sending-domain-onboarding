import { z } from "zod";
import { InfraiError, infrai } from "./infrai_client.js";

export const sendingDomainSchema = z.object({
  domain: z.string().min(1),
  spf: z.object({ name: z.string().min(1), content: z.string().min(1) }),
  dkim: z.object({ name: z.string().min(1), content: z.string().min(1) }),
  dmarc: z.object({ name: z.string().min(1), content: z.string().min(1) }),
});

export type SendingDomainInput = z.infer<typeof sendingDomainSchema>;

async function findOrAddZone(domain: string): Promise<{ zone_id: string }> {
  try {
    return await infrai.dns.domain.get(domain);
  } catch (error) {
    if (error instanceof InfraiError && error.status === 404) {
      return infrai.dns.domain.add(domain);
    }
    throw error;
  }
}

export async function onboardSendingDomain(input: SendingDomainInput) {
  const zone = await findOrAddZone(input.domain);
  const records = [
    { record_type: "TXT" as const, ...input.spf },
    { record_type: "CNAME" as const, ...input.dkim },
    { record_type: "TXT" as const, ...input.dmarc },
  ];

  await Promise.all(records.map((record) => infrai.dns.record.upsert({
    zone_id: zone.zone_id,
    ttl: 300,
    ...record,
  })));

  const dns = await infrai.dns.domain.verify(input.domain);
  const email = await infrai.email.domain.verify(input.domain);
  return {
    domain: input.domain,
    zone_id: zone.zone_id,
    records_written: records.length,
    dns_status: dns.verification.status,
    email_status: email.verification.status,
  };
}

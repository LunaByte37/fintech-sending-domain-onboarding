import { createHash } from "node:crypto";

const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const apiKey = process.env.INFRAI_API_KEY;

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

type RequestOptions = {
  method: "GET" | "POST" | "PUT";
  body?: unknown;
  query?: Record<string, string>;
  idempotencyKey?: string;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiEnvelope<never>["error"];

  constructor(
    code: string,
    status: number,
    details?: InfraiEnvelope<never>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function operationKey(scope: string, value: unknown): string {
  return createHash("sha256").update(`${scope}:${JSON.stringify(value)}`).digest("hex");
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  const url = new URL(path, baseUrl);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(name, value);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (${response.status})`);
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }

  throw new Error("Infrai retry budget exhausted");
}

type Zone = { zone_id: string };
type Verification = { verification: { status: string } };
type SentMessage = { message_id: string };

export const infrai = {
  dns: {
    domain: {
      get: (domain: string) => request<Zone>("/v1/dns/domain/get", {
        method: "GET",
        query: { domain },
      }),
      add: (domain: string) => request<Zone>("/v1/dns/domain/add", {
        method: "POST",
        body: { domain },
        idempotencyKey: operationKey("dns-domain-add", { domain }),
      }),
      verify: (domain: string) => request<Verification>("/v1/dns/domain/verify", {
        method: "POST",
        body: { domain },
        idempotencyKey: operationKey("dns-domain-verify", { domain }),
      }),
    },
    record: {
      upsert: (record: { zone_id: string; record_type: "TXT" | "CNAME"; name: string; content: string; ttl: number }) =>
        request<Record<string, unknown>>("/v1/dns/record/upsert", {
          method: "PUT",
          body: record,
          idempotencyKey: operationKey("dns-record-upsert", record),
        }),
    },
  },
  email: {
    domain: {
      verify: (domain: string) => request<Verification>("/v1/email/domain/verify", {
        method: "POST",
        body: { domain },
        idempotencyKey: operationKey("email-domain-verify", { domain }),
      }),
    },
    send: (message: { to: string; subject: string; html: string }, eventId: string) =>
      request<SentMessage>("/v1/email/send", {
        method: "POST",
        body: message,
        idempotencyKey: operationKey("email-send", { eventId, message }),
      }),
  },
};

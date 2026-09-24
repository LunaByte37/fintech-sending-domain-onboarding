import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_client.js";
import { notifyPaymentEvent, paymentEventSchema } from "./payment_notifications.js";
import { onboardSendingDomain, sendingDomainSchema } from "./sending_domain.js";

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function reply(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

export const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/domains/onboard") {
      const input = sendingDomainSchema.parse(await readJson(request));
      return reply(response, 200, await onboardSendingDomain(input));
    }
    if (request.method === "POST" && request.url === "/payments/notify") {
      const event = paymentEventSchema.parse(await readJson(request));
      return reply(response, 200, await notifyPaymentEvent(event));
    }
    return reply(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) return reply(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof SyntaxError) return reply(response, 400, { error: "invalid_json" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return reply(response, status, { error: error.code, message: error.message });
    }
    console.error(error);
    return reply(response, 500, { error: "internal_error" });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Fintech notification service listening on http://localhost:${port}`));
}

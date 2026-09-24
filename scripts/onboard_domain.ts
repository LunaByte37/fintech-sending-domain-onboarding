import { readFile } from "node:fs/promises";
import { onboardSendingDomain, sendingDomainSchema } from "../src/sending_domain.js";

const configPath = process.argv[2];
if (!configPath) throw new Error("Pass a domain JSON file: npm run onboard-domain -- domain.json");

const input = sendingDomainSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
const result = await onboardSendingDomain(input);
console.log(JSON.stringify(result, null, 2));

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  debugEnvContents,
  obtainGatewaySessionCookie,
  waitForFactory,
} from "../agent/shared/local-session";

const baseUrl = process.env.FACTORY_BASE_URL ?? "http://localhost:5173";
const out = process.env.DEBUG_ENV_FILE ?? path.join(process.cwd(), ".tools/debug.env");

await waitForFactory(baseUrl);
const cookie = await obtainGatewaySessionCookie({
  baseUrl,
  email: process.env.DEBUG_GATEWAY_EMAIL ?? "debug-gateway@local",
  password: process.env.DEBUG_GATEWAY_PASSWORD ?? "password123",
  name: "Debug Gateway",
});
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, debugEnvContents(cookie), "utf8");
console.log(JSON.stringify({ msg: "debug_session", out }));

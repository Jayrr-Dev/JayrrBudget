import { readFileSync, unlinkSync } from "node:fs";

const text = readFileSync(".env.vercel.check", "utf8");
function get(name) {
  const match = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) return null;
  return match[1].replace(/^"|"$/g, "");
}

const url = get("DATABASE_URL") ?? "";
const token = get("DATABASE_AUTH_TOKEN") ?? "";

console.log({
  urlLen: url.length,
  urlPrefix: url.slice(0, 24),
  isLibsql: url.startsWith("libsql://"),
  tokenLen: token.length,
  tokenLooksJwt: token.startsWith("eyJ"),
});

unlinkSync(".env.vercel.check");

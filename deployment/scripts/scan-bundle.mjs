#!/usr/bin/env node
/**
 * Scans a directory (default: frontend/dist) for content that must never ship to the browser.
 *
 * Usage:
 *   node deployment/scripts/scan-bundle.mjs [dir] [--canaries <file>]
 *
 * Checks:
 *   - Source maps (*.map) and env files.
 *   - Secret patterns: storage keys, SAS signatures, private keys, client secrets, JWTs, OpenAI-style keys,
 *     long Base64 blobs.
 *   - System prompt canaries: distinctive phrases of the Foundry agent instructions, read from --canaries <file>
 *     or the SYSTEM_PROMPT_CANARIES environment variable (one phrase per line). Canaries are optional so CI works
 *     without secrets; when absent the check is reported as skipped.
 *
 * Output never contains matched text: only the rule, the file and the byte offset. Exit code 1 on any finding.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const canaryFlag = args.indexOf("--canaries");
const canaryFile = canaryFlag >= 0 ? args[canaryFlag + 1] : undefined;
const dir = args.find((a, i) => !a.startsWith("--") && i !== canaryFlag + 1) ?? "frontend/dist";

const rules = [
    ["storage-account-key", /AccountKey=[A-Za-z0-9+/=]{20,}/],
    ["sas-signature", /[?&]sig=[A-Za-z0-9%+/=]{20,}/],
    ["shared-access-signature", /SharedAccessSignature=/i],
    ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["client-secret", /client_secret["'\s:=]+[A-Za-z0-9~._-]{20,}/i],
    ["jwt", /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
    ["openai-style-key", /\bsk-[A-Za-z0-9]{32,}/],
    ["azure-api-key-header", /["']api-key["']\s*:\s*["'][A-Za-z0-9]{32}["']/i],
    ["long-base64-blob", /[A-Za-z0-9+/]{400,}={0,2}/],
];

const canaries = (canaryFile ? readFileSync(canaryFile, "utf8") : process.env.SYSTEM_PROMPT_CANARIES ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20);

function* walk(path) {
    for (const entry of readdirSync(path)) {
        const full = join(path, entry);
        if (statSync(full).isDirectory()) yield* walk(full);
        else yield full;
    }
}

const findings = [];
let files = 0;
for (const file of walk(dir)) {
    files += 1;
    const name = relative(dir, file);
    if (/\.map$/i.test(name)) findings.push(["source-map", name, 0]);
    if (/(^|[\\/])\.env/i.test(name)) findings.push(["env-file", name, 0]);
    if (!/\.(js|mjs|css|html|json|txt|svg|map)$/i.test(name)) continue;

    const text = readFileSync(file, "utf8");
    for (const [rule, pattern] of rules) {
        const match = pattern.exec(text);
        if (match) findings.push([rule, name, match.index]);
    }
    const normalized = text.replace(/\\n|\s+/g, " ");
    for (const [i, canary] of canaries.entries()) {
        const at = normalized.indexOf(canary.replace(/\s+/g, " "));
        if (at >= 0) findings.push([`system-prompt-canary-${i + 1}`, name, at]);
    }
}

console.log(`Scanned ${files} files in ${dir}`);
console.log(canaries.length > 0 ? `System prompt canaries checked: ${canaries.length}` : "System prompt canaries: skipped (none provided)");
if (findings.length === 0) {
    console.log("OK: no findings");
    process.exit(0);
}
for (const [rule, file, offset] of findings) console.log(`FINDING ${rule} in ${file} at offset ${offset}`);
process.exit(1);

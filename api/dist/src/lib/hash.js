import { createHash } from "node:crypto";
export function contentHash(input) {
    return createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

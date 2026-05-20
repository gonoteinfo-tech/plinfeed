import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
function keyBuffer() {
    return Buffer.from(env.ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
}
export function encryptSecret(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyBuffer(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
export function decryptSecret(value) {
    const [ivHex, tagHex, encryptedHex] = value.split(":");
    if (!ivHex || !tagHex || !encryptedHex) {
        throw new Error("Invalid encrypted secret format");
    }
    const decipher = createDecipheriv("aes-256-gcm", keyBuffer(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
}

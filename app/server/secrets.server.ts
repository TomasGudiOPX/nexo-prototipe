import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverConfigValue } from "./config.server";

function key() {
  const value = serverConfigValue("NEXO_ENCRYPTION_KEY") ?? "";
  if (!/^[a-f\d]{64}$/i.test(value)) throw new Error("NEXO_ENCRYPTION_KEY must be 64 hexadecimal characters.");
  return Buffer.from(value, "hex");
}

export function encryptSecret(value: string) {
  if (!value) return null;
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string | null) {
  if (!value) return "";
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Encrypted credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

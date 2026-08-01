/**
 * Helpers shared by more than one domain router.
 * Anything used by a single router belongs in that router's own file.
 */
import crypto from "crypto";
/** Gemini 2.5 thinking models return content as an array of parts; extract plain text safely */
export function extractLLMText(response: any, fallback = ""): string {
  const content = response?.choices?.[0]?.message?.content;
  if (!content) return fallback;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (
      content
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || "")
        .join("") || fallback
    );
  }
  return fallback;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const [salt, key] = hash.split(":");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(derived.toString("hex") === key);
    });
  });
}

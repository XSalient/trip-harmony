/**
 * Helpers shared by more than one domain router.
 * Anything used by a single router belongs in that router's own file.
 */
import crypto from "crypto";
import type { User } from "../../drizzle/schema.js";

/**
 * The user fields that are safe to send to a browser.
 *
 * Built as an allow-list rather than by deleting `passwordHash`, so a column
 * added to the `users` table later cannot leak by default.
 */
export type PublicUser = Pick<
  User,
  | "id"
  | "openId"
  | "name"
  | "email"
  | "role"
  | "avatarUrl"
  | "loginMethod"
  | "createdAt"
  | "lastSignedIn"
>;

export function toPublicUser(user: User): PublicUser;
export function toPublicUser(user: User | null | undefined): PublicUser | null;
export function toPublicUser(user: User | null | undefined): PublicUser | null {
  if (!user) return null;
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    loginMethod: user.loginMethod,
    createdAt: user.createdAt,
    lastSignedIn: user.lastSignedIn,
  };
}

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

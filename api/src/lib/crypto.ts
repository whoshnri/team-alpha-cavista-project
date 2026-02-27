import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = crypto.scryptSync(process.env.MAGIC_LINK_SECRET || "nimi_magic_link_fallback_secret", "salt", 32);

export function encryptToken(payload: object): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    let encrypted = cipher.update(JSON.stringify(payload), "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptToken(token: string): any {
    try {
        const [ivHex, authTagHex, encrypted] = token.split(":");
        if (!ivHex || !authTagHex || !encrypted) return null;

        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return JSON.parse(decrypted);
    } catch (err) {
        console.error("[Crypto] Decryption failed:", err);
        return null;
    }
}

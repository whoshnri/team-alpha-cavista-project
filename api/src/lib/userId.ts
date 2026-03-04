import { prisma } from "../../prisma/client.js";

export async function getUserId(profile: any) {
    try {
        if (profile?.userId) return profile.userId;

        const userPromise = prisma.user.findFirst();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Database connection timed out after 5s")), 5000));

        // @ts-ignore
        const firstUser = await Promise.race([userPromise, timeoutPromise]);
        if (firstUser) return (firstUser as any).id;
    } catch (err) {
        console.warn("[Persistence] getUserId failed:", err instanceof Error ? err.message : err);
    }
    return null;
}

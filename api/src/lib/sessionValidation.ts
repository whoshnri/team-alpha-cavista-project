import type { Context } from "hono";
import { prisma } from "../../prisma/client.js"

interface validateSessionProps {
    chatSessionId: string;
    jwtUserId: string;
    c: Context
}


export async function validateSession({ chatSessionId, jwtUserId, c , }: validateSessionProps) {
    const session = await prisma.chatSession.findUnique({
        where: { id: chatSessionId },
        select: { userId: true }
    });
    if (!session) {
        console.warn(`[API: /chat] Session ${chatSessionId} not found, rejecting.`);
        return c.json({ success: false, error: "Invalid session." }, 404);
    }
    if (session.userId !== jwtUserId) {
        console.warn(`[API: /chat] Session ${chatSessionId} belongs to ${session.userId}, not ${jwtUserId}. Rejecting.`);
        return c.json({ success: false, error: "Session does not belong to you." }, 403);
    }
}
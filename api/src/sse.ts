import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

type SSEConnection = {
    userId: string;
    send: (event: string, data: any) => Promise<void>;
};

const connections = new Map<string, SSEConnection>();

export const sseManager = {
    addConnection: (userId: string, connection: SSEConnection) => {
        connections.set(userId, connection);
        console.log(`[SSE] New connection for user: ${userId}`);
    },
    removeConnection: (userId: string) => {
        connections.delete(userId);
        console.log(`[SSE] Connection closed for user: ${userId}`);
    },
    sendToUser: async (userId: string, event: string, data: any) => {
        const conn = connections.get(userId);
        if (conn) {
            await conn.send(event, data);
            return true;
        }
        return false;
    }
};

export const handleSSE = async (c: Context) => {
    const userId = c.req.query("userId");
    if (!userId) return c.text("userId required", 400);

    return streamSSE(c, async (stream) => {
        const connection: SSEConnection = {
            userId,
            send: async (event, data) => {
                await stream.writeSSE({
                    event,
                    data: JSON.stringify(data),
                });
            }
        };

        sseManager.addConnection(userId, connection);

        stream.onAbort(() => {
            sseManager.removeConnection(userId);
        });

        while (true) {
            await stream.sleep(30000); 
            await stream.writeSSE({ event: "heartbeat", data: "ping" });
        }
    });
};

import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL!

if(!REDIS_URL){
    throw new Error("REDIS_URL is not defined");
}

class RedisClient {
    private static instance: Redis | null = null;
    private static isConnected = false;

    private constructor() { }

    public static getInstance(): Redis {
        if (!RedisClient.instance) {
            console.log(`[Redis] Initializing connection to ${REDIS_URL}`);
            RedisClient.instance = new Redis(REDIS_URL, {
                retryStrategy: (times: number) => {
                    const delay = Math.min(times * 1000, 5000);
                    return delay; // Reconnect after a delay
                },
                maxRetriesPerRequest: 3,
                enableOfflineQueue: false, // Don't queue commands if Redis is down
            });

            RedisClient.instance.on('connect', () => {
                console.log('[Redis] Connected successfully');
                RedisClient.isConnected = true;
            });

            RedisClient.instance.on('error', (err: Error) => {
                console.error('[Redis Core Error] Connection failed:', err.message);
                RedisClient.isConnected = false;
            });
        }
        return RedisClient.instance;
    }

    public static getStatus() {
        return RedisClient.isConnected;
    }
}

export const redis = RedisClient.getInstance();
export const getRedisStatus = RedisClient.getStatus;

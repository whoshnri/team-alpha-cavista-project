import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import pg from "pg";

const connectionString = process.env.DATABASE_URL || `postgresql://neondb_owner:npg_RGHMeY8c4xXP@ep-flat-salad-aimolm3f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=verify-full`;

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export { prisma };

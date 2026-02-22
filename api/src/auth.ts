import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma/client.js";
import bcrypt from "bcryptjs";
import { sign } from "hono/jwt";
import { normalizePhoneNumber } from "./utils/phone.js";

const auth = new Hono();
const JWT_SECRET = process.env.JWT_SECRET || "preventiq_super_secret_key_123!";

const SignupSchema = z.object({
    fullName: z.string().min(2),
    phoneNumber: z.string().min(10),
    password: z.string().min(6),
    dateOfBirth: z.string(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]),
});

const LoginSchema = z.object({
    phoneNumber: z.string(),
    password: z.string(),
});

auth.post("/signup", zValidator("json", SignupSchema), async (c) => {
    let { fullName, phoneNumber, password, dateOfBirth, gender } = c.req.valid("json");
    phoneNumber = normalizePhoneNumber(phoneNumber);

    try {
        const existingUser = await prisma.user.findUnique({
            where: { phoneNumber },
        });

        if (existingUser) {
            return c.json({ success: false, error: "User already exists with this phone number" }, 400);
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                fullName,
                phoneNumber,
                passwordHash,
                dateOfBirth: new Date(dateOfBirth),
                gender,
            },
        });

        const token = await sign({ userId: user.id }, JWT_SECRET);

        return c.json({
            success: true,
            token,
            user: {
                id: user.id,
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
                gender: user.gender,
            },
        });
    } catch (err) {
        console.error("[Signup Error]", err);
        return c.json({ success: false, error: "Registration failed" }, 500);
    }
});

auth.post("/login", zValidator("json", LoginSchema), async (c) => {
    let { phoneNumber, password } = c.req.valid("json");
    phoneNumber = normalizePhoneNumber(phoneNumber);

    try {
        const user = await prisma.user.findUnique({
            where: { phoneNumber },
        });

        if (!user || !user.passwordHash) {
            return c.json({ success: false, error: "Invalid credentials" }, 401);
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return c.json({ success: false, error: "Invalid credentials" }, 401);
        }

        const token = await sign({ userId: user.id }, JWT_SECRET);

        return c.json({
            success: true,
            token,
            user: {
                id: user.id,
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
            },
        });
    } catch (err) {
        console.error("[Login Error]", err);
        return c.json({ success: false, error: "Login failed" }, 500);
    }
});

export { auth as authRoutes };

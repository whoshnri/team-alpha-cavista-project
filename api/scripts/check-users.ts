import {prisma} from "../prisma/client.js"

async function checkUsers() {
    try {
        const userCount = await prisma.user.count();
        console.log(`Total users in DB: ${userCount}`);
        if (userCount > 0) {
            const users = await prisma.user.findMany({ take: 5 });
            console.log("Sample users:", JSON.stringify(users, null, 2));
        }
    } catch (err) {
        console.error("Error checking users:", err);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();

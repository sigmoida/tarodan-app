
import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('Testing Prisma connection and new models...');

        // Check ErrorLog
        const errorLogCount = await prisma.errorLog.count();
        console.log(`ErrorLog count: ${errorLogCount}`);

        // Check SecurityLog
        const securityLogCount = await prisma.securityLog.count();
        console.log(`SecurityLog count: ${securityLogCount}`);

        // Check EmailLog
        const emailLogCount = await prisma.emailLog.count();
        console.log(`EmailLog count: ${emailLogCount}`);

        console.log('SUCCESS: All log models are accessible.');
    } catch (error) {
        console.error('FAILURE: Could not access log models.');
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();

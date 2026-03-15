import { PrismaClient } from './src/generated/prisma/client.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Resetting lastProcessedLine to 0 for all ProcessingMetadata records...');
  const result = await prisma.processingMetadata.updateMany({
    data: {
      lastProcessedLine: 0
    }
  });

  console.log(`Successfully reset ${result.count} metadata records.`);
  console.log('You can now safely re-upload your CSV files. The system will start parsing from line 0 and fill in ONLY the missing entries without duplicating existing ones!');
}

main().catch(console.error).finally(() => prisma.$disconnect());

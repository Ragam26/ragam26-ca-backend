import { PrismaClient } from "../generated/client.js";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Processes CSV files in a directory.
 * Each file name (without extension) is treated as the eventName.
 * It uses the ProcessingMetadata table to track exactly which lines were processed.
 * This ensures that even if some rows are skipped, we know where to resume.
 */
export async function processReferralCSVs(csvDirectory: string) {
  if (!fs.existsSync(csvDirectory)) {
    console.error(`Directory not found: ${csvDirectory}`);
    return;
  }

  const files = fs.readdirSync(csvDirectory).filter(f => f.endsWith('.csv'));

  for (const file of files) {
    const filePath = path.join(csvDirectory, file);
    const eventName = path.parse(file).name;
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse CSV
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as any[];

    // Get the last processed line index for this specific file
    const metadata = await prisma.processingMetadata.findUnique({
      where: { fileName: file }
    });

    const startIndex = metadata?.lastProcessedLine || 0;
    const newRecords = records.slice(startIndex);

    if (newRecords.length === 0) {
      console.log(`No new records for file: ${file}`);
      continue;
    }

    // console.log(`Processing ${newRecords.length} new records from ${file} for event ${eventName}`);

    // console.log(`New records for event ${eventName}:`, JSON.stringify(newRecords, null, 2));

    //------Processing the CSV file------

    const referralCodes = newRecords
      .map(record =>
        record.referralCode ||
        record.ReferralCode ||
        record['Referral Code'] ||
        record['referral_code'] ||
        record['referral_code_optional'] ||
        record['referal_code_optional']
      )
      .filter(Boolean)
      .map(code => String(code).trim());


    const uniqueReferralCodes = [...new Set(referralCodes)];

    const users = await prisma.user.findMany({
      where: {
        phoneNo: { in: uniqueReferralCodes }
      },
      select: { phoneNo: true }
    });

    const validReferralSet = new Set(users.map(u => u.phoneNo));

    const referralsToInsert = [];

    for (const record of newRecords) {

      const name =
        record.name ||
        record.Name ||
        record['Full Name'];

      const collegeName =
        record.collegeName ||
        record.College ||
        record['College Name'] ||
        record['college_name'];

      const referralCodeRaw =
        record.referralCode ||
        record.ReferralCode ||
        record['Referral Code'] ||
        record['referral_code'] ||
        record['referral_code_optional'] ||
        record['referal_code_optional'];

      if (!referralCodeRaw) continue;

      const referralCode = String(referralCodeRaw).trim();

      if (!validReferralSet.has(referralCode)) {
        console.log(`Skipping invalid referral code: ${referralCode}`);
        continue;
      }

      referralsToInsert.push({
        name: name ? String(name).trim() : null,
        collegeName: collegeName ? String(collegeName).trim() : null,
        referralCode,
        eventName,
        isPaid: false,
        registeredAt: record.registeredAt
          ? new Date(record.registeredAt)
          : new Date()
      });
    }


    if (referralsToInsert.length > 0) {
      await prisma.referral.createMany({
        data: referralsToInsert,
        skipDuplicates: false,
      });
    }

    console.log(`Inserted ${referralsToInsert.length} valid referrals`);

    // Update metadata with the new count (total records in the file) (upsert update if entry present else create)
    await prisma.processingMetadata.upsert({
      where: { fileName: file },
      update: { lastProcessedLine: records.length, updatedAt: new Date() },
      create: { fileName: file, lastProcessedLine: records.length, updatedAt: new Date() }
    });
  }
}

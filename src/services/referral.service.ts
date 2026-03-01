import { PrismaClient } from "../generated/client.js";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Processes CSV files provided as buffers (from memory storage).
 * Each file name (without extension) is treated as the eventName.
 * It uses the ProcessingMetadata table to track exactly which lines were processed.
 */
export async function processReferralCSVs(files: any[]) {
  for (const fileItem of files) {
    const fileName = fileItem.originalname;
    const eventName = fileName.split(".")[0];
    const content = fileItem.buffer.toString('utf-8');

    // Parse CSV
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as any[];

    // Get the last processed line index for this specific file
    const metadata = await prisma.processingMetadata.findUnique({
      where: { fileName: fileName }
    });

    const startIndex = metadata?.lastProcessedLine || 0;
    const newRecords = records.slice(startIndex);

    if (newRecords.length === 0) {
      console.log(`No new records for file: ${fileName}`);
      continue;
    }

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

    // console.log(uniqueReferralCodes);

    const users = await prisma.user.findMany({
      where: {
        phoneNo: { in: uniqueReferralCodes }
      },
      select: { phoneNo: true }
    });

    // console.log(users);

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

    // Update metadata with the new count
    await prisma.processingMetadata.upsert({
      where: { fileName: fileName },
      update: { lastProcessedLine: records.length, updatedAt: new Date() },
      create: { fileName: fileName, lastProcessedLine: records.length, updatedAt: new Date() }
    });

    console.log(`Successfully processed memory-buffer file: ${fileName}`);
  }
}

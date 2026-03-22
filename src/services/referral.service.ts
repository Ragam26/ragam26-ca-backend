import { PrismaClient } from "../generated/prisma/client.js";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

function getRecordValue(record: any, field: 'name' | 'college' | 'referral'): any {
  let referralCandidate = null;

  for (const key in record) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (field === 'name' && (norm === 'name' || norm === 'fullname' || norm === 'firstname')) {
      return record[key];
    }
    if (field === 'college' && (norm.includes('college') || norm.includes('institute') || norm.includes('university'))) {
      return record[key];
    }

    if (field === 'referral') {
      if (norm.includes('coupon')) {
        const val = record[key];
        if (val && String(val).trim()) return val;
      }
      if (norm.includes('refer') && norm.includes('code') && !referralCandidate) {
        referralCandidate = record[key];
      }
    }
  }

  // Fallback explicitly to the original hardcoded record keys just in case
  if (field === 'referral') {
    return referralCandidate ||
           record.referralCode ||
           record.ReferralCode ||
           record['Referral Code'] ||
           record['referral_code'] ||
           record['referral_code_optional'] ||
           record['referal_code_optional'] || record['referral_codeoptional'] || record['referralcodeoptional'] || record['referalcodeoptional'] || null;
  }

  return null;
}

/**
 * Processes CSV files provided as buffers (from memory storage).
 * Each file name (without extension) is treated as the eventName.
 * It uses the ProcessingMetadata table to track exactly which lines were processed.
 */
export async function processReferralCSVs(files: any[]) {
  for (const fileItem of files) {
    const fileName = fileItem.name;
    const eventName = fileName.split(".")[0];
    const content = fileItem.data.toString('utf-8');

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
      .map(record => getRecordValue(record, 'referral'))
      .filter(Boolean)
      .map(code => {
        let clean = String(code).replace(/\D/g, ''); // strip spaces, +, -, (, )
        if (clean.length === 12 && clean.startsWith('91')) clean = clean.slice(2);
        return clean;
      });


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

      const name = getRecordValue(record, 'name');
      const collegeName = getRecordValue(record, 'college');
      const referralCodeRaw = getRecordValue(record, 'referral');

      if (!referralCodeRaw) continue;

      let referralCode = String(referralCodeRaw).replace(/\D/g, '');
      if (referralCode.length === 12 && referralCode.startsWith('91')) {
        referralCode = referralCode.slice(2);
      }

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
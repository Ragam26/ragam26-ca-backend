import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from './src/generated/prisma/client.js';

const prisma = new PrismaClient();

function getRecordValue(record: any, field: 'name' | 'college' | 'referral'): any {
  for (const key in record) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (field === 'name' && (norm === 'name' || norm === 'fullname' || norm === 'firstname')) {
      return record[key];
    }
    if (field === 'college' && (norm.includes('college') || norm.includes('institute') || norm.includes('university'))) {
      return record[key];
    }
    if (field === 'referral' && norm.includes('refer') && norm.includes('code')) {
      return record[key];
    }
  }

  if (field === 'referral') {
    return record.referralCode ||
           record.ReferralCode ||
           record['Referral Code'] ||
           record['referral_code'] ||
           record['referral_code_optional'] ||
           record['referal_code_optional'] || 
           record['referral_codeoptional'] || 
           record['referralcodeoptional'] || 
           record['referalcodeoptional'] || null;
  }
  return null;
}

async function checkCSVs() {
  const dirPath = './excel_sheets';
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
    console.log(`\n📂 I just created a folder called "${dirPath}".`);
    console.log(`Please drop all your CSV files in that folder and run this script again!`);
    return;
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));

  if (files.length === 0) {
    console.log(`\n❌ No CSV files found in "${dirPath}". Please add them and try again.`);
    return;
  }

  let allValidToInsert = [];

  for (const file of files) {
    console.log(`\n📄 Processing ${file}...`);
    const eventName = file.split('.')[0];
    const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as any[];

    for (const [index, record] of records.entries()) {
      let refCodeRaw = getRecordValue(record, 'referral');
      if (!refCodeRaw) continue; // no code entered

      let rawString = String(refCodeRaw).trim();
      
      // ONLY process this row if the raw referral code entered by the user
      // is NOT exactly 10 digits to begin with (e.g. they typed +91, spaces, 12 digits, etc)
      // Because perfectly formatted 10-digit codes were already added to the DB!
      if (/^\d{10}$/.test(rawString)) {
        continue;
      }

      let cleanedPhone = rawString.replace(/\D/g, ''); // Fix spaces and +91
      
      if (cleanedPhone.length === 12 && cleanedPhone.startsWith('91')) {
        cleanedPhone = cleanedPhone.slice(2);
      }

      if (cleanedPhone.length !== 10) {
        console.log(`  [Row ${index + 2}] ⚠️ Invalid Phone Length (${cleanedPhone.length} digits): ${rawString}`);
        continue;
      }

      // Check if this cleaned phone number actually exists in your User database as a CA
      const caUser = await prisma.user.findUnique({
        where: { phoneNo: cleanedPhone }
      });

      if (!caUser) {
        console.log(`  [Row ${index + 2}] ❌ CA Not Found in DB: ${cleanedPhone} (Original: ${rawString})`);
        continue;
      }

      // Found a valid CA user!
      const name = getRecordValue(record, 'name');
      const college = getRecordValue(record, 'college');

      allValidToInsert.push({
        name: name ? String(name).trim() : null,
        collegeName: college ? String(college).trim() : null,
        referralCode: cleanedPhone, // The safe tested one
        eventName: eventName,
        isPaid: false,
        registeredAt: record.registeredAt ? new Date(record.registeredAt).toISOString() : new Date().toISOString()
      });
      
      console.log(`  [Row ${index + 2}] ✅ Match: ${name || 'Unknown'} -> ${cleanedPhone} (CA: ${caUser.name})`);
    }
  }

  if (allValidToInsert.length > 0) {
    console.log(`\n==============================================`);
    console.log(`🟢 GENERATED SQL SCRIPT FOR ${allValidToInsert.length} VALID ENTRIES`);
    console.log(`==============================================\n`);
    
    let sqlCommand = `INSERT INTO referrals (name, college_name, referral_code, event_name, is_paid, registered_at) VALUES\n`;
    
    let values = allValidToInsert.map(entry => {
      const escapedName = entry.name ? `'${entry.name.replace(/'/g, "''")}'` : 'NULL';
      const escapedCollege = entry.collegeName ? `'${entry.collegeName.replace(/'/g, "''")}'` : 'NULL';
      return `(${escapedName}, ${escapedCollege}, '${entry.referralCode}', '${entry.eventName}', false, '${entry.registeredAt.replace('T', ' ').replace('Z', '')}')`;
    });

    sqlCommand += values.join(',\n') + ';';
    
    console.log(sqlCommand);
    
    fs.writeFileSync('./generated_insert.sql', sqlCommand);
    console.log(`\n💾 (I also saved this SQL query to ./generated_insert.sql just in case!)`);

  } else {
    console.log(`\n⚠️ No valid codes found to insert after checking the database.`);
  }
}

checkCSVs()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { randomUUID } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CSV_PATH = process.env.CSV_PATH || path.join(__dirname, '..', 'flipkard.csv');
const BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE) || 5_000;
const CLEAR_EXISTING = process.env.CLEAR_EXISTING !== 'false';
const IMPORT_MAX_ROWS = process.env.IMPORT_MAX_ROWS
  ? Number(process.env.IMPORT_MAX_ROWS)
  : null;

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  fields.push(current);
  return fields;
}

function rowToProduct(fields) {
  const listingDate = new Date(`${fields[13]}T00:00:00.000Z`);

  if (Number.isNaN(listingDate.getTime())) {
    throw new Error(`Invalid listing_date "${fields[13]}" for product "${fields[1]}"`);
  }

  return {
    id: randomUUID(),
    name: fields[1],
    category: fields[2],
    price: Number(fields[8]).toFixed(2),
    created_at: listingDate,
    updated_at: listingDate,
  };
}

async function importCsv() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found: ${CSV_PATH}`);
  }

  if (CLEAR_EXISTING) {
    const existing = await prisma.product.count();
    if (existing > 0) {
      console.log(`Clearing ${existing.toLocaleString()} existing products...`);
      await prisma.product.deleteMany();
    }
  }

  const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let batch = [];
  let total = 0;
  let isHeader = true;
  const startedAt = Date.now();

  const target = IMPORT_MAX_ROWS ? `, max ${IMPORT_MAX_ROWS.toLocaleString()} rows` : '';
  console.log(`Importing from ${CSV_PATH} (batch size ${BATCH_SIZE}${target})...`);

  for await (const line of rl) {
    if (IMPORT_MAX_ROWS !== null && total >= IMPORT_MAX_ROWS) {
      break;
    }

    if (!line.trim()) {
      continue;
    }

    if (isHeader) {
      isHeader = false;
      continue;
    }

    const fields = parseCsvLine(line);
    batch.push(rowToProduct(fields));

    if (batch.length >= BATCH_SIZE) {
      const remaining = IMPORT_MAX_ROWS === null ? batch.length : IMPORT_MAX_ROWS - total;
      const chunk = IMPORT_MAX_ROWS === null ? batch : batch.slice(0, remaining);

      if (chunk.length > 0) {
        await prisma.product.createMany({ data: chunk, skipDuplicates: true });
        total += chunk.length;
        console.log(`  Inserted ${total.toLocaleString()} products`);
      }

      batch = IMPORT_MAX_ROWS === null ? [] : batch.slice(chunk.length);

      if (IMPORT_MAX_ROWS !== null && total >= IMPORT_MAX_ROWS) {
        break;
      }
    }
  }

  if (batch.length > 0 && (IMPORT_MAX_ROWS === null || total < IMPORT_MAX_ROWS)) {
    const remaining = IMPORT_MAX_ROWS === null ? batch.length : IMPORT_MAX_ROWS - total;
    const chunk = batch.slice(0, remaining);
    await prisma.product.createMany({ data: chunk, skipDuplicates: true });
    total += chunk.length;
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const count = await prisma.product.count();
  console.log(`Import complete: ${total.toLocaleString()} rows processed, ${count.toLocaleString()} products in DB (${elapsedSec}s)`);
}

importCsv()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

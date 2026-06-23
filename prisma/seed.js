'use strict';

const { randomUUID } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CATEGORIES = [
  'Electronics',
  'Clothing',
  'Home & Garden',
  'Sports',
  'Books',
  'Toys',
  'Beauty',
  'Automotive',
  'Health',
  'Food & Beverage',
  'Office Supplies',
  'Pet Supplies',
  'Jewelry',
  'Music',
  'Outdoor',
  'Baby',
  'Art & Crafts',
  'Furniture',
];

const ADJECTIVES = [
  'Premium',
  'Classic',
  'Modern',
  'Essential',
  'Deluxe',
  'Compact',
  'Pro',
  'Ultra',
  'Smart',
  'Eco',
  'Vintage',
  'Lightweight',
];

const NOUNS = [
  'Widget',
  'Gadget',
  'Kit',
  'Bundle',
  'Pack',
  'Set',
  'Tool',
  'Device',
  'Accessory',
  'Organizer',
  'Stand',
  'Case',
  'Charger',
  'Speaker',
  'Lamp',
];

const TOTAL_PRODUCTS = Number(process.env.SEED_PRODUCT_COUNT) || 200_000;
const BATCH_SIZE = Number(process.env.SEED_BATCH_SIZE) || 5_000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice() {
  return (Math.random() * 999 + 0.99).toFixed(2);
}

function randomName() {
  const adj = ADJECTIVES[randomInt(0, ADJECTIVES.length - 1)];
  const noun = NOUNS[randomInt(0, NOUNS.length - 1)];
  const suffix = randomInt(1, 9999);
  return `${adj} ${noun} ${suffix}`;
}

function randomTimestampPair() {
  const now = Date.now();
  const threeYearsMs = 3 * 365 * 24 * 60 * 60 * 1000;
  const createdMs = now - randomInt(0, threeYearsMs);
  const updatedMs = createdMs + randomInt(0, now - createdMs);
  return {
    created_at: new Date(createdMs),
    updated_at: new Date(updatedMs),
  };
}

function buildBatch(batchIndex, batchSize) {
  const products = [];
  const start = batchIndex * batchSize;
  const end = Math.min(start + batchSize, TOTAL_PRODUCTS);

  for (let i = start; i < end; i += 1) {
    const { created_at, updated_at } = randomTimestampPair();
    products.push({
      id: randomUUID(),
      name: randomName(),
      category: CATEGORIES[randomInt(0, CATEGORIES.length - 1)],
      price: randomPrice(),
      created_at,
      updated_at,
    });
  }

  return products;
}

async function seed() {
  const totalBatches = Math.ceil(TOTAL_PRODUCTS / BATCH_SIZE);
  console.log(`Seeding ${TOTAL_PRODUCTS.toLocaleString()} products in ${totalBatches} batches of ${BATCH_SIZE}...`);

  const existing = await prisma.product.count();
  if (existing > 0) {
    console.log(`Found ${existing.toLocaleString()} existing products. Clearing table...`);
    await prisma.product.deleteMany();
  }

  const startedAt = Date.now();

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const products = buildBatch(batchIndex, BATCH_SIZE);
    await prisma.product.createMany({ data: products, skipDuplicates: true });

    const inserted = Math.min((batchIndex + 1) * BATCH_SIZE, TOTAL_PRODUCTS);
    if ((batchIndex + 1) % 10 === 0 || batchIndex === totalBatches - 1) {
      console.log(`  Inserted ${inserted.toLocaleString()} / ${TOTAL_PRODUCTS.toLocaleString()} products`);
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const count = await prisma.product.count();
  console.log(`Seed complete: ${count.toLocaleString()} products in ${elapsedSec}s`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

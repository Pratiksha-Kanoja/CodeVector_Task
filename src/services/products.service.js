'use strict';

const prisma = require('../database/prisma');
const { encodeCursor, decodeCursor } = require('../utils/cursor');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function serializeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price.toString(),
    created_at: product.created_at.toISOString(),
    updated_at: product.updated_at.toISOString(),
  };
}

function buildKeysetFilter(cursor) {
  if (!cursor) {
    return {};
  }

  const { updated_at, id } = decodeCursor(cursor);

  return {
    OR: [
      { updated_at: { lt: updated_at } },
      {
        AND: [{ updated_at }, { id: { lt: id } }],
      },
    ],
  };
}

async function listProducts({ category, limit = DEFAULT_LIMIT, cursor }) {
  const pageSize = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const where = {
    ...buildKeysetFilter(cursor),
    ...(category ? { category } : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      created_at: true,
      updated_at: true,
    },
  });

  const hasMore = products.length > pageSize;
  const items = hasMore ? products.slice(0, pageSize) : products;

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor({ updated_at: last.updated_at, id: last.id });
  }

  return {
    items: items.map(serializeProduct),
    nextCursor,
  };
}

module.exports = {
  listProducts,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};

'use strict';

const { z } = require('zod');
const productsService = require('../services/products.service');

const listProductsQuerySchema = z.object({
  query: z.object({
    category: z
      .string()
      .trim()
      .min(1, 'category must not be empty')
      .max(100)
      .optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(productsService.MAX_LIMIT)
      .optional()
      .default(productsService.DEFAULT_LIMIT),
    cursor: z.string().trim().min(1).optional(),
  }),
});

async function listProducts(req, res) {
  const { category, limit, cursor } = req.validated.query;
  const result = await productsService.listProducts({ category, limit, cursor });
  res.json(result);
}

module.exports = {
  listProductsQuerySchema,
  listProducts,
};

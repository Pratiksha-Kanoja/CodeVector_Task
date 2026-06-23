'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const productsController = require('../controllers/products.controller');

const router = express.Router();

const listProductsHandlers = [
  validate(productsController.listProductsQuerySchema),
  asyncHandler(productsController.listProducts),
];

// Express 5 matches /products and /products/ separately when mounted as a sub-router.
router.get(['/', ''], ...listProductsHandlers);

module.exports = router;

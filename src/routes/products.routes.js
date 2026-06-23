'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const productsController = require('../controllers/products.controller');

const router = express.Router();

router.get(
  '/',
  validate(productsController.listProductsQuerySchema),
  asyncHandler(productsController.listProducts),
);

module.exports = router;

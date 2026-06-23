'use strict';

const express = require('express');
const productsRoutes = require('./products.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/products', productsRoutes);

module.exports = router;

'use strict';

const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const env = require('../config/env');
const { AppError } = require('../utils/errors');

function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = 400;
    message = 'Database request failed';
    if (env.NODE_ENV === 'development') {
      details = { code: err.code, meta: err.meta };
    }
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  const body = { error: message };
  if (details !== undefined) {
    body.details = details;
  }

  res.status(statusCode).json(body);
}

module.exports = { notFoundHandler, errorHandler };

'use strict';

const { AppError } = require('./errors');

const CURSOR_VERSION = 1;

function encodeCursor({ updated_at, id }) {
  const payload = {
    v: CURSOR_VERSION,
    u: updated_at.toISOString(),
    i: id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }

  let parsed;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new AppError('Invalid cursor format', 400);
  }

  if (parsed?.v !== CURSOR_VERSION || typeof parsed.u !== 'string' || typeof parsed.i !== 'string') {
    throw new AppError('Invalid cursor payload', 400);
  }

  const updated_at = new Date(parsed.u);
  if (Number.isNaN(updated_at.getTime())) {
    throw new AppError('Invalid cursor timestamp', 400);
  }

  return { updated_at, id: parsed.i };
}

module.exports = { encodeCursor, decodeCursor };

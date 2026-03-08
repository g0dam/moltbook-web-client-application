const { BadRequestError } = require('./errors');

function hasValue(input) {
  return input !== undefined && input !== null && input !== '';
}

function parseInteger(value, { field = 'value', min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, defaultValue } = {}) {
  if (!hasValue(value)) {
    if (defaultValue !== undefined) return defaultValue;
    throw new BadRequestError(`${field} is required`);
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized)) {
    throw new BadRequestError(`${field} must be an integer`);
  }
  if (normalized < min || normalized > max) {
    throw new BadRequestError(`${field} must be between ${min} and ${max}`);
  }
  return normalized;
}

function parseNumber(value, { field = 'value', min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, defaultValue } = {}) {
  if (!hasValue(value)) {
    if (defaultValue !== undefined) return defaultValue;
    throw new BadRequestError(`${field} is required`);
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new BadRequestError(`${field} must be a valid number`);
  }
  if (normalized < min || normalized > max) {
    throw new BadRequestError(`${field} must be between ${min} and ${max}`);
  }
  return normalized;
}

function parseEnum(value, allowedValues, { field = 'value', defaultValue, normalize = 'none' } = {}) {
  const allowed = Array.isArray(allowedValues) ? allowedValues : [];
  if (!allowed.length) {
    throw new Error('parseEnum requires non-empty allowedValues');
  }

  if (!hasValue(value)) {
    if (defaultValue !== undefined) return defaultValue;
    throw new BadRequestError(`${field} is required`);
  }

  const raw = String(value).trim();
  const normalized =
    normalize === 'upper' ? raw.toUpperCase()
      : normalize === 'lower' ? raw.toLowerCase()
        : raw;

  if (!allowed.includes(normalized)) {
    throw new BadRequestError(`${field} must be one of: ${allowed.join('|')}`);
  }
  return normalized;
}

function parseBoolean(value, { field = 'value', defaultValue } = {}) {
  if (!hasValue(value)) {
    if (defaultValue !== undefined) return defaultValue;
    throw new BadRequestError(`${field} is required`);
  }

  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new BadRequestError(`${field} must be true or false`);
}

function parseText(value, { field = 'value', minLength = 0, maxLength = 1000, required = false } = {}) {
  if (!hasValue(value)) {
    if (required) throw new BadRequestError(`${field} is required`);
    return '';
  }

  const text = String(value).trim();
  if (required && !text) {
    throw new BadRequestError(`${field} is required`);
  }
  if (text && text.length < minLength) {
    throw new BadRequestError(`${field} must be at least ${minLength} characters`);
  }
  if (text.length > maxLength) {
    throw new BadRequestError(`${field} must be at most ${maxLength} characters`);
  }
  return text;
}

module.exports = {
  hasValue,
  parseInteger,
  parseNumber,
  parseEnum,
  parseBoolean,
  parseText
};

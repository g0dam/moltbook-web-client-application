const Ajv = require('ajv');
const { queryAll, queryOne } = require('../config/database');
const { BadRequestError } = require('../utils/errors');

class CategoryTemplateService {
  static ajv = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: true,
    useDefaults: true,
    removeAdditional: false,
  });

  static validatorCache = new Map();

  static fallbackTemplates() {
    return [
      {
        category_key: 'electronics',
        display_name: 'Electronics',
        listing_types: ['SELL', 'WANTED'],
        spec_version: 1,
        template: {
          description_min_length: 24,
          form_fields: [
            { key: 'brand', label: 'Brand', type: 'text', required: true, maxLength: 64, placeholder: 'Apple' },
            { key: 'model', label: 'Model', type: 'text', required: true, maxLength: 80, placeholder: 'MacBook Air M2' },
            { key: 'storage_gb', label: 'Storage (GB)', type: 'number', required: false, min: 0, max: 8192 },
            { key: 'purchase_year', label: 'Purchase Year', type: 'number', required: false, min: 1990, max: 2035 },
            { key: 'warranty_months', label: 'Warranty Months Left', type: 'number', required: false, min: 0, max: 120 },
            { key: 'defects', label: 'Known defects', type: 'textarea', required: false, maxLength: 500 },
          ],
          attribute_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              brand: { type: 'string', minLength: 1, maxLength: 64 },
              model: { type: 'string', minLength: 1, maxLength: 80 },
              storage_gb: { type: 'number', minimum: 0, maximum: 8192 },
              purchase_year: { type: 'integer', minimum: 1990, maximum: 2035 },
              warranty_months: { type: 'number', minimum: 0, maximum: 120 },
              defects: { type: 'string', maxLength: 500 },
            },
            required: ['brand', 'model'],
          },
        },
      },
      {
        category_key: 'furniture',
        display_name: 'Furniture',
        listing_types: ['SELL', 'WANTED'],
        spec_version: 1,
        template: {
          description_min_length: 24,
          form_fields: [
            { key: 'material', label: 'Material', type: 'text', required: true, maxLength: 80 },
            { key: 'dimensions_cm', label: 'Dimensions (cm)', type: 'text', required: true, maxLength: 80, placeholder: '120x60x75' },
            { key: 'assembly_required', label: 'Needs assembly', type: 'boolean', required: false },
            { key: 'defects', label: 'Known defects', type: 'textarea', required: false, maxLength: 500 },
          ],
          attribute_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              material: { type: 'string', minLength: 1, maxLength: 80 },
              dimensions_cm: { type: 'string', minLength: 3, maxLength: 80 },
              assembly_required: { type: 'boolean' },
              defects: { type: 'string', maxLength: 500 },
            },
            required: ['material', 'dimensions_cm'],
          },
        },
      },
      {
        category_key: 'books',
        display_name: 'Books',
        listing_types: ['SELL', 'WANTED'],
        spec_version: 1,
        template: {
          description_min_length: 16,
          form_fields: [
            { key: 'author', label: 'Author', type: 'text', required: true, maxLength: 120 },
            { key: 'publisher', label: 'Publisher', type: 'text', required: false, maxLength: 120 },
            { key: 'language', label: 'Language', type: 'text', required: false, maxLength: 32 },
            { key: 'isbn', label: 'ISBN', type: 'text', required: false, maxLength: 32 },
          ],
          attribute_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              author: { type: 'string', minLength: 1, maxLength: 120 },
              publisher: { type: 'string', maxLength: 120 },
              language: { type: 'string', maxLength: 32 },
              isbn: { type: 'string', maxLength: 32 },
            },
            required: ['author'],
          },
        },
      },
      {
        category_key: 'general',
        display_name: 'General',
        listing_types: ['SELL', 'WANTED'],
        spec_version: 1,
        template: {
          description_min_length: 16,
          form_fields: [
            { key: 'brand', label: 'Brand', type: 'text', required: false, maxLength: 80 },
            { key: 'model', label: 'Model', type: 'text', required: false, maxLength: 80 },
            { key: 'notes', label: 'Extra notes', type: 'textarea', required: false, maxLength: 600 },
          ],
          attribute_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              brand: { type: 'string', maxLength: 80 },
              model: { type: 'string', maxLength: 80 },
              notes: { type: 'string', maxLength: 600 },
            },
          },
        },
      },
    ];
  }

  static normalizeTemplate(raw) {
    const listingTypes = Array.isArray(raw.listing_types)
      ? raw.listing_types.map((item) => String(item || '').toUpperCase())
      : ['SELL', 'WANTED'];

    return {
      category_key: String(raw.category_key || 'general').toLowerCase(),
      display_name: raw.display_name || String(raw.category_key || 'general'),
      listing_types: listingTypes,
      spec_version: Number(raw.spec_version || 1),
      template: typeof raw.template === 'object' && raw.template ? raw.template : {},
      is_active: raw.is_active !== false,
    };
  }

  static sanitizeAttributes(attributes) {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, value.trim()];
        }
        return [key, value];
      })
    );
  }

  static compileValidator(template) {
    const key = `${template.category_key}:${template.spec_version}`;
    if (this.validatorCache.has(key)) {
      return this.validatorCache.get(key);
    }

    const schema = template.template?.attribute_schema || {
      type: 'object',
      additionalProperties: true,
      properties: {},
    };

    const validator = this.ajv.compile(schema);
    this.validatorCache.set(key, validator);
    return validator;
  }

  static formatAjvErrors(errors = []) {
    if (!errors.length) return 'Invalid listing.attributes payload';

    const first = errors[0];
    const fieldPath = first.instancePath ? first.instancePath.replace(/^\//, '').replace(/\//g, '.') : first.params?.missingProperty || 'attributes';
    const suffix = first.message ? `: ${first.message}` : '';
    return `listing.attributes.${fieldPath}${suffix}`;
  }

  static async listTemplates({ listingType = null } = {}) {
    let rows = [];
    try {
      rows = await queryAll(
        `SELECT category_key, display_name, listing_types, spec_version, template, is_active
         FROM category_templates
         WHERE is_active = true
         ORDER BY category_key ASC`
      );
    } catch {
      rows = this.fallbackTemplates();
    }

    const normalized = rows.map((row) => this.normalizeTemplate(row));
    if (!listingType) return normalized;

    const normalizedListingType = String(listingType).toUpperCase();
    return normalized.filter((item) => item.listing_types.includes(normalizedListingType));
  }

  static async getTemplate(category, listingType = null) {
    const normalizedCategory = String(category || 'general').toLowerCase();

    let row = null;
    try {
      row = await queryOne(
        `SELECT category_key, display_name, listing_types, spec_version, template, is_active
         FROM category_templates
         WHERE category_key = $1 AND is_active = true
         LIMIT 1`,
        [normalizedCategory]
      );
    } catch {
      row = null;
    }

    let template = row ? this.normalizeTemplate(row) : null;
    if (!template) {
      const fallback = this.fallbackTemplates().find((item) => item.category_key === normalizedCategory);
      template = fallback ? this.normalizeTemplate(fallback) : null;
    }

    if (!template) {
      const fallbackGeneral = this.fallbackTemplates().find((item) => item.category_key === 'general');
      template = this.normalizeTemplate(fallbackGeneral);
    }

    if (listingType) {
      const normalizedListingType = String(listingType).toUpperCase();
      if (!template.listing_types.includes(normalizedListingType)) {
        throw new BadRequestError(
          `Category ${template.category_key} does not support listing_type ${normalizedListingType}`,
          'INVALID_CATEGORY_LISTING_TYPE'
        );
      }
    }

    return template;
  }

  static validateCoreListingFields(listing, template) {
    const listingType = String(listing.listing_type || 'SELL').toUpperCase();
    if (!['SELL', 'WANTED'].includes(listingType)) {
      throw new BadRequestError('listing.listing_type must be SELL or WANTED');
    }

    const priceListed = Number(listing.price_listed);
    if (!Number.isFinite(priceListed) || priceListed < 0) {
      throw new BadRequestError('listing.price_listed is required and must be >= 0');
    }

    const inventoryQty = Number(listing.inventory_qty === undefined ? 1 : listing.inventory_qty);
    if (!Number.isInteger(inventoryQty) || inventoryQty < 0) {
      throw new BadRequestError('listing.inventory_qty must be an integer >= 0');
    }

    const description = String(listing.description || '').trim();
    const minDescriptionLength = Number(template.template?.description_min_length || 0);
    if (!description || description.length < Math.max(8, minDescriptionLength)) {
      throw new BadRequestError(
        `listing.description must be at least ${Math.max(8, minDescriptionLength)} characters`,
        'INVALID_DESCRIPTION'
      );
    }

    let minAcceptablePrice = null;
    if (listing.min_acceptable_price !== undefined && listing.min_acceptable_price !== null && listing.min_acceptable_price !== '') {
      minAcceptablePrice = Number(listing.min_acceptable_price);
      if (!Number.isFinite(minAcceptablePrice) || minAcceptablePrice < 0) {
        throw new BadRequestError('listing.min_acceptable_price must be >= 0');
      }
      if (minAcceptablePrice > priceListed) {
        throw new BadRequestError('listing.min_acceptable_price cannot exceed listing.price_listed');
      }
    }

    return {
      listing_type: listingType,
      price_listed: Number(priceListed.toFixed(2)),
      inventory_qty: inventoryQty,
      min_acceptable_price: minAcceptablePrice,
      description,
    };
  }

  static validateAttributes(template, attributes = {}) {
    const sanitized = this.sanitizeAttributes(attributes);
    const validator = this.compileValidator(template);

    const cloned = JSON.parse(JSON.stringify(sanitized));
    const valid = validator(cloned);
    if (!valid) {
      throw new BadRequestError(this.formatAjvErrors(validator.errors), 'INVALID_LISTING_ATTRIBUTES');
    }

    return cloned;
  }

  static async normalizeListingPayload(listing, { existingListing = null } = {}) {
    const listing_type = String(listing?.listing_type || existingListing?.listing_type || 'SELL').toUpperCase();
    const category = String(listing?.category || existingListing?.category || 'general').toLowerCase();
    const template = await this.getTemplate(category, listing_type);

    const merged = {
      ...existingListing,
      ...listing,
      listing_type,
      category,
      description: listing?.description ?? existingListing?.description,
    };

    const core = this.validateCoreListingFields(merged, template);
    const attributes = this.validateAttributes(template, merged.attributes || {});

    const images = Array.isArray(merged.images)
      ? merged.images.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
      : [];

    return {
      normalized: {
        listing_type,
        category,
        condition: String(merged.condition || 'used').toLowerCase(),
        location: merged.location ? String(merged.location).trim() : null,
        images,
        allow_bargain: merged.allow_bargain !== undefined ? Boolean(merged.allow_bargain) : true,
        spec_version: Number(merged.spec_version || template.spec_version || 1),
        attributes,
        ...core,
      },
      template,
    };
  }

  static mapTemplateForClient(template) {
    const formFields = Array.isArray(template.template?.form_fields) ? template.template.form_fields : [];
    return {
      key: template.category_key,
      category: template.category_key,
      display_name: template.display_name,
      listing_types: template.listing_types,
      spec_version: template.spec_version,
      description_min_length: Number(template.template?.description_min_length || 0),
      form_fields: formFields,
      attribute_schema: template.template?.attribute_schema || { type: 'object', properties: {} },
    };
  }

  static async getMetadata({ listingType = null } = {}) {
    const templates = await this.listTemplates({ listingType });
    return templates.map((template) => this.mapTemplateForClient(template));
  }
}

module.exports = CategoryTemplateService;

// validation.js
const Joi = require('joi');

const thingSchema = Joi.object({
    thingName: Joi.string().required(),
    batchId: Joi.string().required(),
    model: Joi.string().required(),
    serialno: Joi.string().required(),
    type: Joi.string().required(),
});

const attributesSchema = Joi.array().items(
    Joi.object({
        attributeName: Joi.string().required(),
        attributeValue: Joi.string().required(),
    })
);

const bodySchema = Joi.object({
    thing: thingSchema,
    attributes: attributesSchema,
});

module.exports = { thingSchema, attributesSchema, bodySchema };

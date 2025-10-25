// models/testimonial.js

const mongoose = require('mongoose');

const TestimonialSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
    approved: { type: Boolean, default: false }, // Depoimentos começam como não aprovados
    createdAt: { type: Date, default: Date.now, index: true }
});

// Padrão de exportação CORRIGIDO para Serverless
module.exports = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);
const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image_url: { type: String, default: '' },
  spotify_link: { type: String, default: '' },
  youtube_link: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Portfolio || mongoose.model('Portfolio', portfolioSchema);
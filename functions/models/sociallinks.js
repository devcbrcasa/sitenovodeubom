const mongoose = require('mongoose');

const socialLinksSchema = new mongoose.Schema({
  instagram: { type: String, default: '' },
  facebook: { type: String, default: '' },
  spotify: { type: String, default: '' },
  youtube: { type: String, default: '' },
});

module.exports = mongoose.models.SocialLinks || mongoose.model('SocialLinks', socialLinksSchema);
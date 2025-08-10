// Validator for webp-loop template
// Expects: { url: string, fit?: 'cover'|'contain', position?: string }
module.exports = function validate(data = {}) {
  if (!data || typeof data !== 'object') return 'data object required';
  if (!data.url || typeof data.url !== 'string') return 'url (string) is required';
  if (!/\.webp(\?|#|$)/i.test(data.url)) return 'url must be a .webp';
  if (data.fit && !['cover', 'contain'].includes(String(data.fit)))
    return 'fit must be "cover" or "contain"';
  if (data.rendering && !['pixelated', 'auto', ''].includes(String(data.rendering).toLowerCase())) {
    return 'rendering must be "pixelated" or "auto"';
  }
  if (data.pixelated != null && typeof data.pixelated !== 'boolean')
    return 'pixelated must be boolean';
  return true;
};

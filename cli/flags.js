// Shared flags and reserved names for CLI and tests

// Tokens that should be excluded from template data parsing
// Keep tokens as they appear on the command line
const EXCLUDED_DATA_FLAGS = new Set([
  '--data',
  '--data-file',
  '--server',
  '--timeout',
  '--quiet',
  '--help',
  '-h'
]);

// Reserved parameter names that templates must not use
// These are names (no leading dashes), include both hyphen and camel variants where applicable
const RESERVED_PARAM_NAMES = new Set([
  'data',
  'data-file',
  'dataFile',
  'server',
  'timeout',
  'quiet',
  'help',
  'h'
]);

module.exports = { EXCLUDED_DATA_FLAGS, RESERVED_PARAM_NAMES };

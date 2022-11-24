if (process.env.NODE_ENV !== 'production') {
  module.exports = require('./development');
} else {
  exports.attach = () => {};
  exports.update = () => {};
  exports.esModule = true;
}

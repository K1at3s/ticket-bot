module.exports = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (message, error) => console.error(message, error?.name || ''),
};

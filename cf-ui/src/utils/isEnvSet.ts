export default (env?: unknown): boolean => {
  if (typeof env === 'undefined' || env === null) return false;
  if (typeof env === 'string') return env.trim().length > 0 && env !== 'undefined';
  return true;
};

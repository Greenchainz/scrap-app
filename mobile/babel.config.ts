module.exports = function (api: { cache: (arg: boolean) => void }) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

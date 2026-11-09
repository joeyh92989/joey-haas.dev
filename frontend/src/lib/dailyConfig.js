/**
 * The daily puzzle's build-time salt. `vite.config.js` refuses to build
 * without `VITE_DAILY_SALT`, so a shipped bundle always has the real one;
 * dev and test fall back to a fixed word. It is a parameter to lib/daily.js,
 * read here and nowhere else, so that module stays free of `import.meta`.
 */
export const DAILY_SALT = import.meta.env.VITE_DAILY_SALT || 'dev'

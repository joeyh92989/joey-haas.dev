/**
 * Preloads the body fonts so the browser fetches them with the HTML instead of
 * after the CSS parses. The woff2 names are content-hashed by Vite, so the
 * links are written from the built bundle, not typed into index.html.
 *
 * Inter 400 and 500 set nearly all text. The serif sets two headlines and the
 * mono labels and dates, so neither is worth a request on every page.
 */
export const PRELOADED_FONTS = [
  /^inter-latin-400-normal-.+\.woff2$/,
  /^inter-latin-500-normal-.+\.woff2$/,
]

/**
 * @param {string[]} fileNames Emitted asset paths, e.g. `assets/inter-...woff2`.
 * @param {string} base Vite's `base`, ending in a slash.
 * @returns {string[]} One `<link>` tag per matching font, in PRELOADED_FONTS order.
 */
export function fontPreloadTags(fileNames, base = '/') {
  return PRELOADED_FONTS.flatMap((pattern) =>
    fileNames
      .filter((name) => pattern.test(name.split('/').pop()))
      .map(
        (name) =>
          `<link rel="preload" as="font" type="font/woff2" href="${base}${name}" crossorigin>`,
      ),
  )
}

export default function fontPreload() {
  let base = '/'
  return {
    name: 'font-preload',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const tags = fontPreloadTags(Object.keys(ctx.bundle), base)
        if (tags.length === 0) return html
        return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
      },
    },
  }
}

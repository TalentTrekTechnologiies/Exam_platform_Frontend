// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Read as a function of the mode so the .env files are actually loaded.
 *
 * Vite reads .env.production into `import.meta.env` for the CLIENT bundle, but
 * this config file runs in Node beforehand and sees only the real process
 * environment — a variable set in .env.production is invisible here unless it
 * is loaded deliberately.
 *
 * That gap cost a deployment. `.env.ksrm.example` documents copying itself to
 * .env.production before building, and doing exactly that produced a bundle
 * whose base path was still "/" — so every asset was requested at /assets/…
 * instead of /online/assets/…, the host college site answered those URLs with
 * its own HTML, and the exam platform came up as a blank white screen with no
 * error anywhere. The API was fine, the files were on disk, the config looked
 * right. Loading the env here is what makes the documented step true.
 *
 * The third argument is an empty prefix so VITE_-prefixed and unprefixed
 * variables alike are read; process.env still wins, which keeps
 * `VITE_BASE_PATH=/online/ npm run build` working for anyone who scripts it
 * that way.
 */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }

  // What this installation calls itself. The same value the app uses at
  // runtime, applied to index.html too so the browser tab matches the screen —
  // a candidate should not see one institution's name in the tab and another
  // on the page. The fallback is deliberately generic rather than any one
  // college.
  const platformName = env.VITE_PLATFORM_NAME || 'Examination Portal'

  // Where this build will be served from. Defaults to the root, which is what
  // local dev and a standalone domain both want. Set VITE_BASE_PATH=/online/
  // to serve it under a subpath of an existing site — every asset URL and the
  // router's basename derive from this, so getting it from one place is what
  // stops half the app 404ing while the other half works.
  const base = env.VITE_BASE_PATH || '/'

  // Said out loud at build time. A base path is the one setting whose mistakes
  // are invisible until the page is blank in production, so it should never
  // have to be inferred from the output.
  if (mode === 'production') {
    console.log(`\n  building for "${base}"  ·  ${platformName}\n`)
  }

  return {
    plugins: [
      react(),
      {
        // index.html is served as a static file, so it never sees the runtime
        // env the app reads. This substitutes at build time instead.
        name: 'brand-index-html',
        transformIndexHtml(html) {
          return html.replaceAll('__PLATFORM_NAME__', platformName)
        },
      },
    ],

    base,

    server: {
      // 5174, not 3000: the KSRM CMS dev server owns 3000, and the two need to
      // run side by side while integrating. Whatever this is, CORS_ORIGINS on
      // the exam backend must list it or every request is blocked in the
      // browser.
      port: 5174,
    },
  }
})

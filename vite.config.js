// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// What this installation calls itself. The same value the app uses at runtime,
// applied to index.html too so the browser tab matches the screen — a
// candidate should not see one institution's name in the tab and another on
// the page. The fallback is deliberately generic rather than any one college.
const platformName = process.env.VITE_PLATFORM_NAME || 'Examination Portal'

export default defineConfig({
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

  // Where this build will be served from. Defaults to the root, which is what
  // local dev and a standalone domain both want. Set VITE_BASE_PATH=/online/
  // to serve it under a subpath of an existing site — every asset URL and the
  // router's basename derive from this, so getting it from one place is what
  // stops half the app 404ing while the other half works.
  base: process.env.VITE_BASE_PATH || '/',

  server: {
    // 5174, not 3000: the KSRM CMS dev server owns 3000, and the two need to run
    // side by side while integrating. Whatever this is, CORS_ORIGINS on the exam
    // backend must list it or every request is blocked in the browser.
    port: 5174,
  },
})
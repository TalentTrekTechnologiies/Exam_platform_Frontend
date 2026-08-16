// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

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
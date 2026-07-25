// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 5174, not 3000: the KSRM CMS dev server owns 3000, and the two need to run
    // side by side while integrating. Whatever this is, CORS_ORIGINS on the exam
    // backend must list it or every request is blocked in the browser.
    port: 5174,
  },
})
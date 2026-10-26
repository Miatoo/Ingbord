import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// SPDX-License-Identifier: CC-BY-NC-SA-4.0
// GitHub Pages project site: https://miatoo.github.io/Ingbord/
// Use absolute base so assets resolve even without a trailing slash.
const pagesBase = process.env.VITE_BASE || '/Ingbord/'

// https://vitejs.dev/config/
export default defineConfig({
  base: pagesBase,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})

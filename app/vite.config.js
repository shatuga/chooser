import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const version = process.env.CHOOSER_VERSION ?? "v1";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],

  // In dev mode, use root path; in production builds, use versioned path
  base: process.env.NODE_ENV === 'production' ? `/a/${version}/` : '/',

  build: {
    outDir: `../site/a/${version}`,
    emptyOutDir: false,
  },

  // Make API version available to the app
  define: {
    'import.meta.env.VITE_API_VERSION': JSON.stringify(version),
  },
})

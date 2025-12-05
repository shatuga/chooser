import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const version = process.env.CHOOSER_VERSION ?? "v1";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: `/a/${version}/`,
  build: {
    outDir: `../site/a/${version}`,
    emptyOutDir: false,
  },
})

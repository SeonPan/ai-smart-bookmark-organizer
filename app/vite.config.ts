import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    crx({ manifest })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: 'index.html',
        options: 'options.html'
      }
    }
  }
});

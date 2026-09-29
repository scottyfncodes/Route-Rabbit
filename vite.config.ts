import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Vercel serves from the domain root; GitHub Pages serves from /Route-Rabbit/.
  base: process.env.VERCEL ? '/' : '/Route-Rabbit/',
  plugins: [react(), tailwindcss()],
})

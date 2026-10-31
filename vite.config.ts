import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Vercel (https://route-rabbit.vercel.app) is the only production home and serves from the domain root.
  base: '/',
  plugins: [react(), tailwindcss()],
})

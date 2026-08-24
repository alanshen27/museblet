import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' so the built index.html works from the filesystem (Max jweb)
export default defineConfig({
  plugins: [react()],
  base: './',
})

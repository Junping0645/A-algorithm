import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포 시 VITE_BASE_PATH = 레포 이름으로 설정됨 (Actions에서 주입)
const base = process.env.VITE_BASE_PATH ? `/${process.env.VITE_BASE_PATH}/` : '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})

/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 部署在子路径下，构建产物需带 repo 名前缀
  // 开发模式下 Vite dev server 仍从 / 提供服务，不受影响
  base: '/endfield-industry-algorithm/',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    globals: true,
  },
})

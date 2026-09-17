import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Claude Code's scratch worktrees are full checkouts nested at .claude/, so
    // without this vitest discovers each test file twice — once here and once in
    // the worktree — and every count is inflated.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})

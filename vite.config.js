import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the built assets resolve when loaded from the
  // native WebView (Capacitor serves from a local scheme, not '/').
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});

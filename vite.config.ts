import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Enable HTTPS only when explicitly requested (e.g. `HTTPS=true npm run dev`).
// This is needed for mobile dev testing over a local IP, because browsers block
// the Geolocation API outside a secure context. It stays OFF by default so the
// hosted preview (which proxies over HTTP) keeps working.
const useHttps = process.env.HTTPS === 'true';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    https: useHttps,
    allowedHosts: ['.vercel.run'],
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

function resolveLocalHttpsCertificatePair() {
  const workingDirectory = process.cwd();
  const directoryEntries = fs.readdirSync(workingDirectory);
  const keyFileName = directoryEntries.find((entryName) => /^localhost\+\d+-key\.pem$/.test(entryName));
  if (!keyFileName) {
    return null;
  }

  const certFileName = keyFileName.replace(/-key\.pem$/, '.pem');
  if (!directoryEntries.includes(certFileName)) {
    return null;
  }

  return {
    keyPath: path.resolve(workingDirectory, keyFileName),
    certPath: path.resolve(workingDirectory, certFileName)
  };
}

const localHttpsCertificatePair = resolveLocalHttpsCertificatePair();

// The VitePWA plugin automatically generates the web app manifest and injects service worker registration.
// We configure it to automatically update the service worker when new code is deployed.
export default defineConfig({
  server: {
    // Use mkcert-generated local certs when available so `npm run dev` serves HTTPS.
    https: localHttpsCertificatePair
      ? {
          key: fs.readFileSync(localHttpsCertificatePair.keyPath),
          cert: fs.readFileSync(localHttpsCertificatePair.certPath)
        }
      : undefined,
    proxy: {
      '/api/vndb': {
        target: 'https://api.vndb.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vndb/, '/kana')
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The workbox configuration dictates our caching strategy. 
      // Caching static assets ensures the shell of the app loads instantly, mimicking a native app.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'My VNDB',
        short_name: 'My VNDB',
        description: 'A standalone interface for querying the Visual Novel Database.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone', // This instructs the OS to hide the browser UI (URL bar, navigation).
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Maskable icons ensure the OS can crop the image to fit its native shape (e.g., iOS squircle, Android circle).
          }
        ]
      }
    })
  ]
});

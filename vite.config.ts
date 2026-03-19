import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repoName = 'Dice-Placement-Prototype';
const isGitHubActionsBuild = process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  base: isGitHubActionsBuild ? `/${repoName}/` : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Dice Placement Prototype',
        short_name: 'DicePlace',
        description: 'Mobile-first dice-placement idle RPG prototype.',
        theme_color: '#151522',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});

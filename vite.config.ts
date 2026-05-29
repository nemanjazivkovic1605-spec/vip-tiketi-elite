import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

const dailySportsDevApi = (apiKey: string): Plugin => ({
  name: 'daily-sports-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/fetch-daily-sports', async (request, response) => {
      try {
        if (!apiKey) {
          response.statusCode = 502;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: 'API_FOOTBALL_KEY is not configured.' }));
          return;
        }

        const requestUrl = new URL(request.url || '/', 'http://localhost');
        const sport = requestUrl.searchParams.get('sport') === 'basketball' ? 'basketball' : 'football';
        const date = requestUrl.searchParams.get('date') || '';
        const timezone = requestUrl.searchParams.get('timezone') || 'Europe/Belgrade';

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          response.statusCode = 400;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: 'Valid date is required.' }));
          return;
        }

        const baseUrl = sport === 'basketball'
          ? 'https://v1.basketball.api-sports.io/games'
          : 'https://v3.football.api-sports.io/fixtures';
        const apiUrl = new URL(baseUrl);
        apiUrl.searchParams.set('date', date);
        apiUrl.searchParams.set('timezone', timezone);

        const apiResponse = await fetch(apiUrl, { headers: { 'x-apisports-key': apiKey } });
        const payload = await apiResponse.text();
        response.statusCode = apiResponse.status;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(payload);
      } catch (error) {
        response.statusCode = 502;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Daily sports dev request failed.' }));
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiFootballKey = env.API_FOOTBALL_KEY || env.VITE_FOOTBALL_API_KEY || '';

  return {
    plugins: [dailySportsDevApi(apiFootballKey), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase')) return 'firebase-vendor';
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'react-vendor';
            if (id.includes('node_modules/recharts')) return 'charts-vendor';
            if (id.includes('node_modules/motion')) return 'motion-vendor';
          },
        },
      },
    },
  };
});

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

const serverApis = (): Plugin => ({
  name: 'server-apis',
  configureServer(server) {
    const routes: Record<string, string> = {
      '/api/fetch-daily-sports': '/api/fetch-daily-sports.ts',
      '/api/football-data': '/api/football-data.ts',
      '/api/daily-picks': '/api/daily-picks.ts',
      '/api/daily-results': '/api/daily-results.ts',
      '/api/pitch-matches': '/api/pitch-matches.ts',
    };
    server.middlewares.use(async (request, response, next) => {
      const route = routes[new URL(request.url || '/', 'http://localhost').pathname];
      if (!route) return next();
      try {
        const module = await server.ssrLoadModule(route);
        await module.default(request, response);
      } catch {
        response.statusCode = 502;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: 'Sportski API trenutno nije dostupan.' }));
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }

  return {
    plugins: [serverApis(), react(), tailwindcss()],
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

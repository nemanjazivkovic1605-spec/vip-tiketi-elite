import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import { publicFootballRoute } from './server/publicFootball/routes';

const serverApis = (): Plugin => ({
  name: 'server-apis',
  configureServer(server) {
    const routes: Record<string, string> = {
      '/api/fetch-daily-sports': '/api/fetch-daily-sports.ts',
      '/api/football-data': '/api/football-providers.ts',
      '/api/pitch-matches': '/api/football-providers.ts',
      '/api/fetch-fixture-result': '/api/football-providers.ts',
      '/api/football-providers': '/api/football-providers.ts',
      '/api/world-cup-seed': '/api/world-cup.ts',
      '/api/world-cup-results': '/api/world-cup.ts',
      '/api/world-cup': '/api/world-cup.ts',
      '/api/generate-daily-analysis': '/api/generate-daily-analysis.ts',
      '/api/resend-email': '/api/resend-email.ts',
      '/api/daily-picks': '/api/daily-picks.ts',
      '/api/daily-results': '/api/daily-results.ts',
      '/api/ticket-purchases': '/api/ticket-purchases.ts',
      '/api/football-analytics': '/api/football-analytics.ts',
    };
    server.middlewares.use(async (request, response, next) => {
      const publicUrl = new URL(request.url || '/', 'http://localhost');
      const page = publicFootballRoute(publicUrl.pathname);
      if(page || publicUrl.pathname === '/api/public-football') {
        if(page) for(const [key,value] of Object.entries(page)) publicUrl.searchParams.set(key,value);
        request.url = `/api/public-football?${publicUrl.searchParams}`;
        try { const module = await server.ssrLoadModule('/server/publicFootball/http.ts'); await module.default(request, response); }
        catch { response.statusCode = 503; response.end('Javni fudbalski pregled trenutno nije dostupan.'); }
        return;
      }
      const route = routes[new URL(request.url || '/', 'http://localhost').pathname];
      if (!route) {
        if (publicUrl.pathname !== '/api' && !publicUrl.pathname.startsWith('/api/')) return next();
        response.statusCode = 404;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: 'API route not found.' }));
        return;
      }
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

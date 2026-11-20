import { createApiDispatcher } from '../server/http/apiDispatcher.js';

export default createApiDispatcher({
  endpoint: '/api/world-cup',
  aliases: { '/api/world-cup-seed': 'seed', '/api/world-cup-results': 'results' },
  handlers: {
    seed: () => import('../server/worldCup/seedHandler.js'),
    results: () => import('../server/worldCup/resultsHandler.js'),
  },
});

import { createApiDispatcher } from '../server/http/apiDispatcher.js';

export default createApiDispatcher({
  endpoint: '/api/football-providers',
  aliases: {
    '/api/football-data': 'football-data',
    '/api/pitch-matches': 'pitch-matches',
    '/api/fetch-fixture-result': 'fetch-fixture-result',
  },
  handlers: {
    'football-data': () => import('../server/footballProviders/footballDataHandler.js'),
    'pitch-matches': () => import('../server/footballProviders/pitchMatchesHandler.js'),
    'fetch-fixture-result': () => import('../server/footballProviders/fixtureResultHandler.js'),
  },
});

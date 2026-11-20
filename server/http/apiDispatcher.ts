import type { IncomingMessage, ServerResponse } from 'node:http';

export type ApiHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
type HandlerModule = { default: ApiHandler };

export function createApiDispatcher<Operation extends string>(options: {
  endpoint: string;
  aliases: Record<string, Operation>;
  handlers: Record<Operation, () => Promise<HandlerModule>>;
}): ApiHandler {
  return async (request, response) => {
    const url = new URL(request.url || '/', 'https://eliteviptips.com');
    // A legacy URL always retains its original operation, even if it has an action query.
    const legacyOperation = options.aliases[url.pathname];
    const actions = url.searchParams.getAll('action');
    const operation = legacyOperation || (actions.length === 1 ? actions[0] : undefined);
    if (!legacyOperation && url.pathname !== options.endpoint) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'API route not found.' }));
      return;
    }
    if (!operation || !Object.hasOwn(options.handlers, operation)) {
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ error: 'Unknown or ambiguous API action.' }));
      return;
    }
    const handler = await options.handlers[operation as Operation]();
    // Do not consume or reconstruct the request: auth headers, body and query stay intact.
    await handler.default(request, response);
  };
}

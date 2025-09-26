import { createServer, type Server } from 'node:http';

export interface HealthServerOptions {
  port?: number;
  host?: string;
}

export function startHealthServer(options: HealthServerOptions = {}): Server {
  const fallbackPort = Number.parseInt(process.env.PORT ?? '3000', 10);
  const port = options.port ?? (Number.isFinite(fallbackPort) ? fallbackPort : 3000);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && (path === '/' || path === '/healthz' || path === '/ready')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  server.on('error', (error) => {
    console.error('Health check server error:', error);
  });

  server.listen(port, host, () => {
    console.log('Health check server listening on http://' + host + ':' + port);
  });

  return server;
}

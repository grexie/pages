import { IncomingMessage, ServerResponse } from 'http';
import { parseURL } from 'whatwg-url';
import { Renderer } from '../builder/Renderer';
import { ServerContext } from './Server';
import _path from 'path';

export class RequestHandler {
  readonly context: ServerContext;
  renderer: Renderer;

  constructor(context: ServerContext) {
    this.context = context;
    this.renderer = new Renderer(context);
  }

  handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = parseURL(req.url!, { baseURL: '///' })!;
    const path = parseURL(req.url!, { baseURL: '///' })!.path!.filter(p => !!p);

    if (!/\./.test(path[path.length - 1])) {
      if ([...path, ''].join('/') !== url.path!.join('/')) {
        res.statusCode = 302;
        res.setHeader('Location', ['', ...path, ''].join('/'));
        res.end();
        return;
      }

      path.push('index.html');
    }

    try {
      res.setHeader('Content-Type', 'text/html; encoding=utf8');
      const buffer = await this.context.builder.output({
        filename: _path.join(...path),
      });

      res.write(buffer);
      res.end();
    } catch (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.write('404 Not Found');
      res.end();
      return;
    }
  };
}

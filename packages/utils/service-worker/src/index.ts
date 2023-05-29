/// <reference no-default-lib="true" />
/// <reference lib="ES2022" />
/// <reference lib="WebWorker" />
/// <reference types="./service-worker.js" />

import { createResolver } from '@grexie/resolvable';

interface Manifest {
  files: string[];
  external: string[];
}

const sw = self as unknown as ServiceWorkerGlobalScope;

const cacheName = 'grexie-cloud-v1.0.0';

const getCachePaths = async (cache: Cache): Promise<string[]> => {
  const origin = new URL(location.href);
  origin.pathname = '/';
  origin.search = '';

  const keys = await cache.keys(origin);
  let out: string[] = [];
  for (const key of keys) {
    const r = key;
    let pathname: string;
    if (typeof key === 'string') {
      out.push(new URL(key, location.href).pathname);
    } else {
      out.push(new URL(r.url, location.href).pathname);
    }
  }
  return out;
};

const manifestPromises: Record<string, Promise<Response>> = {};

sw.addEventListener(
  'install',
  (event: ExtendableEvent) => {
    console.info('installing...');

    event.waitUntil(
      (async () => {
        const cache = await caches.open(cacheName);
        let files: string[];
        try {
          const response = await fetch('/assets/site-manifest.json');
          manifest.resolve(response.json());
          files = (await manifest).files;
        } catch (err) {
          files = [];
        }

        const keys = await getCachePaths(cache);

        for (const key of keys) {
          if (files.includes(key)) {
            files.splice(files.indexOf(key), 1);
          }
        }

        const toDelete = new Set(keys);

        for (const key of keys) {
          if (files.includes(key)) {
            toDelete.delete(key);
          }
        }

        for (const key of toDelete) {
          console.info('deleting', key);
          cache.delete(new URL(key, location.href));
        }

        setTimeout(() => {
          if (self.navigator.onLine) {
            console.info('caching', files.length, 'files', files);

            Promise.all(
              files.map(async file => {
                const url = new URL(file, location.href).toString();
                const resolver = createResolver<Response>();
                manifestPromises[url] = resolver;

                try {
                  const previousResponse = await cache.match(url);

                  if (previousResponse?.headers.get('etag')) {
                    const headResponse = await fetch(url, {
                      method: 'HEAD',
                    });

                    if (
                      previousResponse.headers.get('etag') ===
                      headResponse.headers.get('etag')
                    ) {
                      resolver.resolve(previousResponse);
                      delete manifestPromises[url];
                      return;
                    }
                  }

                  console.info('fetching', url);
                  const response = await fetch(url);
                  await cache.put(url, response);

                  resolver.resolve(response);
                  delete manifestPromises[url];
                } catch (err) {
                  console.error(url, err);
                }
              })
            )
              .then(() =>
                console.info('load complete', files.length, 'files', files)
              )
              .catch(err => console.error(err));
          }
        }, 5000);

        console.info('installed');
      })()
    );
  },
  false
);

sw.addEventListener('activate', function (event) {
  return sw.clients.claim();
});

function cleanResponse(response: Response) {
  if (response.type === 'opaque' || response.type === 'opaqueredirect') {
    return response;
  }

  const clonedResponse = response.clone();

  // Not all browsers support the Response.body stream, so fall back to reading
  // the entire body into memory as a blob.
  const bodyPromise =
    'body' in clonedResponse
      ? Promise.resolve(clonedResponse.body)
      : (clonedResponse as any).blob();

  return bodyPromise.then(async (body: Response['body']) => {
    // new Response() is happy when passed either a stream or a Blob.
    const headers = {} as any;
    for (const header in clonedResponse.headers.keys()) {
      headers[header] = clonedResponse.headers.get(header);
    }
    delete headers['X-Frame-Options'];
    delete headers['X-Content-Type-Options'];

    return new Response(body, {
      headers: clonedResponse.headers,
      status: clonedResponse.status,
      statusText: clonedResponse.statusText,
    });
  });
}

const manifest = createResolver<Manifest>();

sw.onfetch = (event: FetchEvent) => {
  const url = new URL(event.request.url);

  event.waitUntil(
    (async () => {
      const external = (await manifest).external.map(
        x => new URL(x, self.location.href)
      );

      if (
        url.host !== self.location.host ||
        url.protocol !== self.location.protocol ||
        event.request.method !== 'GET'
      ) {
        if (
          event.request.method !== 'GET' ||
          url.toString() === new URL('/sw.js', self.location.href).toString() ||
          !external.reduce(
            (a, b) => a || (b.host === url.host && b.protocol === url.protocol),
            false
          )
        ) {
          if (event.request.method === 'GET') {
            console.info('refusing to cache', url.toString());
          }
          return;
        }
      }

      event.respondWith(
        (async () => {
          let request: URL | Request = event.request;

          if (request.mode === 'navigate' && request.method === 'GET') {
            if (request.headers.get('accept')?.includes('text/html')) {
              if (!url.pathname.endsWith('/')) {
                url.pathname += '/';
              }
              request = new Request(url, {
                headers: request.headers,
                method: request.method,
              });
            }
          }

          try {
            const previousResponse = await (manifestPromises[request.url] ??
              caches.match(request).catch(() => {}));

            if (!previousResponse && !self.navigator.onLine) {
              request = new Request('/offline/');
              return caches.match(request);
            }

            if (
              self.navigator.onLine &&
              previousResponse?.headers.get('etag')
            ) {
              const headResponse = await fetch(previousResponse.url, {
                method: 'HEAD',
              });
              if (
                previousResponse.headers.get('etag') ===
                headResponse.headers.get('etag')
              ) {
                return cleanResponse(previousResponse);
              }
            }

            if (self.navigator.onLine) {
              console.info('fetching', request.url);
              const response = await fetch(request);

              if (response.ok) {
                const cache = await caches.open(cacheName);
                await cache.put(request, response.clone());
              }

              return cleanResponse(response);
            } else {
              return cleanResponse(previousResponse);
            }
          } catch (err) {
            console.error(err);
            const r = await caches.match(request);

            if (r) {
              return cleanResponse(r);
            } else {
              if (
                event.request.mode === 'navigate' &&
                request.method === 'GET'
              ) {
                if (request.headers.get('accept')?.includes('text/html')) {
                  const notFound = await caches.match(
                    new URL('/404.html', event.request.url)
                  );

                  if (notFound) {
                    return cleanResponse(notFound);
                  }
                }
              }
            }

            throw err;
          }
        })()
      );
    })()
  );
};

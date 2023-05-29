/// <reference no-default-lib="true" />
/// <reference lib="ES2022" />
/// <reference lib="dom" />

import { createContext } from '@grexie/context';
import { useMemo } from 'react';

export class ServiceWorker {
  readonly registration?: Promise<ServiceWorkerRegistration>;

  constructor() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      if (
        process.env.NODE_ENV !== 'production' ||
        localStorage.getItem('disable-service-worker')
      ) {
        navigator.serviceWorker
          .getRegistration('/sw.js')
          .then(registration => registration?.unregister())
          .catch(() => {});
        return;
      }

      this.registration = navigator.serviceWorker.register('/sw.js');
    }
  }
}

export const {
  Provider: ServiceWorkerProvider,
  with: withServiceWorker,
  use: useServiceWorker,
} = createContext<ServiceWorker>(
  'ServiceWorker',
  Provider =>
    ({ children }) => {
      const existingWorker = useServiceWorker();

      if (existingWorker) {
        return <>{children}</>;
      }

      const worker = useMemo(() => new ServiceWorker(), []);
      return <Provider value={worker}>{children}</Provider>;
    }
);

export default ServiceWorkerProvider;

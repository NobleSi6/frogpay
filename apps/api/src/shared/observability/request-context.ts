import { AsyncLocalStorage } from 'node:async_hooks';

const requestIdStorage = new AsyncLocalStorage<string>();

export function runWithRequestId<T>(requestId: string, callback: () => T): T {
  return requestIdStorage.run(requestId, callback);
}

export function runWithOptionalRequestId<T>(
  requestId: string | undefined,
  callback: () => T,
): T {
  return requestId ? runWithRequestId(requestId, callback) : callback();
}

export function currentRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

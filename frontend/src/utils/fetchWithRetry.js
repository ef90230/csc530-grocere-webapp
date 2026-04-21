const waitFor = (delayMs, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }

  const timerId = window.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, delayMs);

  const onAbort = () => {
    window.clearTimeout(timerId);
    reject(new DOMException('Aborted', 'AbortError'));
  };

  signal?.addEventListener('abort', onAbort, { once: true });
});

export const isRetryableNetworkError = (error) => {
  if (!error) {
    return false;
  }

  // Browser fetch network failures (including connection refused) bubble as TypeError.
  return error.name === 'TypeError';
};

export const fetchWithRetry = async (
  resource,
  init = {},
  {
    retries = 3,
    baseDelayMs = 350,
    retryOnHttp = false
  } = {}
) => {
  let attempt = 0;

  while (attempt <= retries) {
    try {
      const response = await fetch(resource, init);

      if (!retryOnHttp || response.ok || attempt === retries) {
        return response;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }

      if (!isRetryableNetworkError(error) || attempt === retries) {
        throw error;
      }
    }

    const backoffMs = baseDelayMs * (attempt + 1);
    await waitFor(backoffMs, init?.signal);
    attempt += 1;
  }

  return fetch(resource, init);
};

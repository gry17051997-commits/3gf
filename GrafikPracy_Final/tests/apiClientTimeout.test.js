import test from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_API_URL = 'https://example.test';

async function withMocks(run, { getItem, fetchImpl, timeoutSpy = false } = {}) {
  const storage = await import('@react-native-async-storage/async-storage');
  const original = {
    getItem: storage.default.getItem,
    fetch: global.fetch,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout
  };
  const created = [];
  const cleared = [];
  try {
    if (getItem) storage.default.getItem = getItem;
    if (fetchImpl) global.fetch = fetchImpl;
    if (timeoutSpy) {
      global.setTimeout = (...args) => {
        const id = original.setTimeout(...args);
        created.push(id);
        return id;
      };
      global.clearTimeout = (id) => {
        cleared.push(id);
        return original.clearTimeout(id);
      };
    }
    const client = await import('../apiClient.js');
    return await run({ ...client, created, cleared });
  } finally {
    global.fetch = original.fetch;
    global.setTimeout = original.setTimeout;
    global.clearTimeout = original.clearTimeout;
    storage.default.getItem = original.getItem;
  }
}

test('api() times out while awaiting token read and clears its timer', async () => {
  await withMocks(async ({ api, created, cleared }) => {
    await assert.rejects(() => api('/me', { timeoutMs: 15 }), error => {
      assert.equal(error.code, 'API_TIMEOUT');
      assert.equal(error.status, 408);
      return true;
    });
    assert.equal(created.length, 1);
    assert.deepEqual(cleared, [created[0]]);
  }, {
    getItem: () => new Promise(() => {}),
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    timeoutSpy: true
  });
});

test('api() times out while waiting for fetch response', async () => {
  await withMocks(async ({ api }) => {
    await assert.rejects(() => api('/me', { timeoutMs: 15 }), error => {
      assert.equal(error.code, 'API_TIMEOUT');
      assert.equal(error.status, 408);
      return true;
    });
  }, {
    getItem: async () => 'token',
    fetchImpl: () => new Promise(() => {})
  });
});

test('api() times out while reading JSON response body', async () => {
  await withMocks(async ({ api }) => {
    await assert.rejects(() => api('/me', { timeoutMs: 15 }), error => {
      assert.equal(error.code, 'API_TIMEOUT');
      assert.equal(error.status, 408);
      return true;
    });
  }, {
    getItem: async () => 'token',
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) })
  });
});

test('api() preserves HTTP 401 error status and code', async () => {
  await withMocks(async ({ api }) => {
    await assert.rejects(() => api('/auth/login', {
      method: 'POST', body: { email: 'a@b.com', password: 'x' }
    }), error => {
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      assert.equal(error.status, 401);
      return true;
    });
  }, {
    getItem: async () => null,
    fetchImpl: async () => ({
      ok: false, status: 401, json: async () => ({ error: 'INVALID_CREDENTIALS' })
    })
  });
});

test('api() preserves HTTP 500 status and code', async () => {
  await withMocks(async ({ api }) => {
    await assert.rejects(() => api('/me'), error => {
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.status, 500);
      return true;
    });
  }, {
    getItem: async () => null,
    fetchImpl: async () => ({
      ok: false, status: 500, json: async () => ({ error: 'INTERNAL_ERROR' })
    })
  });
});

test('api() maps an obvious network TypeError to NETWORK_ERROR', async () => {
  await withMocks(async ({ api }) => {
    await assert.rejects(() => api('/me'), error => {
      assert.equal(error.code, 'NETWORK_ERROR');
      assert.equal(error.status, 0);
      return true;
    });
  }, {
    getItem: async () => null,
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
  });
});

test('api() does not map an unrelated TypeError to NETWORK_ERROR', async () => {
  await withMocks(async ({ api }) => {
    await assert.rejects(() => api('/me'), error => {
      assert.equal(error.message, 'Unexpected local type error');
      assert.equal(error.code, undefined);
      return true;
    });
  }, {
    getItem: async () => null,
    fetchImpl: async () => { throw new TypeError('Unexpected local type error'); }
  });
});

test('api() preserves Authorization header and request body', async () => {
  let seen;
  await withMocks(async ({ api }) => {
    await api('/auth/login', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'secret' }
    });
    assert.equal(seen.url, 'https://example.test/api/auth/login');
    assert.equal(seen.options.headers.Authorization, 'Bearer abc-token');
    assert.equal(seen.options.headers['Content-Type'], 'application/json');
    assert.equal(seen.options.body, JSON.stringify({ email: 'test@example.com', password: 'secret' }));
  }, {
    getItem: async () => 'abc-token',
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });
});

test('api() clears its timer on success', async () => {
  await withMocks(async ({ api, created, cleared }) => {
    assert.deepEqual(await api('/me', { timeoutMs: 1000 }), { ok: true });
    assert.equal(created.length, 1);
    assert.deepEqual(cleared, [created[0]]);
  }, {
    getItem: async () => 'token',
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    timeoutSpy: true
  });
});

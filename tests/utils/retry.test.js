const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withRetry } = require('../../utils/retry');

describe('withRetry', () => {
  it('returns value immediately on first success', async () => {
    const result = await withRetry(async () => 42);
    assert.equal(result, 42);
  });

  it('retries on failure and returns value on eventual success', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('throws after exhausting all attempts', async () => {
    let calls = 0;
    await assert.rejects(
      () => withRetry(async () => { calls++; throw new Error('always fails'); }, { maxAttempts: 3, baseDelayMs: 1 }),
      /always fails/,
    );
    assert.equal(calls, 3);
  });

  it('rethrows immediately when isRetryable returns false', async () => {
    let calls = 0;
    const err = new Error('permanent');
    err.permanent = true;
    await assert.rejects(
      () => withRetry(
        async () => { calls++; throw err; },
        { maxAttempts: 3, baseDelayMs: 1, isRetryable: e => !e.permanent },
      ),
      /permanent/,
    );
    assert.equal(calls, 1);  // no retries
  });

  it('passes attempt number to fn', async () => {
    const attempts = [];
    await withRetry(
      async (attempt) => {
        attempts.push(attempt);
        if (attempt < 3) throw new Error('fail');
        return 'done';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    assert.deepEqual(attempts, [1, 2, 3]);
  });

  it('calls onRetry before each sleep', async () => {
    const retries = [];
    await withRetry(
      async (attempt) => { if (attempt < 3) throw new Error('x'); return 'ok'; },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        onRetry: (err, attempt, delayMs) => retries.push({ attempt, delayMs }),
      },
    );
    assert.equal(retries.length, 2);
    assert.equal(retries[0].attempt, 1);
    assert.equal(retries[1].attempt, 2);
  });

  it('uses exponential backoff by default', async () => {
    const delays = [];
    await withRetry(
      async (attempt) => { if (attempt < 4) throw new Error('x'); return 'ok'; },
      {
        maxAttempts: 4,
        baseDelayMs: 100,
        onRetry: (_err, _attempt, delayMs) => delays.push(delayMs),
      },
    );
    // exponential: 100, 200, 400
    assert.deepEqual(delays, [100, 200, 400]);
  });

  it('uses custom getDelay when provided', async () => {
    const delays = [];
    await withRetry(
      async (attempt) => { if (attempt < 3) throw new Error('x'); return 'ok'; },
      {
        maxAttempts: 3,
        baseDelayMs: 100,
        getDelay: (_err, attempt, _base) => attempt * 50,
        onRetry: (_err, _attempt, delayMs) => delays.push(delayMs),
      },
    );
    assert.deepEqual(delays, [50, 100]);
  });
});

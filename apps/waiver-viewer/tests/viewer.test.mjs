import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAGE_SIZE,
  UNAVAILABLE_MESSAGE,
  ViewerRequestError,
  buildWaiverDocumentsQuery,
  mapViewerError,
  queryForSort,
  viewerFetch,
} from '../src/lib/viewer-api.ts';
import { completenessFlags, filterLoadedPage } from '../src/lib/waiver-record.ts';

test('list query sends sort, order, limit, offset, and dates only when set', () => {
  const recent = queryForSort('recent', 0);
  const recentParams = new URL(`http://local${recent}`).searchParams;
  assert.equal(recentParams.get('sort'), 'signed_at_utc');
  assert.equal(recentParams.get('order'), 'desc');
  assert.equal(recentParams.get('limit'), String(PAGE_SIZE));
  assert.equal(PAGE_SIZE, 50);
  assert.equal(recentParams.get('offset'), '0');
  assert.equal(recentParams.has('start'), false);
  assert.equal(recentParams.has('end'), false);
  assert.equal(recentParams.has('q'), false);
  assert.deepEqual([...recentParams.keys()].sort(), ['limit', 'offset', 'order', 'sort']);

  const named = queryForSort('name', 50, '2026-01-01', '2026-01-31');
  const namedParams = new URL(`http://local${named}`).searchParams;
  assert.equal(namedParams.get('sort'), 'participant_full_name');
  assert.equal(namedParams.get('order'), 'asc');
  assert.equal(namedParams.get('offset'), '50');
  assert.equal(namedParams.get('start'), '2026-01-01');
  assert.equal(namedParams.get('end'), '2026-01-31');

  const blank = buildWaiverDocumentsQuery({
    sort: 'signed_at_utc',
    order: 'desc',
    limit: 50,
    offset: 0,
    start: '   ',
    end: '',
  });
  const blankParams = new URL(`http://local${blank}`).searchParams;
  assert.equal(blankParams.has('start'), false);
  assert.equal(blankParams.has('end'), false);
});

test('completeness flags stay quiet unless medical or emergency is missing', () => {
  const partial = completenessFlags({
    review_confirm_accuracy: true,
    medical_history_id: 'med-1',
    emergency_contact_id: null,
  });
  assert.deepEqual(
    partial.map((flag) => flag.label),
    ['Review confirmed', 'Medical on file', 'Emergency missing'],
  );
  assert.equal(partial.find((flag) => flag.id === 'emergency').tone, 'warning');
  assert.equal(partial.find((flag) => flag.id === 'medical').tone, 'quiet');
  assert.equal(partial.find((flag) => flag.id === 'review').tone, 'quiet');

  const missing = completenessFlags({
    review_confirm_accuracy: false,
    medical_history_id: '  ',
    emergency_contact_id: 'ec-1',
  });
  assert.deepEqual(
    missing.map((flag) => [flag.label, flag.tone]),
    [
      ['Review not confirmed', 'quiet'],
      ['Medical missing', 'warning'],
      ['Emergency on file', 'quiet'],
    ],
  );
});

test('page search matches name, email, cell, and home phone only', () => {
  const rows = [
    {
      participant_full_name: 'Ada Lovelace',
      participant_email: 'ada@example.com',
      participant_cell_phone: '555-0100',
      participant_home_phone: '555-0199',
      participant_city: 'Hidden City',
    },
  ];
  assert.equal(filterLoadedPage(rows, '  ').length, 1);
  assert.equal(filterLoadedPage(rows, 'ADA').length, 1);
  assert.equal(filterLoadedPage(rows, 'ada@example').length, 1);
  assert.equal(filterLoadedPage(rows, '555-0100').length, 1);
  assert.equal(filterLoadedPage(rows, '0199').length, 1);
  assert.equal(filterLoadedPage(rows, 'hidden').length, 0);
});

test('error keys map to operator copy', () => {
  assert.equal(
    mapViewerError(401, 'unauthorized'),
    'Sign in through Cloudflare Access, then reload.',
  );
  assert.equal(
    mapViewerError(403, 'forbidden'),
    'This account is not on the waiver viewer allowlist.',
  );
  assert.equal(
    mapViewerError(503, 'viewer_access_not_configured'),
    'Viewer access is not configured on the API.',
  );
  assert.equal(
    mapViewerError(503, 'viewer_allowlist_not_configured'),
    'Viewer access is not configured on the API.',
  );
  assert.equal(mapViewerError(503, 'other'), UNAVAILABLE_MESSAGE);
  assert.equal(mapViewerError(500, 'boom'), UNAVAILABLE_MESSAGE);
  assert.equal(mapViewerError(0), UNAVAILABLE_MESSAGE);
});

test('viewerFetch requires same-origin credentials, HTTP success, and ok:true', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.credentials, 'same-origin');
      assert.ok(init.signal);
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    };
    await assert.rejects(
      () => viewerFetch('/api/viewer/waiver-documents?limit=50'),
      (error) => {
        assert.ok(error instanceof ViewerRequestError);
        assert.equal(error.message, 'Sign in through Cloudflare Access, then reload.');
        assert.equal(error.status, 401);
        return true;
      },
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    await assert.rejects(
      () => viewerFetch('/api/viewer/waiver-documents'),
      (error) => error instanceof ViewerRequestError && error.message === UNAVAILABLE_MESSAGE,
    );

    globalThis.fetch = async () => {
      throw new TypeError('network down');
    };
    await assert.rejects(
      () => viewerFetch('/api/viewer/waiver-documents'),
      (error) => error instanceof ViewerRequestError && error.message === UNAVAILABLE_MESSAGE,
    );

    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.signal.aborted, true);
      throw new DOMException('The operation was aborted', 'AbortError');
    };
    await assert.rejects(
      () => viewerFetch('/api/viewer/waiver-documents', { signal: controller.signal }),
      (error) => error instanceof DOMException && error.name === 'AbortError',
    );
  } finally {
    globalThis.fetch = original;
  }
});

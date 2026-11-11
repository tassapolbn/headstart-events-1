import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(path.join(tmpdir(), 'headstart-move-'));
try {
  await build({
    entryPoints: ['src/lib/moveRegistration.ts'],
    bundle: true, platform: 'node', format: 'esm',
    outfile: `${dir}/m.mjs`, logLevel: 'error',
    plugins: [{ name: 'stub-supabase', setup(build) {
      build.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = globalThis.moveSupabase;' }));
    } }],
  });
  const calls = [];
  let replies = [];
  globalThis.moveSupabase = {
    from(table) {
      const query = {};
      for (const method of ['select', 'eq', 'not', 'order', 'range', 'limit', 'update']) {
        query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
      }
      query.then = (resolve, reject) => Promise.resolve(replies.shift()).then(resolve, reject);
      return query;
    },
    rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve(replies.shift()); },
  };
  const { pickTargetEvents, missingAnswerFields, moveRegistration } = await import(pathToFileURL(`${dir}/m.mjs`));
  const current = { id: 'current', name: '  School Fair ', campus_id: 'hsc', status: 'published', settings: {} };
  const target = { ...current, id: 'target', name: 'school FAIR', campus_id: 'hsn' };
  const events = [
    { ...target, id: 'z', name: 'Zoo' },
    { ...target, id: 'a', name: 'Art' },
    { ...target, id: 'survey', settings: { formType: 'survey' } },
    current, target,
    { ...target, id: 'current' },
    { ...target, id: 'elsewhere', campus_id: 'other' },
  ];
  assert.deepEqual(pickTargetEvents(events, current, 'hsn').map((e) => e.id), ['target', 'a', 'z']);
  assert.deepEqual(pickTargetEvents(events, { ...current, settings: { formType: 'survey' } }, 'hsn').map((e) => e.id), ['survey']);
  assert.deepEqual(pickTargetEvents(events, current, 'missing'), []);
  assert.equal(events[0].id, 'z', 'sorting must not mutate the input');
  assert.deepEqual(missingAnswerFields({
    known: 'kept', lost: 'answer', zero: 0, no: false, multiple: ['yes'],
    __internal: 'hidden', __policy_acks: [{ title: 'Consent' }],
    blank: '  ', empty: [], nestedEmpty: ['', null], objectEmpty: {}, null: null, undefined: undefined,
  }, [{ id: 'known' }]), ['lost', 'zero', 'no', 'multiple']);
  assert.deepEqual(missingAnswerFields(null, []), []);

  const reg = { id: 'reg', email: ' Parent_%@School.org ', booth_id: 'booth', checked_in_at: '2026-11-11T09:00:00Z' };
  replies = [{ data: [{ email: ' parent_%@SCHOOL.ORG  ' }], error: null }];
  await assert.rejects(moveRegistration(reg, target), /This email already has a registration for that event\./);
  assert.ok(!calls.some((c) => c[0] === 'rpc' || c[1] === 'update'));

  calls.length = 0;
  replies = [{ data: [], error: null }, { error: null }, { error: null }];
  assert.deepEqual(await moveRegistration(reg, target), { releasedBooths: true });
  assert.ok(calls.findIndex((c) => c[0] === 'rpc') < calls.findIndex((c) => c[1] === 'update'));
  assert.deepEqual(calls.find((c) => c[1] === 'update')[2], { event_id: target.id, checked_in_at: null });

  calls.length = 0;
  replies = [{ data: [], error: null }, { error: null }, { error: { message: 'Update failed' } }];
  await assert.rejects(moveRegistration(reg, target), /Booths were released, but the move failed: Update failed\. The registration is still in its original event; reassign its booth if needed\./);
  assert.ok(calls.findIndex((c) => c[0] === 'rpc') < calls.findIndex((c) => c[1] === 'update'));

  calls.length = 0;
  replies = [{ data: [{ booth_id: 'linked' }], error: null }, { error: { message: 'Release failed' } }];
  await assert.rejects(moveRegistration({ ...reg, booth_id: null }, { ...target, settings: { allowDuplicateEmail: true } }), /Release failed/);
  assert.ok(!calls.some((c) => c[1] === 'update'));

  replies = [{ data: [], error: null }, { error: null }];
  assert.deepEqual(await moveRegistration({ ...reg, email: '', booth_id: null }, target), { releasedBooths: false });
  console.log('move-registration tests passed');
} finally {
  delete globalThis.moveSupabase;
  await rm(dir, { recursive: true, force: true });
}

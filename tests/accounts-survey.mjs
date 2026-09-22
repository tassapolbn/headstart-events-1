import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(path.join(tmpdir(), 'headstart-tests-'));
try {
  await build({ entryPoints: ['src/components/form-renderer/fieldZod.ts'], bundle: true, platform: 'node', format: 'esm', outfile: `${dir}/validation.mjs` });
  const { buildResolver } = await import(pathToFileURL(`${dir}/validation.mjs`));
  for (const options of [['1','2','3','4','5'], Array.from({length:10}, (_,i)=>String(i+1)), ['ควรปรับปรุง','พอใช้','ดี','ดีมาก','อื่น ๆ']]) {
    const field = { id:'q', type: options[0] === '1' ? 'rating' : 'evaluation', label:'Question', options, required:true };
    const resolve = buildResolver([field]);
    assert.deepEqual((await resolve({q:options.at(-1)})).errors, {});
    assert.ok((await resolve({q:''})).errors.q);
    assert.ok((await resolve({q:'999'})).errors.q);
    assert.deepEqual((await buildResolver([{...field, required:false}])({q:''})).errors, {});
    assert.deepEqual((await buildResolver([{...field, condition:{fieldId:'gate',operator:'equals',value:'yes'}}])({gate:'no',q:''})).errors, {});
  }
  await build({ stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { FormRenderer } from './src/components/form-renderer/FormRenderer';
    import { buildRows } from './src/components/registrations/exporters';
    const fields = [{id:'score', type:'rating', label:'Satisfaction', options:Array.from({length:10},(_,i)=>String(i+1))}, {id:'quality', type:'evaluation', label:'Quality', options:['ดี', 'ดีมาก']}];
    export const html = renderToStaticMarkup(React.createElement(FormRenderer, {fields, onSubmit:()=>{}}));
    export const rows = buildRows({form_schema:fields}, [{reference:'TEST',status:'confirmed',data:{score:'10',quality:'ดีมาก'},created_at:'2026-09-22T00:00:00Z'}]);
  `, resolveDir: process.cwd(), loader:'tsx' }, bundle:true, platform:'node',format:'esm',banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"},outfile:`${dir}/render.mjs`, define:{'import.meta.env':'{}'} });
  const {html,rows} = await import(pathToFileURL(`${dir}/render.mjs`));
  assert.equal((html.match(/type="radio"/g) || []).length,12);
  // A 10 point numbered scale still lays out as 5 equal columns over two rows.
  // The columns moved from a Tailwind class to an explicit grid template when
  // the scale was made to spread evenly across the full width.
  assert.ok(html.includes('ev-scale'));
  assert.ok(html.includes('repeat(5, minmax(0, 1fr))'));
  assert.ok(html.includes('ดีมาก'));
  assert.deepEqual(rows[1].slice(-2),['10','ดีมาก']);
  let users = [], updates = [], deletes = [];
  const api = {
    getUser: async token => ({data:{user:users.find(u=>u.id===token)},error:null}),
    admin: {
      listUsers: async () => ({data:{users},error:null}),
      updateUserById: async (id, data) => { updates.push({id,data}); return {data:{user:{id,...data}},error:null}; },
      createUser: async data => { updates.push(data); return {data:{user:{id:'new',...data}},error:null}; },
      deleteUser: async id => { deletes.push(id); return {error:null}; },
    }
  };
  globalThis.__client = {auth:api};
  globalThis.Deno = {env:{get:()=> 'test'},serve: fn => {globalThis.__handler=fn;}};
  const source = (await readFile('supabase/functions/admin-users/index.ts','utf8')).replace(/import \{ createClient \} from '[^']+';/, 'const createClient = () => globalThis.__client;');
  await build({stdin:{contents:source,loader:'ts'},platform:'node',format:'esm',outfile:`${dir}/edge.mjs`});
  await import(pathToFileURL(`${dir}/edge.mjs`));
  const request = (token, body) => globalThis.__handler(new Request('https://test.invalid', {method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)}));
  const owner = {id:'admin',email:'admin@example.com',app_metadata:{role:'owner'},user_metadata:{}};
  const staff = {id:'staff',email:'staff@accounts.headstartphuket.com',app_metadata:{role:'staff'},user_metadata:{}};
  const legacy = {id:'legacy',email:'legacy@example.com',app_metadata:{},user_metadata:{}};
  users=[owner,staff,legacy];
  for (const action of ['list','create','update_profile','set_password','set_username','delete']) {
    assert.equal((await request('staff',{action,id:'admin',role:'owner'})).status,403);
    assert.equal((await request('legacy',{action})).status,403);
    assert.equal((await request('invalid',{action})).status,401);
  }
  users=[legacy];
  assert.equal((await request('legacy',{action:'list'})).status,403);
  assert.equal(updates.length,0, 'No first caller may bootstrap admin access');
  users=[owner,staff,legacy];
  assert.equal((await request('admin',{action:'list'})).status,200);
  assert.equal((await request('admin',{action:'update_profile',id:'admin',role:'staff'})).status,400);
  assert.equal((await request('admin',{action:'delete',id:'admin'})).status,400);
  assert.equal((await request('admin',{action:'update_profile',id:'staff',username:'!',role:'owner'})).status,400);
  assert.equal(updates.length,0, 'Invalid edits must not partially change roles');
  assert.equal((await request('admin',{action:'create',username:'newstaff',password:'LongPassword123!',role:'staff'})).status,200);
  assert.equal(updates.at(-1).email,'newstaff@accounts.headstartphuket.com');
  assert.equal((await request('admin',{action:'update_profile',id:'staff',username:'renamed',display_name:'Staff Name',role:'owner'})).status,200);
  assert.equal(updates.at(-1).data.email,'renamed@accounts.headstartphuket.com');
  assert.equal(updates.at(-1).data.app_metadata.role,'owner');
  assert.equal((await request('admin',{action:'delete',id:'staff'})).status,200);
  assert.deepEqual(deletes,['staff']);
  console.log('Passed: survey scales, Thai labels, required/optional/conditional answers, account authorization, no bootstrap, last admin protection, atomic edits, username creation and deletion.');
} finally { await rm(dir,{recursive:true,force:true}); }

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translate } from "../app/i18n/i18n.js";
const source = readFileSync(new URL('../app/routes/app.routes.jsx', import.meta.url), 'utf8');

test('saved notice links target visible actual routes and ignore groups, removed ids and duplicate input', () => {
  const start = source.indexOf('function getSavedNoticeRouteRows(');
  assert.ok(start >= 0);
  const end = source.indexOf('\n}\n', start) + 2;
  const select = Function('return (' + source.slice(start,end) + ')')();
  const actual = {id:'one',href:'/route/one',isClickable:true};
  const rows = [actual,{id:'group',isRouteGroup:true,isClickable:true},{id:'empty',isClickable:false}];
  assert.deepEqual(select(rows,['one','one','group','missing','empty']),[actual]);
  assert.deepEqual(select(rows,null),[]);
});

test('route statuses and empty states have Korean display text', () => {
  assert.equal(translate('ko','routes.status.ready'),'준비됨');
  assert.equal(translate('ko','routes.status.in_progress'),'진행 중');
  assert.equal(translate('ko','routes.status.completed'),'완료');
  assert.equal(translate('ko','routes.empty.filtered'),'일치하는 경로가 없습니다');
});

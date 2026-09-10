import test from "node:test";
import assert from "node:assert/strict";
import { translate } from "../app/i18n/i18n.js";
test('route statuses and empty states have Korean display text', () => {
  assert.equal(translate('ko','routes.status.ready'),'준비됨');
  assert.equal(translate('ko','routes.status.in_progress'),'진행 중');
  assert.equal(translate('ko','routes.status.completed'),'완료');
  assert.equal(translate('ko','routes.empty.filtered'),'일치하는 경로가 없습니다');
});

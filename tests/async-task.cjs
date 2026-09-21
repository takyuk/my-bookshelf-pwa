const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = () => {
  const context = vm.createContext({ AbortController });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/async-task.js'), 'utf8'), context);
  const task = vm.runInContext('BookAsyncTask.create()', context);
  const firstToken = task.token();
  const first = task.start();
  task.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(task.isCurrent(firstToken), false);
  const nextToken = task.token();
  const next = task.start();
  // A late finally from an earlier request cannot detach the current request.
  task.finish(firstToken);
  task.cancel();
  assert.equal(next.signal.aborted, true);
  assert.equal(task.isCurrent(nextToken), false);
  // Image decoding cannot be aborted, but its late result must be discarded.
  const imageToken = task.token();
  task.cancel();
  assert.equal(task.isCurrent(imageToken), false);
  assert.equal(task.isCurrent(task.token()), true);
  console.log('PASS: cancellation, stale completion and non-abortable image generation guards');
};

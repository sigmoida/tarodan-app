// RN için Node assert built-in stub. @ide/backoff sadece sentinel için kullanır.
function assert(v, msg) { if (!v) throw new Error(msg || 'Assertion failed'); }
assert.ok = assert;
assert.equal = (a, b, msg) => assert(a == b, msg);
assert.strictEqual = (a, b, msg) => assert(a === b, msg);
assert.deepEqual = assert.deepStrictEqual = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), msg);
assert.notEqual = (a, b, msg) => assert(a != b, msg);
assert.notStrictEqual = (a, b, msg) => assert(a !== b, msg);
assert.throws = (fn, msg) => { try { fn(); throw new Error(msg || 'Did not throw'); } catch (e) {} };
module.exports = assert;
module.exports.default = assert;

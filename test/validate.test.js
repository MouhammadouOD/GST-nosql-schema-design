const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const SCHEMAS_DIR = path.join(__dirname, '..', 'schemas');
const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');

function loadJson(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
}

const TOTAL_TESTS = 10;
let passed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    console.log(`FAIL: ${name}`);
  }
}

function validates(schemaFile, doc) {
  const schema = loadJson(SCHEMAS_DIR, schemaFile);
  const validate = ajv.compile(schema);
  return validate(doc);
}

// --- Positive cases: each real example document satisfies its own schema ---
check('user.example.json satisfies user.schema.json', validates('user.schema.json', loadJson(EXAMPLES_DIR, 'user.example.json')));
check('product.example.json satisfies product.schema.json', validates('product.schema.json', loadJson(EXAMPLES_DIR, 'product.example.json')));
check('order.example.json satisfies order.schema.json', validates('order.schema.json', loadJson(EXAMPLES_DIR, 'order.example.json')));
check('salesSummary.example.json satisfies salesSummary.schema.json', validates('salesSummary.schema.json', loadJson(EXAMPLES_DIR, 'salesSummary.example.json')));

// --- Negative cases: schemas actually reject malformed documents, not just accept everything ---
check('order.schema.json rejects an order with no items', !validates('order.schema.json', {
  ...loadJson(EXAMPLES_DIR, 'order.example.json'),
  items: [],
}));

check('order.schema.json rejects an invalid status value', !validates('order.schema.json', {
  ...loadJson(EXAMPLES_DIR, 'order.example.json'),
  status: 'not-a-real-status',
}));

check('product.schema.json rejects a negative price', !validates('product.schema.json', {
  ...loadJson(EXAMPLES_DIR, 'product.example.json'),
  price: -10,
}));

check('user.schema.json rejects a malformed email', !validates('user.schema.json', {
  ...loadJson(EXAMPLES_DIR, 'user.example.json'),
  email: 'not-an-email',
}));

check('user.schema.json rejects a user with zero addresses', !validates('user.schema.json', {
  ...loadJson(EXAMPLES_DIR, 'user.example.json'),
  addresses: [],
}));

check('salesSummary.schema.json rejects negative unitsSold', !validates('salesSummary.schema.json', {
  ...loadJson(EXAMPLES_DIR, 'salesSummary.example.json'),
  unitsSold: -5,
}));

console.log(`\n${passed}/${TOTAL_TESTS} tests passed`);
if (passed !== TOTAL_TESTS) process.exit(1);

// Side-effect import. Must be the very first import in any test file that
// loads `billing-service` and needs `STRIPE_SECRET_KEY` / `STRIPE_MODE` to
// look configured. The constants in billing-service are captured at module
// load, so setting these vars in the test file body (after imports) is too
// late — ESM hoists imports to the top.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_for_unit_tests';
process.env.STRIPE_MODE = process.env.STRIPE_MODE || 'live';

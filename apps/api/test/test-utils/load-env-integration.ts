/**
 * Pre-jest setup for integration tests.
 * Loads .env (not .env.test) because integration tests need real API credentials.
 * No database operations — only outbound API calls.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require('dotenv');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

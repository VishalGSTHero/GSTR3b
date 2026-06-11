'use strict';

const { execSync } = require('child_process');

process.env.GENERATE_EXECUTION_REPORT = 'true';
execSync('npx playwright test --project=chromium', { stdio: 'inherit', env: process.env });

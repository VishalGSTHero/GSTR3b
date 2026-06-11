'use strict';

/**
 * Generates a sample execution report (no SMTP required).
 * Run: npm run report:preview
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const reportsDir = path.resolve('reports');
const previewDir = path.resolve('preview');

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

const sampleResults = {
  suites: [
    {
      title: 'tests',
      specs: [
        {
          title: 'GSTR-3B filing flow',
          file: 'tests/test.spec.ts',
          tests: [
            {
              results: [
                {
                  status: 'failed',
                  duration: 48_000,
                  error: { message: 'GSTN OTP popup appeared. Complete OTP setup before automation can continue.' },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

fs.writeFileSync(
  path.join(reportsDir, 'playwright-results.json'),
  JSON.stringify(sampleResults, null, 2),
);

const now = new Date();
const start = new Date(now.getTime() - 60_000);

process.env.EXECUTION_START_ISO = start.toISOString();
process.env.EXECUTION_END_ISO = now.toISOString();
process.env.WORKFLOW_RUN_URL = 'https://github.com/VishalGSTHero/GSTR3b/actions/runs/sample';
process.env.GITHUB_REPOSITORY = 'VishalGSTHero/GSTR3b';
process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
process.env.GSTHERO_GSTIN = '33AFPPB3931BAZR';

execSync('node scripts/generate-execution-report.js', { stdio: 'inherit' });

const logRoot = path.resolve('execution-logs');
const latestRun = fs
  .readdirSync(logRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()
  .reverse()[0];

const summaryPath = path.join(logRoot, latestRun, 'execution-summary.json');
const summaryHtmlPath = path.join(logRoot, latestRun, 'execution-summary.html');
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

const previewPath = path.join(previewDir, 'email-preview.html');
fs.copyFileSync(summaryHtmlPath, previewPath);

console.log('\n--- Sample Test Results (what your email will contain) ---');
console.log(`Passed:  ${summary.counts.passed}`);
console.log(`Failed:  ${summary.counts.failed}`);
console.log(`Skipped: ${summary.counts.skipped}`);
console.log(`Flaky:   ${summary.counts.flaky}`);
console.log(`Total:   ${summary.counts.total}`);
console.log(`\nReport preview: ${previewPath}`);
console.log('Open preview/email-preview.html in your browser.\n');

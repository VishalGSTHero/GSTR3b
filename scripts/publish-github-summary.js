'use strict';

const fs = require('fs');
const path = require('path');

const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY;
const LOG_ROOT = path.resolve('execution-logs');

function findLatestSummary() {
  if (!fs.existsSync(LOG_ROOT)) return null;
  const runs = fs
    .readdirSync(LOG_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const run of runs) {
    const summaryPath = path.join(LOG_ROOT, run, 'execution-summary.json');
    if (fs.existsSync(summaryPath)) return summaryPath;
  }
  return null;
}

function main() {
  const summaryPath = process.env.EXECUTION_SUMMARY_PATH ?? findLatestSummary();
  if (!summaryPath || !fs.existsSync(summaryPath)) {
    console.log('No execution summary found. Skipping GitHub summary.');
    return;
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const { passed, failed, skipped, flaky, total } = summary.counts;
  const projectName = process.env.REPORT_PROJECT_NAME ?? 'GSTR-3B Automation';

  const markdown = `## Test Results

| Metric | Count |
| --- | ---: |
| Passed | **${passed}** |
| Failed | **${failed}** |
| Skipped | **${skipped}** |
| Flaky | **${flaky}** |
| **Total** | **${total}** |

**Execution Date:** ${summary.executionDate}  
**Duration:** ${summary.duration}  
**Report:** ${summary.reportLink}

---
*${projectName} · GitHub Actions*
`;

  if (SUMMARY_FILE) {
    fs.appendFileSync(SUMMARY_FILE, markdown);
    console.log('GitHub Actions job summary published.');
    return;
  }

  console.log(markdown);
}

main();

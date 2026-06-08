'use strict';

const fs = require('fs');
const path = require('path');

const IST = 'Asia/Kolkata';
const RESULTS_FILE = path.resolve('reports/playwright-results.json');
const LOG_ROOT = path.resolve('execution-logs');

function formatIst(date, options) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...options }).format(date);
}

function parsePlaywrightResults(report) {
  const cases = [];

  function walkSuites(suites, parentTitles = []) {
    for (const suite of suites ?? []) {
      const titles = [...parentTitles, suite.title].filter(Boolean);
      for (const spec of suite.specs ?? []) {
        const specTitle = [...titles, spec.title].filter(Boolean).join(' > ');
        for (const test of spec.tests ?? []) {
          const result = test.results?.[test.results.length - 1];
          if (!result) continue;
          cases.push({
            title: specTitle || spec.title || 'Unknown test',
            file: spec.file ?? suite.file ?? 'unknown',
            status: result.status,
            durationMs: result.duration ?? 0,
            error: stripAnsi(result.error?.message ?? result.errors?.map((e) => e.message).join('\n') ?? null),
          });
        }
      }
      if (suite.suites?.length) walkSuites(suite.suites, titles);
    }
  }

  walkSuites(report.suites);
  return cases;
}

function countByStatus(cases) {
  const passed = cases.filter((c) => c.status === 'passed' || c.status === 'expected').length;
  const failed = cases.filter((c) => ['failed', 'timedOut', 'interrupted', 'unexpected'].includes(c.status)).length;
  const skipped = cases.filter((c) => c.status === 'skipped').length;
  return {
    total: cases.length,
    passed,
    failed,
    skipped,
  };
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function maskGstin(gstin) {
  if (!gstin || gstin.length < 6) return 'N/A';
  return `${gstin.slice(0, 4)}****${gstin.slice(-4)}`;
}

function buildSummaryHtml(summary) {
  const failedRows = summary.failedTests.length
    ? summary.failedTests
        .map(
          (test, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(test.title)}</td>
          <td><pre>${escapeHtml(test.error || 'No error message captured')}</pre></td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="3">No failed scenarios.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Monthly Automation Execution Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
    h1, h2 { color: #1f3b63; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f6fa; }
    .metric { display: inline-block; margin-right: 24px; font-size: 16px; }
    .passed { color: #1b7f3b; }
    .failed { color: #b42318; }
    .skipped { color: #8a6d1d; }
    pre { white-space: pre-wrap; margin: 0; font-family: Consolas, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Monthly Automation Execution Report</h1>
  <p><strong>Execution Date:</strong> ${escapeHtml(summary.executionDate)}</p>
  <p><strong>Execution Time:</strong> 11:00 AM IST (scheduled)</p>
  <p><strong>Execution Start:</strong> ${escapeHtml(summary.startTime)}</p>
  <p><strong>Execution End:</strong> ${escapeHtml(summary.endTime)}</p>
  <p><strong>Total Duration:</strong> ${escapeHtml(summary.duration)}</p>

  <h2>Summary</h2>
  <p class="metric"><strong>Total Executed:</strong> ${summary.counts.total}</p>
  <p class="metric passed"><strong>Passed:</strong> ${summary.counts.passed}</p>
  <p class="metric failed"><strong>Failed:</strong> ${summary.counts.failed}</p>
  <p class="metric skipped"><strong>Skipped:</strong> ${summary.counts.skipped}</p>

  <h2>Environment Details</h2>
  <table>
    <tr><th>Property</th><th>Value</th></tr>
    ${Object.entries(summary.environment)
      .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(String(value))}</td></tr>`)
      .join('')}
  </table>

  <h2>Failed Scenarios</h2>
  <table>
    <tr><th>#</th><th>Test Case</th><th>Error Message</th></tr>
    ${failedRows}
  </table>

  <h2>Detailed Report</h2>
  <p><a href="${escapeHtml(summary.reportLink)}">${escapeHtml(summary.reportLink)}</a></p>
</body>
</html>`;
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, '');
}

function escapeHtml(value) {
  return stripAnsi(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function main() {
  const now = new Date();
  const stamp = formatIst(now, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/[\/,:\s]/g, '-');

  const runDir = path.join(LOG_ROOT, stamp);
  fs.mkdirSync(runDir, { recursive: true });

  const startTime = process.env.EXECUTION_START_ISO
    ? new Date(process.env.EXECUTION_START_ISO)
    : now;
  const endTime = process.env.EXECUTION_END_ISO
    ? new Date(process.env.EXECUTION_END_ISO)
    : now;
  const durationMs = Math.max(0, endTime.getTime() - startTime.getTime());

  let cases = [];
  if (fs.existsSync(RESULTS_FILE)) {
    const report = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    cases = parsePlaywrightResults(report);
  }

  const counts = countByStatus(cases);
  const failedTests = cases.filter((c) => ['failed', 'timedOut', 'interrupted', 'unexpected'].includes(c.status));

  const executionDate = formatIst(startTime, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const monthYear = formatIst(startTime, {
    month: 'long',
    year: 'numeric',
  });

  const summary = {
    subject: `Monthly Automation Execution Report – ${monthYear}`,
    executionDate,
    executionTime: '11:00 AM IST',
    startTime: formatIst(startTime, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }),
    endTime: formatIst(endTime, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }),
    duration: formatDuration(durationMs),
    durationMs,
    counts,
    failedTests,
    environment: {
      'Application URL': 'https://dev.gsthero.com/GspModel/login/',
      Browser: 'Chromium (Chrome)',
      'CI Runner': process.env.RUNNER_OS ?? 'local',
      'Node.js Version': process.version,
      GSTIN: maskGstin(process.env.GSTHERO_GSTIN ?? '33AFPPB3931BAZR'),
      'Return Month': process.env.GSTHERO_RETURN_MONTH?.trim() || 'Auto (previous month)',
      Timezone: IST,
      Repository: process.env.GITHUB_REPOSITORY ?? 'local-run',
      'Workflow Run': process.env.WORKFLOW_RUN_URL ?? 'N/A',
      Trigger: process.env.GITHUB_EVENT_NAME ?? 'manual',
    },
    reportLink: process.env.WORKFLOW_RUN_URL ?? 'See attached HTML report',
    paths: {
      runDir,
      summaryJson: path.join(runDir, 'execution-summary.json'),
      summaryHtml: path.join(runDir, 'execution-summary.html'),
      auditLog: path.join(runDir, 'execution-audit.log'),
    },
  };

  const html = buildSummaryHtml(summary);
  fs.writeFileSync(summary.paths.summaryJson, JSON.stringify(summary, null, 2));
  fs.writeFileSync(summary.paths.summaryHtml, html);

  const auditLines = [
    `[${summary.startTime}] Monthly automation execution started`,
    `[${summary.endTime}] Monthly automation execution completed`,
    `Total: ${counts.total}, Passed: ${counts.passed}, Failed: ${counts.failed}, Skipped: ${counts.skipped}`,
    `Duration: ${summary.duration}`,
    `Report JSON: ${summary.paths.summaryJson}`,
    `Report HTML: ${summary.paths.summaryHtml}`,
  ];
  fs.appendFileSync(summary.paths.auditLog, `${auditLines.join('\n')}\n`);

  console.log(`Execution summary written to ${summary.paths.summaryJson}`);
}

main();

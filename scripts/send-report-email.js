'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const MAX_RETRIES = Number(process.env.EMAIL_MAX_RETRIES ?? 3);
const RETRY_DELAYS_MS = [5000, 15000, 30000];
const LOG_ROOT = path.resolve('execution-logs');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLatestSummary() {
  if (!fs.existsSync(LOG_ROOT)) {
    throw new Error('No execution-logs directory found. Run report generation first.');
  }

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

  throw new Error('No execution-summary.json found in execution-logs.');
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, '');
}

function buildEmailBody(summary) {
  const failedList = summary.failedTests.length
    ? summary.failedTests
        .map((test, index) => `${index + 1}. ${test.title}\n   Error: ${stripAnsi(test.error || 'No error message captured')}`)
        .join('\n')
    : 'None';

  return `Dear Management,

Please find below the automation execution summary for the scheduled monthly execution.

Execution Date: ${summary.executionDate}
Execution Time: ${summary.executionTime}

Summary:

* Total Executed: ${summary.counts.total}
* Passed: ${summary.counts.passed}
* Failed: ${summary.counts.failed}
* Skipped: ${summary.counts.skipped}

Detailed Report:
${summary.reportLink}

Failed Scenarios:
${failedList}

Please review the attached report for complete execution details.

Regards,
QA Automation Team`;
}

function getAttachments(summary) {
  const attachments = [];

  if (fs.existsSync(summary.paths.summaryHtml)) {
    attachments.push({
      filename: 'execution-summary.html',
      path: summary.paths.summaryHtml,
      contentType: 'text/html',
    });
  }

  const playwrightIndex = path.resolve('playwright-report/index.html');
  if (fs.existsSync(playwrightIndex)) {
    attachments.push({
      filename: 'playwright-report-index.html',
      path: playwrightIndex,
      contentType: 'text/html',
    });
  }

  return attachments;
}

function appendAuditLog(summary, message) {
  const auditPath = summary.paths.auditLog;
  const timestamp = new Date().toISOString();
  fs.appendFileSync(auditPath, `[${timestamp}] ${message}\n`);
}

async function sendWithRetry(summary) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM ?? user;
  const to = process.env.REPORT_EMAIL_TO ?? 'vishal.ghaste@gsthero.com';

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD environment variables.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const mailOptions = {
    from,
    to: to.split(',').map((email) => email.trim()).filter(Boolean),
    subject: summary.subject,
    text: buildEmailBody(summary),
    attachments: getAttachments(summary),
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const info = await transporter.sendMail(mailOptions);
      appendAuditLog(summary, `Email sent successfully on attempt ${attempt}. Message ID: ${info.messageId}`);
      console.log(`Email sent successfully on attempt ${attempt}.`);
      return;
    } catch (error) {
      lastError = error;
      appendAuditLog(summary, `Email attempt ${attempt} failed: ${error.message}`);
      console.error(`Email attempt ${attempt} failed: ${error.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? 30000;
        console.log(`Retrying email in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function main() {
  const summaryPath = process.env.EXECUTION_SUMMARY_PATH ?? findLatestSummary();
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  appendAuditLog(summary, 'Starting email delivery with retry policy');
  await sendWithRetry(summary);
}

main().catch((error) => {
  console.error(`Email delivery failed after retries: ${error.message}`);
  process.exit(1);
});

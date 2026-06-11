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

function buildEmailText(summary) {
  const failedList = summary.failedTests.length
    ? summary.failedTests
        .map((test, index) => `${index + 1}. ${test.title}\n   Error: ${stripAnsi(test.error || 'No error message captured')}`)
        .join('\n')
    : 'None';

  return `Dear Management,

Please find below the automation execution summary.

Execution Date: ${summary.executionDate}
Execution Time: ${summary.executionTime}
Duration: ${summary.duration}

Test Results
------------
Passed:  ${summary.counts.passed}
Failed:  ${summary.counts.failed}
Skipped: ${summary.counts.skipped}
Flaky:   ${summary.counts.flaky}
Total:   ${summary.counts.total}

Detailed Report:
${summary.reportLink}

Failed Scenarios:
${failedList}

Please review the attached report for complete execution details.

Regards,
QA Automation Team`;
}

function buildEmailHtml(summary) {
  const projectName = process.env.REPORT_PROJECT_NAME ?? 'GSTR-3B Automation';
  const failedRows = summary.failedTests.length
    ? summary.failedTests
        .map(
          (test, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(test.title)}</td>
          <td><pre>${escapeHtml(stripAnsi(test.error || 'No error message captured'))}</pre></td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="3">No failed scenarios.</td></tr>';

  return `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #222;">
  <h2 style="color: #1f3b63;">Test Results</h2>
  <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; min-width: 280px;">
    <tr style="background: #f3f6fa;"><th align="left">Metric</th><th align="right">Count</th></tr>
    <tr><td style="color: #1b7f3b;">Passed</td><td align="right">${summary.counts.passed}</td></tr>
    <tr><td style="color: #b42318;">Failed</td><td align="right">${summary.counts.failed}</td></tr>
    <tr><td style="color: #8a6d1d;">Skipped</td><td align="right">${summary.counts.skipped}</td></tr>
    <tr><td>Flaky</td><td align="right">${summary.counts.flaky}</td></tr>
    <tr><td><strong>Total</strong></td><td align="right"><strong>${summary.counts.total}</strong></td></tr>
  </table>
  <p><strong>Execution Date:</strong> ${escapeHtml(summary.executionDate)}<br/>
  <strong>Duration:</strong> ${escapeHtml(summary.duration)}<br/>
  <strong>Report:</strong> <a href="${escapeHtml(summary.reportLink)}">${escapeHtml(summary.reportLink)}</a></p>
  <h3>Failed Scenarios</h3>
  <table cellpadding="8" cellspacing="0" border="1" style="border-collapse: collapse; width: 100%;">
    <tr style="background: #f3f6fa;"><th>#</th><th>Test Case</th><th>Error</th></tr>
    ${failedRows}
  </table>
  <hr/>
  <p style="color: #666; font-size: 12px;">${escapeHtml(projectName)} · GitHub Actions</p>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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

function normalizeGmailPassword(password) {
  return String(password).replace(/\s+/g, '');
}

function buildSmtpTransport(host, port, user, pass) {
  const isGmail = host.includes('gmail.com');
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: isGmail ? normalizeGmailPassword(pass) : pass },
    ...(isGmail && !secure
      ? { requireTLS: true, tls: { minVersion: 'TLSv1.2' } }
      : {}),
  });
}

function gmailCredentialHint(errorMessage) {
  if (!String(errorMessage).includes('535')) return '';
  return [
    '',
    'Gmail fix checklist:',
    '1. Enable 2-Step Verification on the sender Gmail account',
    '2. Create an App Password at https://myaccount.google.com/apppasswords',
    '3. Set SMTP_PASSWORD to the 16-character app password (not your normal Gmail password)',
    '4. SMTP_USER must exactly match the Gmail account that created the app password',
    '5. SMTP_HOST=smtp.gmail.com and SMTP_PORT=587',
  ].join('\n');
}

async function sendWithRetry(summary) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim() ?? user;
  const to = process.env.REPORT_EMAIL_TO ?? 'vishal.ghaste@gsthero.com';

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD GitHub secrets.');
  }

  console.log(`Sending report email via ${host}:${port} as ${user} to ${to}`);

  const transporter = buildSmtpTransport(host, port, user, pass);

  try {
    await transporter.verify();
    console.log('SMTP connection verified successfully.');
  } catch (error) {
    const hint = gmailCredentialHint(error.message);
    throw new Error(`SMTP verification failed: ${error.message}${hint}`);
  }

  const mailOptions = {
    from,
    to: to.split(',').map((email) => email.trim()).filter(Boolean),
    subject: summary.subject,
    text: buildEmailText(summary),
    html: buildEmailHtml(summary),
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
      const hint = gmailCredentialHint(error.message);
      appendAuditLog(summary, `Email attempt ${attempt} failed: ${error.message}${hint}`);
      console.error(`Email attempt ${attempt} failed: ${error.message}${hint}`);
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

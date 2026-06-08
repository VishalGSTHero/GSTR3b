'use strict';

const nodemailer = require('nodemailer');

function normalizeGmailPassword(password) {
  return String(password).replace(/\s+/g, '');
}

async function main() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim() ?? user;
  const to = process.env.REPORT_EMAIL_TO ?? 'vishal.ghaste@gsthero.com';
  const isGmail = host?.includes('gmail.com');

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD.');
  }

  console.log(`Host: ${host}`);
  console.log(`Port: ${port}`);
  console.log(`User: ${user}`);
  console.log(`To:   ${to}`);
  console.log(`Password length: ${normalizeGmailPassword(pass).length} chars (Gmail app password should be 16)`);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: isGmail ? normalizeGmailPassword(pass) : pass },
    ...(isGmail && port !== 465
      ? { requireTLS: true, tls: { minVersion: 'TLSv1.2' } }
      : {}),
  });

  console.log('Verifying SMTP connection...');
  await transporter.verify();
  console.log('SMTP connection OK. Sending test email...');

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'GSTR3B Automation – SMTP Test Email',
    text: [
      'This is a test email from the GSTR3B automation pipeline.',
      '',
      'If you received this, Gmail SMTP secrets are configured correctly.',
      '',
      `Sent at: ${new Date().toISOString()}`,
    ].join('\n'),
  });

  console.log(`Test email sent. Message ID: ${info.messageId}`);
}

main().catch((error) => {
  console.error('\nSMTP test FAILED:', error.message);
  if (String(error.message).includes('535')) {
    console.error(`
Gmail App Password required (NOT your normal Gmail password):

1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Go to https://myaccount.google.com/apppasswords
4. Create app password for "Mail"
5. Update GitHub secret SMTP_PASSWORD with the 16-character password (no spaces)
6. SMTP_USER must be the exact Gmail that created the app password

For @gsthero.com Google Workspace: ask your IT admin to enable App Passwords
if the option is not visible in your Google account.
`);
  }
  process.exit(1);
});

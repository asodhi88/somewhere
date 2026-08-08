/**
 * POST /api/feedback — Vercel serverless function.
 *
 * Same pattern as the Domicile project: no database, no queue. A single function
 * validates a submission from the site's <FeedbackForm> and emails it to the
 * site owner via Resend. Runs only on Vercel (or `vercel dev`) — the Vite dev
 * server doesn't execute it, so a local submit surfaces the form's error state.
 *
 * Env (see .env.example — both are server-only, never shipped to the client):
 *   RESEND_API_KEY  — Resend API key
 *   FEEDBACK_EMAIL  — where submissions are delivered
 *
 * Spam control is a honeypot: the form ships a hidden `company` field no human
 * fills in. A non-empty value means a bot, so we return 200 (the bot sees
 * "success") and drop it without sending.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// Resend's shared sender delivers to the account owner without a verified
// domain, which is all this needs. Swap for an address on your own verified
// domain once you have one — a one-line change.
const FROM = 'somewhere feedback <onboarding@resend.dev>'

const MAX_MESSAGE = 5000
const MAX_FIELD = 200

const clip = (v, max) => String(v == null ? '' : v).trim().slice(0, max)

// Minimal HTML-escape so a submitter's text can't break (or inject into) the
// owner's email markup.
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Vercel's Node runtime usually pre-parses a JSON body onto req.body; fall back
// to reading the raw stream so the function also works when it doesn't.
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const body = await readBody(req)

  // Honeypot: silently accept and drop bot submissions.
  if (clip(body.company, MAX_FIELD)) {
    return res.status(200).json({ ok: true })
  }

  const message = clip(body.message, MAX_MESSAGE)
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' })
  }

  const email = clip(body.email, MAX_FIELD)
  const replyTo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null
  const destination = clip(body.destination, MAX_FIELD)

  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.FEEDBACK_EMAIL
  if (!apiKey || !to) {
    // Misconfiguration is ours, not the visitor's — log and report generically.
    console.error('Feedback: missing RESEND_API_KEY or FEEDBACK_EMAIL env var.')
    return res.status(500).json({ error: 'Feedback is not configured yet.' })
  }

  const subject = destination
    ? `Feedback · ${destination} — somewhere`
    : 'New feedback — somewhere'

  const meta = [
    ['Destination', destination || '—'],
    ['Reply-to', replyTo || '(none provided)'],
  ]
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a1614">
      <h2 style="margin:0 0 12px;font-size:18px">New feedback — somewhere</h2>
      <p style="white-space:pre-wrap;margin:0 0 18px">${esc(message)}</p>
      <table style="font-size:13px;border-collapse:collapse">
        ${meta
          .map(
            ([k, v]) =>
              `<tr><td style="padding:2px 14px 2px 0;color:#8a8178">${k}</td><td style="color:#1a1614">${esc(v)}</td></tr>`,
          )
          .join('')}
      </table>
    </div>`
  const text = [
    'New feedback — somewhere',
    '',
    message,
    '',
    `Destination: ${destination || '—'}`,
    `Reply-to: ${replyTo || '(none provided)'}`,
  ].join('\n')

  try {
    const payload = { from: FROM, to: [to], subject, html, text }
    if (replyTo) payload.reply_to = replyTo

    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.error('Feedback: Resend error', r.status, detail)
      return res.status(502).json({ error: 'Could not send right now.' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Feedback: send failed', err)
    return res.status(500).json({ error: 'Could not send right now.' })
  }
}

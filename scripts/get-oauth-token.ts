/**
 * One-time script to get a Google OAuth refresh token for Drive access.
 *
 * 1. Put your OAuth 2.0 client JSON at: oauth-credentials.json (project root)
 * 2. Run: npx tsx scripts/get-oauth-token.ts
 * 3. Visit the URL it prints, approve access, copy the code from the redirect URL
 * 4. Paste the code back into the terminal
 * 5. Copy the printed refresh token into your .env.local and Vercel env vars
 */

import { google } from 'googleapis'
import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'

const credsPath = path.resolve(process.cwd(), 'oauth-credentials.json')
if (!fs.existsSync(credsPath)) {
  console.error('oauth-credentials.json not found at project root')
  process.exit(1)
}

const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
const { client_id, client_secret, redirect_uris } = creds.web ?? creds.installed
const redirectUri = redirect_uris.find((u: string) => u.startsWith('http://localhost')) ?? redirect_uris[0]

const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirectUri)

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // forces refresh_token to be returned every time
  scope: ['https://www.googleapis.com/auth/drive'],
})

console.log('\nOpen this URL in your browser and sign in with the Google account that owns the Drive folder:\n')
console.log(authUrl)
console.log()
console.log('After approving, you\'ll be redirected to localhost (it will fail to load — that\'s fine).')
console.log('Copy the "code=..." value from the URL and paste it below.\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.question('Paste the code here: ', async (code) => {
  rl.close()
  try {
    const { tokens } = await oauth2.getToken(code.trim())
    console.log('\n✅ Success! Add these to your .env.local and Vercel environment variables:\n')
    console.log(`GOOGLE_CLIENT_ID=${client_id}`)
    console.log(`GOOGLE_CLIENT_SECRET=${client_secret}`)
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log()
    if (!tokens.refresh_token) {
      console.warn('⚠️  No refresh_token returned. If you\'ve authorised this app before, go to')
      console.warn('   https://myaccount.google.com/permissions, revoke access, and run this script again.')
    }
  } catch (err) {
    console.error('Failed to exchange code:', err)
    process.exit(1)
  }
})

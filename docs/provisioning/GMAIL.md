# Gmail with the PDF attached

The Gmail button on the send sheet works in two ways.

1. Without setup: Pesa opens a Gmail message in the browser with the address, subject and text filled in, saves the PDF to Downloads, and shows a draggable file you can drop into the message. A web link cannot attach a file by itself, so you add the PDF.
2. With a Google client ID (about 10 minutes, free): Pesa creates a Gmail draft with the PDF already attached and opens it. Pesa asks for one permission only, `gmail.compose` (create drafts). It cannot read your mail.

## Set up the client ID (once)

1. Go to https://console.cloud.google.com and create a project (for example "Pesa").
2. APIs and services, Library: enable the **Gmail API**.
3. APIs and services, OAuth consent screen: choose External, fill in the app name (Pesa) and your email, add the scope `.../auth/gmail.compose`, and under Test users add the Gmail addresses that will send from Pesa (up to 100 while the app is in Testing). Publishing the app to everyone needs Google verification, which is only needed if you want strangers to connect their own Gmail.
4. APIs and services, Credentials: Create credentials, OAuth client ID, type **Web application**. Under Authorised JavaScript origins add the address Pesa is opened from (for example `https://yourname.github.io` or the address your shop uses). No redirect address is needed.
5. Copy the client ID (it ends in `.apps.googleusercontent.com`).
6. In Pesa, open any send sheet (invoice, receipt, report), tap **Gmail**, paste the client ID into the box that appears and tap Save. Tap **Gmail** again and allow access in the Google window.

The client ID is saved on that device only. The access Google gives lasts about an hour, then Google asks again. Pesa only asks for permission when you tap Gmail.

## If it does not work
- "Popup blocked" or nothing happens: allow pop ups for the Pesa address.
- "Access blocked: app not verified": add your Gmail address under Test users (step 3).
- "origin_mismatch": the address in step 4 must match the address Pesa is opened from exactly.
In every case Pesa falls back to the first method, so sending is never blocked.

Whether Google's rules, quotas or consent screen requirements change is outside Pesa's control. Check Google's current documentation when setting this up.

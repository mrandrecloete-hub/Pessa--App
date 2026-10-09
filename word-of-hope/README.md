# Ashelz Bible App

A free Bible and devotional app. Plain HTML, CSS and JavaScript, no build step. Open `index.html` from any web server (for example `python3 -m http.server`) and add it to the phone's home screen. It adapts to phone and desktop (sidebar layout from 960 px wide).

- **Dashboard:** greeting, Verse of the Day, Daily Devotional with an inline YouTube player (official IFrame Player API, plain embed as fallback), Counseling Portal, Featured Devotional, Theme and Appearance, Messages of Hope, Today's Prayer with Mark as Prayed.
- **Bible:** all 66 books, chapters, King James Version text (loaded from bible-api.com the first time a chapter is read, then kept on the phone), favorites.
- **Devotions:** day by day (yesterday, today, tomorrow), mark as read, share, pray it, and an archive of all devotions. **Messages of Hope:** swipe, save favorites, copy and share.
- **Bible reader:** type a reference such as John 3 or Psalms 23:1 to open it, tap verses to copy, share, highlight or save to Notes, continue reading, and move on across books.
- **Settings:** Account, Notifications (a daily reminder while the app is open or installed and running), Theme and Appearance, Backup and Restore (save and restore your prayers, notes and favorites), About the App.
- **Also:** prayer streak, in-app Back button support.
- **Devotions, Messages of Hope** (swipe carousel), **Counseling Portal** (9 topics with validation, scripture anchors and an action plan, plus a Pray Now button), **My Prayers**, **Notes**.
- **Icons:** the colourful 3D icons are in `ico/` (footer, More menu, sidebar and page headers).
- **Theme and Appearance:** dark mode, accent colour (maroon, green, blue, pink), font size. **Settings:** your name and About the Founder.
- 100 percent free: no payments, subscriptions or locked features.

Files: `mockData.js` (all content), `theme.js` (ThemeContext), `scenes.js` (artwork drawn in code), `app.js` (components), `styles.css`.

**Replace before sharing:** every devotion uses the sample YouTube ID `dQw4w9WgXcQ`. Put your own devotional video IDs in `mockData.js` (`youtubeId`). Scripture is the King James Version (public domain). The scenic pictures are drawn in code, not photographs, so you can swap in licensed photos later. The counseling portal is spiritual encouragement, not professional care, and says so.

## Guide, translations, downloads (added)
- `knowledge.js`: built in Bible knowledge (66 books, 25 life topics with KJV verses, practices and prayers, 8 biblical coping skills, faith Q&A).
- `assistant.js`: the Ashelz Guide engine. Rule based and offline, no AI service. It answers feelings and questions from the knowledge base, runs app actions (open chapters, theme, prayers, notes, reminders) and puts safety first for crisis words. It is not a general chatbot or a counselor.
- Translations: bible-api.com versions work without a key. A free key from scripture.api.bible adds many more versions and languages (entered in Bible Translations, kept on the phone). Live services were tested here only with mocked responses.
- Devotion videos: YouTube IFrame API with loading, error messages and retry. YouTube videos cannot be downloaded inside the app; slides (PNG ZIP) and text can. Add `videoUrl` (mp4) to a devotion in mockData.js for a downloadable video.
- Select any text to copy, share, highlight (saved to Notes) or ask the Guide.

## Journal, e-books, icons (added)
- My Journal: daily entries with prompt, mood and optional verse of the day; edit, search, copy, share, download one or all as text; included in Backup & Restore.
- Free E-Books (`library.js`): public domain Christian classics grouped by app section (Devotions, Prayer, Counseling, Hope, Bible study, Journal), with a "Free books" strip on those pages. Links go to gutenberg.org. Only books whose Gutenberg number is known have direct EPUB/TXT links; the rest open a title search. Links could not be checked from the build environment.
- 17 new 3D icons (ico/) in the same blue, gold and red style for Journal, E-Books, Guide, Translations, Account, Notifications, Backup, About and the counseling topics.
- Speed: scripts deferred, shorter splash, service worker answers from the cache first and refreshes in the background.

## Complete offline Bible and daily sync (added)
- `bible/kjv/1..66.json`: the complete King James Version (31,102 verses, from the MIT licensed `bible-kjv` npm package, KJV text is public domain), read straight from the app with no internet. Fetched files are kept by the service worker.
- `daily.js` (built by `node tools/build_daily.js`): 366 different daily verses in 25 themes with exact KJV text. The devotion, verse of the day, journal prompt and dashboard all follow the phone's local date, so every phone shows the same day's content and rolls over at midnight, even if the app stays open.
- YouTube uses a plain embed (no extra script) and listens to the player's own messages for errors. A Watch on YouTube link is always shown under the video.
- Book covers load from Project Gutenberg or Open Library when online; the drawn cover stays if they cannot load.

## Bible in many languages (added)
- Bundled offline: KJV (English), Smith-Van Dyck 1865 (Arabic, full Bible) and the Aleppo Codex (Hebrew Old Testament), under `bible/svd` and `bible/aleppo` (from the open bible-data collection, public domain). Arabic and Hebrew display right to left.
- 30 more versions in 23 languages load from the open bible-data collection (raw.githubusercontent.com, with a jsDelivr fallback) and are saved on the phone once read. The Hebrew and Greek originals are Old Testament only and New Testament only.
- Copyrighted versions (Afrikaans 1953, NIV, ESV and others) cannot be bundled; the optional free API.Bible key adds many of them.
- The Reader has a version picker at the top. The app screens themselves are still English.

## Sign in and the living Yeshua logo (added)
- Sign in page (first launch, also More, Settings, Account): Name, Surname, Email, Password, "Sign in with Google" and "Continue without an account". The account is kept on this phone only; the password is stored as a salted PBKDF2 hash, never as text. There is no server, so signing in on another phone creates a separate account.
- Google sign in needs your own Google client ID: create an OAuth "Web application" client at console.cloud.google.com (APIs and Services, Credentials), add your app address under Authorized JavaScript origins, and paste the client ID into `config.js`. Until then the Google button says it is not switched on. The Google token is read on the phone only (it is not verified by a server).
- The logo (`yeshua.png`, with `yeshua-blue.png` and `yeshua-gold.png` masks) is animated with CSS: flowing, shifting blue, light sweeping over the blue and the gold lettering, twinkling sparks and a pulsing glow.

## Sharing, verse pictures, security (added)
- Share sheet: WhatsApp (wa.me link), Facebook (sharer link) and copy, plus "More apps" where the phone offers it. Nothing is posted automatically.
- Verse pictures are drawn on the phone from original artwork or the user's own photo. Pinterest images belong to their creators, so none are copied; use photos you own or from free sources such as Unsplash, Pexels or Pixabay (check each licence).
- Security (browser level, not a network firewall): a Content-Security-Policy in index.html and `_headers` (for Netlify), sign-in lockout after 5 wrong passwords, a warning on unofficial addresses, and an Authentic build check (About) that compares the program files on the phone with `integrity.json` and with the official site.
- Release step: after every change run `node tools/build_integrity.js` inside the app folder, then publish. Files can still be copied by anyone who opens the app; this makes changes visible, it does not prevent copying, and it is not a certificate from any outside body. See LICENSE.

## Notes as a word processor (added)
Notes: list with search and pin, and an editor with undo and redo, heading styles, font size and family, bold, italic, underline, strikethrough, text colour and highlight, alignment, bullet and numbered lists, indent, tables, links, divider, date, clear formatting, find and replace, word count, autosave, and Download Word (.doc), Download text, Print / PDF, Copy and Share. Pasted or stored text is cleaned so scripts and unsafe tags cannot run.
The founder photo shows only on the About page.

## Deep topics and powerful prayers (added)
`tools/deep_src.js` holds 22 topics (witchcraft and the occult, sexual sin and restoration, idolatry, curses and generational patterns, pride and rebellion, spiritual warfare, lust and purity, repentance, born again, sin, death, life, heaven, hell and judgment, demons and deliverance, angels, the blood of Jesus, the Holy Spirit, strongholds and addictions, the fear of the Lord, the second coming, fasting) with teaching points, reflection questions, 24 prayers and declarations. `node tools/build_deep.js` checks every scripture reference against the bundled KJV and writes `deep.js`. The Ashelz Guide also answers questions on these topics.

`tools/devo/p1.py`, `p2.py` and `p3.py` hold the long daily teaching for the 25 devotion themes (about 700 words each: doctrine, Hebrew and Greek notes, three lenses, two long prayers, declarations, key scriptures). `node tools/build_devo.js` writes `devo.js` with the key scriptures looked up in the bundled KJV so the text is exact. The Devotions page shows it under the day's verse. Care notes point to pastors, doctors and emergency services where that matters.

## Online Homecell (added)
Create a Homecell (name, leader, weekly day and time) with a private random code, invite by WhatsApp or Facebook, join with a code or link, and test your camera and microphone first. Calls run on Jitsi Meet (meet.jit.si): "Join now" opens the room on its own tab (best on phones), "Join inside Ashelz" opens it full screen in the app. Ashelz does not record or store calls. The Permissions-Policy in `_headers` allows camera and microphone for the app and meet.jit.si.
Graphics: all 3D icons are 256 px; the 10 original icons were upscaled 2x with sharpening (no new detail), the rest were re-rendered from vector at 256 px.

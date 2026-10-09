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

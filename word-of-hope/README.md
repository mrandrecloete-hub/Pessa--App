# Draw Near

A free Bible and devotional app. Plain HTML, CSS and JavaScript, no build step. Open `index.html` from any web server (for example `python3 -m http.server`) and add it to the phone's home screen. It adapts to phone and desktop (sidebar layout from 960 px wide).

- **Dashboard:** greeting, Verse of the Day, Daily Devotional with an inline YouTube player (official IFrame Player API, plain embed as fallback), Counseling Portal, Featured Devotional, Theme and Appearance, Messages of Hope, Today's Prayer with Mark as Prayed.
- **Bible:** all 66 books, chapters, King James Version text (loaded from bible-api.com the first time a chapter is read, then kept on the phone), favorites.
- **Devotions, Messages of Hope** (swipe carousel), **Counseling Portal** (9 topics with validation, scripture anchors and an action plan, plus a Pray Now button), **My Prayers**, **Notes**.
- **Theme and Appearance:** dark mode, accent colour (maroon, green, blue, pink), font size. **Settings:** your name and About the Founder.
- 100 percent free: no payments, subscriptions or locked features.

Files: `mockData.js` (all content), `theme.js` (ThemeContext), `scenes.js` (artwork drawn in code), `app.js` (components), `styles.css`.

**Replace before sharing:** every devotion uses the sample YouTube ID `dQw4w9WgXcQ`. Put your own devotional video IDs in `mockData.js` (`youtubeId`). Scripture is the King James Version (public domain). The scenic pictures are drawn in code, not photographs, so you can swap in licensed photos later. The counseling portal is spiritual encouragement, not professional care, and says so.

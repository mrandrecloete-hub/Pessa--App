# Word of Hope

A free Bible and devotional app. Plain HTML, CSS and JavaScript, no build step, works offline once opened. Open `index.html` from any web server (for example `python3 -m http.server`) and add it to the phone's home screen.

- **Home:** greeting, Daily Scripture, Daily Devotional with an inline YouTube player (official IFrame Player API, with a plain embed as fallback), tiles to Messages of Hope and the Counseling Portal.
- **Hope:** swipeable Messages of Hope carousel.
- **Counsel:** 8 categories, each with a supportive opening, 2 to 3 scripture anchors and an action plan.
- **Settings:** dark mode, accent colour swatches (global), your name, and About the Founder.
- 100 percent free: no payments, subscriptions or locked features.

Files: `mockData.js` (all content), `theme.js` (ThemeContext), `app.js` (components), `styles.css`, `index.html`.

**Replace before sharing:** every devotion uses the sample YouTube ID `dQw4w9WgXcQ`. Put your own devotional video IDs in `mockData.js` (`youtubeId`). Scripture is the King James Version (public domain). The counseling portal is spiritual encouragement, not professional care, and says so.

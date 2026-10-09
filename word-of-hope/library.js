/* Free e-books (public domain). Sections match the app pages. "g" is a Project Gutenberg ebook number; books without one open a Gutenberg search for the title,
   because the number was not confirmed. Links open on gutenberg.org; availability could not be checked from where this app was built. */
window.LIB = {
  sections: [['devotions', 'Devotions', 'devotions'], ['prayers', 'Prayer', 'prayers'], ['counsel', 'Counseling', 'counseling'], ['hope', 'Hope', 'hope'], ['bible', 'Bible study', 'bible'], ['journal', 'Journal', 'journal']],
  books: [
    { id: 'pilgrim', t: "The Pilgrim's Progress", a: 'John Bunyan', g: 131, s: ['devotions', 'hope'], d: 'The classic story of Christian\'s journey from fear to the Celestial City.' },
    { id: 'imitation', t: 'The Imitation of Christ', a: 'Thomas à Kempis', g: 1653, s: ['devotions', 'prayers'], d: 'Short, quiet chapters on humility, prayer and following Jesus.' },
    { id: 'confess', t: 'The Confessions', a: 'Saint Augustine', g: 3296, s: ['journal', 'bible'], d: 'An honest spiritual diary, written as a prayer to God.' },
    { id: 'steps', t: 'In His Steps', a: 'Charles M. Sheldon', g: 4540, s: ['devotions', 'counsel'], d: 'What would Jesus do? A story about living your faith at work and home.' },
    { id: 'ortho', t: 'Orthodoxy', a: 'G. K. Chesterton', g: 130, s: ['bible'], d: 'A witty, thoughtful case for why the Christian faith makes sense.' },
    { id: 'brotherlaw', t: 'The Practice of the Presence of God', a: 'Brother Lawrence', s: ['prayers', 'counsel', 'journal'], d: 'Finding God in ordinary work. Calm, simple and short.' },
    { id: 'steps2', t: 'Steps to Christ', a: 'Ellen G. White', s: ['counsel', 'hope'], d: 'A gentle guide to trusting Jesus, repentance, prayer and growth.' },
    { id: 'howpray', t: 'How to Pray', a: 'R. A. Torrey', s: ['prayers'], d: 'Practical teaching on praying with faith and persistence.' },
    { id: 'school', t: 'With Christ in the School of Prayer', a: 'Andrew Murray', s: ['prayers', 'devotions'], d: 'Thirty one lessons on prayer, one for each day of a month.' },
    { id: 'abide', t: 'Abide in Christ', a: 'Andrew Murray', s: ['devotions', 'counsel'], d: 'Thirty one short meditations on staying close to Jesus.' },
    { id: 'morning', t: 'Morning and Evening', a: 'Charles H. Spurgeon', s: ['devotions', 'hope', 'journal'], d: 'A devotional for every morning and every evening of the year.' },
    { id: 'treasury', t: 'The Treasury of David', a: 'Charles H. Spurgeon', s: ['bible', 'hope'], d: 'Spurgeon\'s well loved commentary on the Psalms.' },
    { id: 'grace', t: 'Grace Abounding to the Chief of Sinners', a: 'John Bunyan', s: ['counsel', 'hope', 'journal'], d: 'Bunyan\'s own story of struggle, doubt and God\'s mercy.' },
    { id: 'holywar', t: 'The Holy War', a: 'John Bunyan', s: ['bible', 'counsel'], d: 'An allegory of the battle for the human heart.' }
  ]
};
window.LIB.books.forEach(function(b){ var q = encodeURIComponent(b.t + ' ' + b.a); b.read = b.g ? 'https://www.gutenberg.org/ebooks/' + b.g : 'https://www.gutenberg.org/ebooks/search/?query=' + q; b.epub = b.g ? 'https://www.gutenberg.org/ebooks/' + b.g + '.epub3.images' : null; b.txt = b.g ? 'https://www.gutenberg.org/ebooks/' + b.g + '.txt.utf-8' : null; });

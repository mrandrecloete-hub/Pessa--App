/* Placeholder content so the app works instantly. Scripture is the King James Version (public domain).
   Swap YOUTUBE_ID values for your real devotional videos. 'dQw4w9WgXcQ' is only the sample ID you asked for. */
window.MOCK = {
  accents: [
    { name: 'Royal Blue', value: '#1B6EF3' },
    { name: 'Gold', value: '#F2A91B' },
    { name: 'Ribbon Red', value: '#D8232A' },
    { name: 'Sky Blue', value: '#38A3FF' }
  ],
  /* Books of the Bible with chapter counts (King James Version text is loaded per chapter from bible-api.com) */
  books: {
    ot: [['Genesis',50],['Exodus',40],['Leviticus',27],['Numbers',36],['Deuteronomy',34],['Joshua',24],['Judges',21],['Ruth',4],['1 Samuel',31],['2 Samuel',24],['1 Kings',22],['2 Kings',25],['1 Chronicles',29],['2 Chronicles',36],['Ezra',10],['Nehemiah',13],['Esther',10],['Job',42],['Psalms',150],['Proverbs',31],['Ecclesiastes',12],['Song of Solomon',8],['Isaiah',66],['Jeremiah',52],['Lamentations',5],['Ezekiel',48],['Daniel',12],['Hosea',14],['Joel',3],['Amos',9],['Obadiah',1],['Jonah',4],['Micah',7],['Nahum',3],['Habakkuk',3],['Zephaniah',3],['Haggai',2],['Zechariah',14],['Malachi',4]],
    nt: [['Matthew',28],['Mark',16],['Luke',24],['John',21],['Acts',28],['Romans',16],['1 Corinthians',16],['2 Corinthians',13],['Galatians',6],['Ephesians',6],['Philippians',4],['Colossians',4],['1 Thessalonians',5],['2 Thessalonians',3],['1 Timothy',6],['2 Timothy',4],['Titus',3],['Philemon',1],['Hebrews',13],['James',5],['1 Peter',5],['2 Peter',3],['1 John',5],['2 John',1],['3 John',1],['Jude',1],['Revelation',22]]
  },
  /* A short prayer for each day, shown on the dashboard with a Mark as Prayed button */
  prayers: [
    'Lord, give me peace in my heart, clarity in my mind, and strength for today\'s journey. Help me to trust You, even when I don\'t understand. Amen.',
    'Father, thank You for this new day. Guide my words and my steps, and let me be a blessing to someone today. Amen.',
    'Jesus, I bring You my worries. Take what is heavy, and fill me with Your peace. Amen.',
    'God, thank You for Your faithfulness. Help me to notice Your goodness all around me today. Amen.'
  ],
  /* One entry per day; the app picks by day of the year, so verse and devotion always match. */
  daily: [
    { ref: 'Isaiah 40:29', text: 'He giveth power to the faint; and to them that have no might he increaseth strength.', title: 'Finding Peace in the Presence of God',
      devotion: 'Life can be uncertain, but God\'s plan for you is always good. This devotion will encourage you to trust His timing, His process and His purpose for your life. When you draw near to God, you find peace that surpasses understanding, no matter what you are facing.',
      prayer: 'Lord, when I am weary, be my strength. I draw near to You today. Amen.', youtubeId: 'dQw4w9WgXcQ' },
    { ref: 'Psalm 46:1', text: 'God is our refuge and strength, a very present help in trouble.', title: 'A Very Present Help',
      devotion: 'Trouble does not arrive on a schedule, but help is already here. God is not far off waiting for you to fix things first. Today, name the thing that weighs on you and hand it over in one honest sentence of prayer.',
      prayer: 'Lord, You are near. Be my refuge today and give me strength for what is in front of me. Amen.', youtubeId: 'dQw4w9WgXcQ' },
    { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', title: 'Thoughts of Peace',
      devotion: 'When the road looks unclear, remember that God thinks about you with peace. Your story is not a mistake and it is not finished. Take one small step of trust today and leave the ending to Him.',
      prayer: 'Father, I trust Your plan for me. Give me peace for today and hope for tomorrow. Amen.', youtubeId: 'dQw4w9WgXcQ' },
    { ref: 'Isaiah 41:10', text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee.', title: 'Do Not Be Dismayed',
      devotion: 'Fear says you are alone. God says He is with you. Strength is not something you must produce, it is something He gives. Breathe slowly and repeat this promise whenever worry rises today.',
      prayer: 'God, You are with me. Strengthen me and help me, and quiet my fear. Amen.', youtubeId: 'dQw4w9WgXcQ' },
    { ref: 'Lamentations 3:22-23', text: 'It is of the LORD\'s mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.', title: 'New Every Morning',
      devotion: 'Yesterday\'s mistakes do not set today\'s mercy. Every morning comes with fresh compassion. Start this day by thanking God for one thing He has already carried you through.',
      prayer: 'Faithful God, thank You for new mercies. Help me begin again with You. Amen.', youtubeId: 'dQw4w9WgXcQ' },
    { ref: 'Proverbs 3:5-6', text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.', title: 'Lean on Him',
      devotion: 'You do not have to understand everything to walk well. Trust means leaning your weight on Someone stronger than you. Bring today\'s decisions to God before you make them.',
      prayer: 'Lord, I lean on You, not on my own understanding. Direct my paths today. Amen.', youtubeId: 'dQw4w9WgXcQ' },
    { ref: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.', title: 'Strength for Today',
      devotion: 'This verse is not about doing everything. It is about being held up in whatever God asks of you. Ask Him for strength for the task you are tempted to avoid.',
      prayer: 'Jesus, strengthen me for what You have given me to do today. Amen.', youtubeId: 'dQw4w9WgXcQ' },
    { ref: 'Matthew 11:28', text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.', title: 'Come and Rest',
      devotion: 'Rest is an invitation, not a reward. Jesus does not ask you to tidy up first. Set down your list for a few quiet minutes and simply be with Him.',
      prayer: 'Jesus, I am tired. I come to You for rest. Thank You for welcoming me. Amen.', youtubeId: 'dQw4w9WgXcQ' }
  ],
  hope: [
    { text: 'You are not alone. God is always with you, even in the silent moments.', ref: 'Deuteronomy 31:6', scene: 'sunrise' },
    { text: 'His grace is new every morning. Today is a fresh start.', ref: 'Lamentations 3:22-23', scene: 'dawn' },
    { text: 'You are loved beyond measure, before you achieve anything.', ref: 'Romans 8:38-39', scene: 'night' },
    { text: 'Peace is not the absence of storms. It is Christ standing with you in the middle of them.', ref: 'John 14:27', scene: 'sunrise' },
    { text: 'What was broken can be restored. God specializes in beginnings that look like endings.', ref: 'Joel 2:25', scene: 'meadow' },
    { text: 'Your tears are seen. Joy is coming, and God will be there when it arrives.', ref: 'Psalm 30:5', scene: 'dawn' },
    { text: 'Do not fear tomorrow. The God who carried you here will carry you through.', ref: 'Matthew 6:34', scene: 'night' },
    { text: 'You are stronger with God than you feel without Him. Take one more step.', ref: 'Philippians 4:13', scene: 'meadow' }
  ],
  counseling: [
    { id: 'anxiety', icon: '🌧️', title: 'Anxiety',
      validation: 'Feeling anxious does not mean your faith is weak. Many people who love God carry worry, and He invites you to bring it to Him just as it is.',
      anchors: [ { ref: 'Philippians 4:6-7', text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.' }, { ref: '1 Peter 5:7', text: 'Casting all your care upon him; for he careth for you.' }, { ref: 'Isaiah 41:10', text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God.' } ],
      action: 'Write your worries on paper, one per line. Beside each, write "Lord, I give this to You." Then pray over the page slowly and breathe in peace, out worry, for one minute.' },
    { id: 'grief', icon: '🕊️', title: 'Grief',
      validation: 'Grief is the price of love, and it takes the time it takes. You do not have to be strong right now. God is close to those who are hurting.',
      anchors: [ { ref: 'Psalm 34:18', text: 'The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit.' }, { ref: 'Matthew 5:4', text: 'Blessed are they that mourn: for they shall be comforted.' }, { ref: 'Revelation 21:4', text: 'And God shall wipe away all tears from their eyes.' } ],
      action: 'Light a candle or sit quietly and say the name of the one you miss. Tell God one memory you are thankful for and one pain you cannot explain. Then sit in silence for two minutes.' },
    { id: 'marriage', icon: '💍', title: 'Marriage',
      validation: 'Every marriage has hard seasons. Wanting things to be better shows you still care, and that is a good place to start.',
      anchors: [ { ref: 'Ecclesiastes 4:9-10', text: 'Two are better than one; because they have a good reward for their labour. For if they fall, the one will lift up his fellow.' }, { ref: 'Colossians 3:13-14', text: 'Forbearing one another, and forgiving one another... And above all these things put on charity, which is the bond of perfectness.' }, { ref: '1 Corinthians 13:4', text: 'Charity suffereth long, and is kind.' } ],
      action: 'Today, say one specific thing you appreciate about your spouse, out loud or in a note. Then pray for them by name for one minute, asking God to bless them, not to change them.' },
    { id: 'finance', icon: '💰', title: 'Financial Stress',
      validation: 'Money worries are heavy and they touch everything. Needing help does not make you a failure. God knows what you need.',
      anchors: [ { ref: 'Philippians 4:19', text: 'But my God shall supply all your need according to his riches in glory by Christ Jesus.' }, { ref: 'Matthew 6:26', text: 'Behold the fowls of the air: for they sow not, neither do they reap, nor gather into barns; yet your heavenly Father feedeth them. Are ye not much better than they?' }, { ref: 'Proverbs 3:5-6', text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.' } ],
      action: 'List what you owe and what you have, honestly, on one page. Pray over it, then choose one small practical step for this week, such as calling a creditor or making a simple budget.' },
    { id: 'loneliness', icon: '🤍', title: 'Loneliness',
      validation: 'Feeling alone is painful, even in a crowd. You are not strange for feeling this way, and you are not truly alone.',
      anchors: [ { ref: 'Deuteronomy 31:6', text: 'He will not fail thee, nor forsake thee.' }, { ref: 'Psalm 68:6', text: 'God setteth the solitary in families.' }, { ref: 'Matthew 28:20', text: 'And, lo, I am with you alway, even unto the end of the world.' } ],
      action: 'Reach out to one person today with a short message, even just "thinking of you". Then spend five minutes telling God honestly how lonely you feel and asking Him to bring a friend.' },
    { id: 'depression', icon: '☁️', title: 'Depression',
      validation: 'Deep sadness is real and heavy, and it is not a sign of weak faith. Many people of faith, in the Bible and today, have walked through dark valleys. Please also talk to a doctor or counselor you trust. Seeking help is wise.',
      anchors: [ { ref: 'Psalm 42:11', text: 'Why art thou cast down, O my soul? and why art thou disquieted within me? hope thou in God: for I shall yet praise him, who is the health of my countenance, and my God.' }, { ref: 'Psalm 147:3', text: 'He healeth the broken in heart, and bindeth up their wounds.' }, { ref: 'Psalm 40:1-2', text: 'I waited patiently for the LORD; and he inclined unto me, and heard my cry. He brought me up also out of an horrible pit... and set my feet upon a rock.' } ],
      action: 'Do one small kind thing for yourself today: a short walk, a glass of water, daylight. Tell one trusted person how you really feel, and pray the words of Psalm 42:11 once, slowly.' },
    { id: 'fear', icon: '🛡️', title: 'Fear',
      validation: 'Fear is a natural response to things that feel bigger than you. Courage does not mean having no fear. It means taking the next step with God.',
      anchors: [ { ref: 'Psalm 23:4', text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me.' }, { ref: '2 Timothy 1:7', text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.' }, { ref: 'Joshua 1:9', text: 'Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.' } ],
      action: 'Name your fear in one sentence. Then write the opposite as a promise, for example "God is with me in this." Read the promise aloud three times and carry it with you today.' },
    { id: 'guilt', icon: '🌿', title: 'Guilt and Forgiveness',
      validation: 'Carrying guilt is exhausting. Feeling sorry shows a tender heart, and God offers forgiveness freely, not reluctantly.',
      anchors: [ { ref: '1 John 1:9', text: 'If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.' }, { ref: 'Psalm 103:12', text: 'As far as the east is from the west, so far hath he removed our transgressions from us.' }, { ref: 'Romans 8:1', text: 'There is therefore now no condemnation to them which are in Christ Jesus.' } ],
      action: 'Confess to God plainly what you regret, without excuses. Then say aloud "I am forgiven." If someone else was hurt, write down one way you can make it right this week.' },
    { id: 'weary', icon: '🌙', title: 'Weariness',
      validation: 'Being worn out is not laziness. You have been carrying a lot. Rest is something God wants for you, not something you must earn.',
      anchors: [ { ref: 'Matthew 11:28', text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.' }, { ref: 'Isaiah 40:31', text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary.' }, { ref: 'Psalm 121:1-2', text: 'My help cometh from the LORD, which made heaven and earth.' } ],
      action: 'Choose one thing you can put down this week and let it go. Take ten quiet minutes today with no phone, and simply say to God, "I am tired. Be my strength."' }
  ]
};

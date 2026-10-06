/* Course content for Pesa Training (Theory and practical). Edit this file, then run: python3 tools/embed_courses.py
   Wording rule for the whole app: no dashes. Use full stops, commas and the word "to". */
var COURSES = [
{
  id:"cs101", code:"CS101", title:"Customer Service Excellence", level:"Beginner", hours:6, who:"all", color:"#0B7A5C",
  summary:"A practical course for everyone who serves customers: greeting, listening, understanding needs, handling complaints and building loyal customers.",
  outcomes:["Explain why customer service decides whether a shop grows or fails","Greet, present yourself and speak to customers in a professional way","Listen well and ask questions that find out what the customer needs","Handle complaints and difficult customers calmly, using a clear method","Handle money, queues and messages with honesty and care"],
  modules:[
  { id:"m1", title:"Why customer service matters", mins:50,
    reading:[
      {h:"Service is part of what you sell", p:["When a customer walks into a shop, they are buying more than a product. They are buying the way they are treated. In most towns a customer can find similar goods at two or three shops. What they remember, and what brings them back, is whether they felt welcome, respected and helped.","A customer who feels respected comes back, brings family and tells neighbours. A customer who feels ignored takes their money to the shop next door and tells people why. In Namibia, where communities are close and news travels fast on WhatsApp and Facebook groups, your reputation is built one customer at a time."]},
      {h:"Moments of truth", p:["Every contact between a customer and your business is a moment of truth, a chance to impress or to disappoint. Think of the whole journey: seeing the shop from outside, walking in, being greeted, finding the product, asking a question, paying, getting a receipt and leaving.","A shop can do nine of these things well and lose the customer on the tenth. Good service means paying attention to every step, not only the sale itself."]},
      {h:"What a lost customer costs", p:["Imagine a regular customer who spends N$150 a week with you. Over a year that is N$7,800. Over five years it is N$39,000. If one rude moment makes that customer leave, the shop has not lost N$150. It has lost thousands, plus every friend that customer would have sent.","Winning a new customer costs far more effort than keeping an old one. That is why looking after existing customers is the cheapest and surest way to grow."]},
      {h:"Internal customers", p:["Your colleagues are customers too. The cashier depends on the stock clerk for products on the shelf. The stock clerk depends on the manager for clear orders. When people inside the shop help each other well, customers feel the difference without knowing why."]}
    ],
    slides:[
      {t:"What is customer service?", pts:["Everything you do before, during and after a sale","Helping the customer get what they need","Treating every person with respect","Making it easy to buy from you"]},
      {t:"Why it matters in a small shop", pts:["Customers have a choice of where to spend","People remember how they were treated","Word of mouth spreads fast on WhatsApp","Good service costs little and earns a lot"]},
      {t:"Moments of truth", pts:["Seeing the shop","The greeting","Finding the product","Asking for help","Paying and receipt","Saying goodbye"]},
      {t:"The cost of a lost customer", pts:["N$150 a week is N$7,800 a year","Over five years it is N$39,000","One bad moment can lose all of it","Keeping a customer is cheaper than finding a new one"]},
      {t:"Internal customers", pts:["Colleagues depend on each other","Help your team the way you help customers","Good teamwork shows at the till"]},
      {t:"Key points", pts:["Service is part of the product","Every contact matters","Look after the customers you already have"]}
    ],
    practical:{ title:"Walk the customer path", intro:"Do this during a quiet time at work, or on your next visit to any shop as a customer.", tasks:["Walk through your shop the way a customer does, from outside the door to the till.","Write down five moments of truth you find along the way.","Give each moment a mark from 1 (poor) to 5 (excellent).","Choose the lowest mark and decide one small thing you can do this week to improve it."], reflect:"Which moment will you improve this week, and what exactly will you do?" },
    quiz:[
      {q:"What do customers remember most about a shop?", o:["The colour of the walls","How they were treated","The name on the sign","The shop’s opening date"], a:1, why:"Customers can often buy similar goods elsewhere. How they were treated is what they remember and what brings them back."},
      {q:"A regular customer spends N$150 a week. About how much is that in a year?", o:["N$1,500","N$3,000","N$7,800","N$15,000"], a:2, why:"N$150 multiplied by 52 weeks is N$7,800."},
      {q:"What is a moment of truth?", o:["A time the manager checks the till","Any contact where a customer forms an opinion of the business","A refund","A staff meeting"], a:1, why:"Each contact is a chance to impress or disappoint."},
      {q:"Who are your internal customers?", o:["Only people who pay","Your colleagues who depend on your work","The shop’s suppliers only","Nobody"], a:1, why:"Colleagues depend on each other, and good teamwork shows in the service customers receive."}
    ],
    exam:[
      {q:"Why is keeping an existing customer usually better than finding a new one?", o:["It costs less effort and the customer already trusts you","New customers never pay","Old customers always spend more","It is the law"], a:0, why:"Winning a new customer takes far more effort than looking after one you already have."},
      {q:"One rude moment at the till can cost the shop:", o:["Nothing, the product was sold","Only that one sale","Years of sales and the customer’s friends","Only the cashier’s job"], a:2, why:"The loss includes all future sales and the people that customer would have sent."}
    ]},
  { id:"m2", title:"First impressions and professional presentation", mins:50,
    reading:[
      {h:"The first ten seconds", p:["People form an opinion about you and your shop within seconds. A warm greeting in the first ten seconds, with a smile and eye contact, tells the customer they are welcome. Say something simple: “Good morning, welcome to our shop. How can I help you today?”","Do not wait for the customer to speak first. Even if you are busy with another customer, look up, smile and say, “I will be with you in a moment.” This small act stops people feeling ignored."]},
      {h:"How you look and how your workplace looks", p:["Be clean, neat and ready to work. Wear your uniform or clothes that suit the job. Keep your hands clean, especially if you handle food. A tidy till area, clean counter and well arranged shelves tell customers that the business is careful and can be trusted with their money.","Keep your phone away while you serve. Looking at a screen while a customer is talking is one of the quickest ways to show you do not care."]},
      {h:"Body language and tone", p:["Customers read your body before they hear your words. Stand or sit upright, keep your arms uncrossed and face the customer. Nod to show you are listening. Avoid sighing, rolling your eyes or looking past the person.","Your tone matters as much as your words. The same sentence can sound friendly or rude depending on how it is said. Speak clearly, at a calm pace, and smile. A smile can be heard, even on the phone."]},
      {h:"Phone and WhatsApp manners", p:["Answer calls quickly and say the shop name and your name. Speak slowly and write down the message if you must pass it on. On WhatsApp, greet first, write in full and polite sentences, reply within the time you promise and never share another customer’s details.","Respect language and culture. Namibia has many languages. Learn a greeting in the languages your customers speak by asking a colleague to teach you. Even one word shows respect."]}
    ],
    slides:[
      {t:"The first ten seconds", pts:["Look up and smile","Make eye contact","Greet with the shop name","If busy, say “I will be with you in a moment”"]},
      {t:"Look ready to serve", pts:["Neat, clean and in uniform","Clean hands and a tidy counter","Phone away while serving"]},
      {t:"Body language", pts:["Upright, open and facing the customer","Nod to show you listen","Do not sigh, roll eyes or look past people"]},
      {t:"Tone of voice", pts:["Calm, clear and friendly","A smile can be heard","Same words, different tone, different message"]},
      {t:"Phone and WhatsApp", pts:["Answer quickly, say shop and your name","Greet and write polite full sentences","Reply when you promised","Protect customer privacy"]},
      {t:"Respect every culture", pts:["Learn greetings in your customers’ languages","Never mock accents or languages","Treat everyone the same"]}
    ],
    practical:{ title:"Greeting practice", intro:"Practise with a colleague or friend, then use it on real customers during your shift.", tasks:["Practise your greeting out loud three times, with a smile and eye contact.","Ask a colleague to watch your body language for five minutes and tell you one thing to improve.","Greet every customer in the first ten seconds for one full shift.","Ask a colleague to teach you a greeting in another language your customers speak."], reflect:"What did customers do when you greeted them within ten seconds? What will you keep doing?" },
    quiz:[
      {q:"Within how many seconds should a customer be greeted?", o:["About ten","Sixty","Five minutes","Only after they speak"], a:0, why:"A greeting in the first ten seconds tells the customer they are welcome."},
      {q:"You are busy with one customer and another walks in. What is best?", o:["Ignore them until you finish","Look up, smile and say you will be with them in a moment","Ask them to come back later","Wave them away"], a:1, why:"A quick acknowledgement stops people feeling ignored."},
      {q:"Which body language shows you are listening?", o:["Arms crossed and looking at your phone","Facing the person, upright, nodding","Looking past them","Sighing"], a:1, why:"Open posture, eye contact and nodding show attention."},
      {q:"On WhatsApp with a customer you should:", o:["Reply in short rude words","Greet, write polite full sentences and reply when you promised","Share their details with friends","Ignore messages after closing time"], a:1, why:"Polite, reliable messages build trust and protect privacy."}
    ],
    exam:[
      {q:"Why keep your phone away while serving?", o:["It uses battery","It shows the customer you do not care","The manager is watching","Phones are not allowed"], a:1, why:"Looking at a screen while a customer speaks quickly tells them they are not important."},
      {q:"A good way to respect language and culture is to:", o:["Ignore other languages","Learn a greeting in the languages your customers speak","Only speak to people who speak your language","Laugh at accents"], a:1, why:"Even one word in their language shows respect."}
    ]},
  { id:"m3", title:"Communication and listening", mins:55,
    reading:[
      {h:"Listening is the main skill", p:["Most service problems start when we do not listen. Active listening means giving the customer your full attention, letting them finish without interrupting and showing that you understood. Look at the person, nod and put other tasks aside.","After they speak, say back what you heard in your own words: “So you need a battery for a remote control, and you want it to last long. Is that right?” This is called paraphrasing and it prevents mistakes."]},
      {h:"Asking good questions", p:["Open questions start with words like what, which, how or when. They get the customer talking: “What will you use it for?” Closed questions get a yes or no: “Is it for cooking?” Use open questions to find out the need, then closed questions to confirm details.","Ask one question at a time and wait for the answer. Do not ask so many questions that the customer feels questioned by the police."]},
      {h:"Speaking clearly", p:["Use simple words that the customer understands. Avoid shop jargon, technical terms and short forms they may not know. Speak at a steady pace and a normal volume. If a customer speaks another language, find a colleague who can help, rather than guess.","Say what you can do, not only what you cannot. Instead of “We do not have that,” say “We do not have that today, but I can order it for you for Thursday, or show you a similar one.”"]},
      {h:"Written and digital messages", p:["Messages should be short, polite and complete. Include the product, price and when it will be ready. Read the message again before you send it. Never write in capital letters, which look like shouting."]}
    ],
    slides:[
      {t:"Active listening", pts:["Give full attention","Do not interrupt","Nod and keep eye contact","Put other tasks aside"]},
      {t:"Say it back", pts:["Paraphrase what you heard","Check you understood","Prevents mistakes and wasted time"]},
      {t:"Open and closed questions", pts:["Open: what, which, how, when","Closed: yes or no","Open to find the need","Closed to confirm"]},
      {t:"Speak simply", pts:["Everyday words, no jargon","Steady pace, normal volume","Get help when language is a barrier"]},
      {t:"Say what you CAN do", pts:["Not: “We do not have it”","But: “I can order it for Thursday”","Offer an option every time"]},
      {t:"Messages", pts:["Short, polite and complete","Product, price and time","No capital letters"]}
    ],
    practical:{ title:"Listen and repeat", intro:"Use this with customers or with a friend who plays the customer.", tasks:["With three customers, repeat back what they asked for before you act.","Ask each customer at least one open question about what they need.","Replace one “We do not have it” with an option you can offer.","Write down one time that listening properly stopped a mistake."], reflect:"Describe one conversation where listening and repeating back helped the customer." },
    quiz:[
      {q:"What does paraphrasing mean?", o:["Repeating what you heard in your own words to check it","Talking louder","Writing it down only","Changing the subject"], a:0, why:"Saying it back checks that you understood."},
      {q:"Which is an open question?", o:["Is it for cooking?","Do you want the large one?","What will you use it for?","Is that all?"], a:2, why:"Open questions begin with what, which, how or when and make the customer talk."},
      {q:"A customer asks for an item you do not have. Best reply?", o:["We do not have it.","Come back next week.","We do not have it today, but I can order it or show you a similar one.","Why do you want that?"], a:2, why:"Say what you can do, and offer options."},
      {q:"Writing a message in capital letters:", o:["Is polite","Looks like shouting","Is faster to read","Is required"], a:1, why:"Capital letters read as shouting."}
    ],
    exam:[
      {q:"Why avoid shop jargon with customers?", o:["Customers may not understand it","It is illegal","It is slow","It costs money"], a:0, why:"Simple everyday words make sure the customer understands."},
      {q:"Which shows active listening?", o:["Interrupting to save time","Looking at your phone","Letting them finish, nodding and repeating back","Answering before they ask"], a:2, why:"Full attention, no interrupting and checking understanding."}
    ]},
  { id:"m4", title:"Understanding customer needs and product knowledge", mins:55,
    reading:[
      {h:"Needs and wants", p:["A need is the problem a customer wants solved. A want is the specific thing they think will solve it. A customer may ask for the cheapest paint, but the need is a wall that stays dry in the rainy season. When you understand the need, you can recommend something that really helps and the customer trusts you for it.","Ask what the product is for, who will use it and how often. Then recommend the best fit, not the most expensive item."]},
      {h:"Know your products", p:["You cannot help with something you do not know. Learn what you sell: what it is, what it costs, where it is on the shelf, what it goes with and what the alternatives are. Read labels and ask the owner or supplier when you are unsure.","If you do not know the answer, say so honestly and find out: “Let me check that for you.” Customers respect honesty far more than a wrong answer."]},
      {h:"Recommending and honest extra sales", p:["Suggesting an extra item is good service when it truly helps. A customer buying a phone cover may also need a screen protector. Mention it once, politely, and accept the answer. Never pressure people to buy what they do not need. A customer who feels pushed does not come back.","Offer choices, such as a good, better and best option, and explain the difference in price and value."]},
      {h:"Follow up", p:["Good service continues after the sale. If you promised to order an item, tell the customer when it arrives. If a customer bought something new, ask next time how it is working. Small follow ups show that you care and bring people back."]}
    ],
    slides:[
      {t:"Need or want?", pts:["Need: the problem to solve","Want: the item they have in mind","Find the need, then recommend"]},
      {t:"Ask the right things", pts:["What is it for?","Who will use it?","How often?","What is your budget?"]},
      {t:"Know what you sell", pts:["Price and place on the shelf","What it goes with","The alternatives","Ask when unsure"]},
      {t:"If you do not know", pts:["Say so honestly","“Let me check that for you”","Find the right answer"]},
      {t:"Honest extra sales", pts:["Suggest only what truly helps","Mention once, politely","Accept no for an answer"]},
      {t:"Follow up", pts:["Tell customers when orders arrive","Ask how it is working","Small effort, loyal customers"]}
    ],
    practical:{ title:"Product knowledge check", intro:"Do this during a quiet time with the stock in front of you.", tasks:["Pick five products that customers often ask about.","For each one, write the price, where it is, one benefit and one alternative.","Ask a colleague to quiz you on those five.","Make one honest suggestion to a customer this week and note their response."], reflect:"What did you learn about your products that you did not know before?" },
    quiz:[
      {q:"A customer asks for the cheapest paint. What is likely their real need?", o:["To spend as little as possible no matter what","A finish that lasts and solves their wall problem at a fair price","To talk to you","Nothing"], a:1, why:"Look behind the request to the problem they want solved."},
      {q:"You do not know the answer to a question. Best action?", o:["Guess","Say “Let me check that for you” and find out","Say you do not know and walk away","Change the subject"], a:1, why:"Honest checking builds trust."},
      {q:"An honest extra sale means:", o:["Pushing the most expensive item","Suggesting something that truly helps, once, and accepting no","Hiding prices","Selling anything"], a:1, why:"Helpful, polite suggestions without pressure."},
      {q:"Why follow up after a sale?", o:["It wastes time","It shows care and brings customers back","It is not allowed","Nobody likes it"], a:1, why:"Follow ups build loyalty."}
    ],
    exam:[
      {q:"Which question helps find the customer’s need?", o:["What will you use it for?","Are you sure?","Is that all?","Do you have money?"], a:0, why:"It opens the conversation about the real need."},
      {q:"Offering good, better and best options helps because:", o:["The customer can choose what suits their budget and need","It hides prices","It confuses people","It is quicker"], a:0, why:"Choices respect the customer’s decision and budget."}
    ]},
  { id:"m5", title:"Handling complaints and difficult customers", mins:60,
    reading:[
      {h:"A complaint is a gift", p:["Most unhappy customers never complain. They just leave and tell others. A customer who complains is giving you a chance to fix the problem and keep their business. Research on service shows that customers whose complaint is solved well often become more loyal than those who never had a problem.","Do not take complaints personally. The customer is upset about a product or situation, not about you as a person."]},
      {h:"The LAST method", p:["Use four steps. L is for Listen: let the customer explain without interrupting and show you understand. A is for Apologise: say sorry for the problem or the inconvenience, even if it was not your fault. S is for Solve: offer a solution, or two options, and do it quickly. T is for Thank: thank the customer for telling you and for their patience.","For example: “I am sorry the bread was stale. Thank you for telling me. I can replace it now or give you a refund. Which do you prefer?”"]},
      {h:"Staying calm", p:["When a customer is angry, breathe slowly, lower your voice and speak slowly. Never argue, blame the customer or blame a colleague. Use the customer’s name. Stand at the same level and keep a respectful distance. A calm voice calms the other person.","Do not promise what you cannot do. If you need the manager, say so politely: “Let me ask my manager so that I can help you properly.”"]},
      {h:"Know your limits and stay safe", p:["Know the shop’s policy on refunds, exchanges and repairs, and what you may decide yourself. Hand over to the manager when a request is outside your authority. If a customer threatens you or becomes violent, step back, do not argue, call the manager or security and protect yourself and others. No sale is worth your safety."]}
    ],
    slides:[
      {t:"A complaint is a gift", pts:["Most unhappy customers just leave","A complaint gives you a second chance","A solved problem can build loyalty"]},
      {t:"LAST: Listen", pts:["Let them explain fully","No interrupting","Show you understand"]},
      {t:"LAST: Apologise", pts:["Say sorry for the problem","Even if it is not your fault","Sound sincere"]},
      {t:"LAST: Solve", pts:["Offer a solution or two options","Act quickly","Do what you promised"]},
      {t:"LAST: Thank", pts:["Thank them for telling you","Thank them for patience","End on a positive note"]},
      {t:"Stay calm and safe", pts:["Slow breath, low voice","Do not argue or blame","Know your limits and call the manager","Safety comes first"]}
    ],
    practical:{ title:"Role play a complaint", intro:"Do this with a colleague who plays the unhappy customer. Then swap.", tasks:["Pick a real type of complaint from your shop, such as a wrong price, a faulty item or a long wait.","Role play it using LAST. The colleague must be a little difficult.","Ask your colleague how calm and respectful you sounded, from 1 to 5.","Write down the shop’s refund and exchange rules in your own words, and who to call when you cannot decide."], reflect:"Which part of LAST do you find hardest, and how will you practise it?" },
    quiz:[
      {q:"What does LAST stand for?", o:["Look, Ask, Sell, Tell","Listen, Apologise, Solve, Thank","Leave, Argue, Shout, Talk","Learn, Act, Smile, Trade"], a:1, why:"Listen, Apologise, Solve, Thank."},
      {q:"A customer is shouting about a faulty item. What first?", o:["Shout back","Listen calmly without interrupting","Walk away","Blame a colleague"], a:1, why:"Listening first calms the situation."},
      {q:"You cannot approve a refund yourself. Best action?", o:["Refuse rudely","Say you will ask the manager so you can help properly","Ignore the customer","Give the money from the till"], a:1, why:"Know your limits and hand over politely."},
      {q:"A customer becomes violent. What do you do?", o:["Argue back","Step back, call the manager or security and protect yourself","Take the customer’s phone","Lock them in"], a:1, why:"Safety comes first."}
    ],
    exam:[
      {q:"Why apologise even when it was not your fault?", o:["To admit guilt in court","To show you care about the customer’s problem","Because the manager says so","It is never needed"], a:1, why:"You are sorry the customer had a problem, which shows care."},
      {q:"Most unhappy customers:", o:["Always complain loudly","Say nothing and just leave","Return the next day","Call the police"], a:1, why:"That is why a complaint is a chance to fix the problem."}
    ]},
  { id:"m6", title:"Service in practice: money, queues and loyalty", mins:60,
    reading:[
      {h:"Handling money with honesty", p:["Customers trust you with their money. Count change aloud and hand it back with the receipt. Check notes if your shop policy asks you to. Never put a customer’s money in your pocket, even for a moment. Always enter the sale in the till or in Pesa so that records are true.","Make sure the price you charge is the price the customer was shown. If you notice a mistake, fix it and explain politely. Honest mistakes handled openly build trust."]},
      {h:"Busy times and queues", p:["Queues are the most common cause of frustration. Acknowledge waiting customers with a smile, work steadily, and ask a colleague to open another till if the queue grows. Say thank you for waiting. Tidy as you go so that the next customer has a clean counter.","Never serve friends or family first while others wait. Everyone in the queue is a customer."]},
      {h:"After the sale", p:["Give a receipt, say thank you and invite the customer back. Explain any return or warranty rules. If something was ordered, write down the customer’s name and number, and tell them when it arrives.","Keep customer information private. Phone numbers and credit balances are not for sharing with anyone else."]},
      {h:"Building loyalty", p:["Remember regular customers by name, their usual items and their preferences. Use the loyalty features in Pesa to reward them. Say thank you for their business. Ask for feedback and act on what they tell you.","Good service is a habit. Repeat the basics every day: greet, listen, help, thank. Do this and customers will choose you."]}
    ],
    slides:[
      {t:"Money with honesty", pts:["Count change aloud","Give a receipt","Never pocket money","Enter every sale"]},
      {t:"Correct prices", pts:["Charge the price shown","Fix mistakes openly","Explain politely"]},
      {t:"Queues", pts:["Acknowledge waiting customers","Ask for help before the queue is long","Thank people for waiting","No queue jumping for friends"]},
      {t:"After the sale", pts:["Receipt and thank you","Explain returns and warranty","Write down orders"]},
      {t:"Privacy", pts:["Do not share phone numbers or balances","Protect customer information"]},
      {t:"Build loyalty", pts:["Remember names and favourites","Use loyalty rewards","Ask for feedback","Greet, listen, help, thank"]}
    ],
    practical:{ title:"My service promise", intro:"Finish the course by writing your own promise and using it.", tasks:["Write a service promise of three sentences that you will keep every shift.","Count change aloud for every cash sale for one full shift.","Greet and thank every customer in the queue for one busy period.","Ask three regular customers what you could do better, and write down what they say."], reflect:"Write your three sentence service promise here." },
    quiz:[
      {q:"What should you do with change?", o:["Hand it over quickly without counting","Count it aloud and hand it back with the receipt","Keep small coins","Leave it on the counter"], a:1, why:"Counting aloud builds trust and prevents mistakes."},
      {q:"A friend walks in while others are waiting. You should:", o:["Serve the friend first","Serve people in order","Close the till","Ask the friend to wait outside"], a:1, why:"Everyone in the queue is a customer."},
      {q:"Customer phone numbers and balances should be:", o:["Shared with friends","Kept private","Posted online","Written on the counter"], a:1, why:"Protect customer information."},
      {q:"Which helps build loyalty?", o:["Remembering names and usual items","Ignoring feedback","Raising prices","Closing early"], a:0, why:"Personal service makes customers feel valued."}
    ],
    exam:[
      {q:"You notice you charged the wrong price. What is best?", o:["Say nothing","Fix it and explain politely","Blame the customer","Hide the receipt"], a:1, why:"Honest mistakes handled openly build trust."},
      {q:"How should you treat a long queue?", o:["Ignore it","Acknowledge people, work steadily and ask for help","Leave the till","Close the shop"], a:1, why:"Acknowledging and acting reduces frustration."}
    ]}
  ]
},
{
  id:"sa101", code:"SA101", title:"Personal Effectiveness and Time Management", level:"Beginner", hours:3, who:"all", color:"#3B82F6",
  summary:"Set clear goals, plan your day, use your time well and keep learning. A short self advancement course for every member of staff.",
  outcomes:["Set clear, realistic goals","Sort tasks into urgent and important","Plan a work day and avoid common time wasters","Build habits for learning and growing at work"],
  modules:[
  { id:"m1", title:"Goals and priorities", mins:50,
    reading:[
      {h:"Why goals matter", p:["People who know where they want to go, get there faster. A goal turns a wish into a plan. “I want to earn more” is a wish. “I will learn to run the till without help and ask for a supervisor role by June” is a goal.","Good goals are SMART: Specific, Measurable, Achievable, Realistic and Timed. Write them down. A goal that is written is far more likely to happen."]},
      {h:"Urgent and important", p:["Not everything that is urgent is important, and not everything important is urgent. Urgent tasks demand attention now, like a ringing phone. Important tasks move you toward your goals, like learning a new skill.","Do important and urgent tasks first. Plan important but not urgent tasks into your week. Delegate or limit urgent but not important tasks. Drop tasks that are neither."]},
      {h:"Breaking a goal into steps", p:["Large goals are easier when split into small steps. Write the next three steps and the date for each. Check your progress each week and celebrate small wins."]}
    ],
    slides:[
      {t:"Goals turn wishes into plans", pts:["A wish: I want to earn more","A goal: a clear action and a date"]},
      {t:"SMART goals", pts:["Specific","Measurable","Achievable","Realistic","Timed"]},
      {t:"Urgent and important", pts:["Urgent and important: do now","Important, not urgent: plan it","Urgent, not important: limit or delegate","Neither: drop it"]},
      {t:"Small steps", pts:["Split big goals","Write three next steps with dates","Review weekly"]}
    ],
    practical:{ title:"My first SMART goal", intro:"Spend ten minutes on this.", tasks:["Write one work goal for the next three months.","Check it against SMART and rewrite it if needed.","Write three steps with a date for each.","Share your goal with a colleague or supervisor."], reflect:"Write your SMART goal here." },
    quiz:[
      {q:"What does the S in SMART stand for?", o:["Simple","Specific","Sales","Soon"], a:1, why:"Specific."},
      {q:"A task that is important but not urgent should be:", o:["Dropped","Planned into your week","Done in a rush","Ignored"], a:1, why:"Planning important tasks stops them becoming emergencies."},
      {q:"Which is a goal rather than a wish?", o:["I want to be rich","I will learn the stock system and count stock without help by March","Things should be better","I hope for a raise"], a:1, why:"It is specific and has a date."}
    ],
    exam:[{q:"Why write goals down?", o:["It looks neat","Written goals are more likely to happen","It is a rule","Nobody checks"], a:1, why:"Writing makes the goal clear and easier to follow."}]},
  { id:"m2", title:"Managing your time at work", mins:55,
    reading:[
      {h:"Plan your day", p:["Spend five minutes at the start of each shift deciding what must be done. Write a short list with the most important task at the top. Do the hardest or most important task when you are fresh. Tick off tasks as you finish them.","Plan for the unexpected by leaving gaps. A day packed with no space for surprises falls apart at the first problem."]},
      {h:"Common time wasters", p:["The biggest time wasters at work are phones, chatting during busy periods, searching for things that have no fixed place, starting tasks and not finishing and saying yes to everything. Put your phone away, give every item a place and finish one task before starting another.","Arriving on time is part of managing time. Being late costs you respect and costs the shop money."]},
      {h:"Working with others", p:["Tell colleagues what you will finish and by when. Ask for help early rather than late. Keep promises on deadlines, and if you cannot, say so before the deadline passes."]}
    ],
    slides:[
      {t:"Plan your shift", pts:["Five minutes at the start","Short list, important first","Leave gaps for surprises"]},
      {t:"Time wasters", pts:["Phone","Chatting in busy periods","Searching for things","Starting and not finishing"]},
      {t:"Be on time", pts:["Late costs respect and money","Plan to arrive early"]},
      {t:"Teamwork", pts:["Say what you will do and when","Ask for help early","Warn before a deadline is missed"]}
    ],
    practical:{ title:"A planned shift", intro:"Use a notebook or your phone notes.", tasks:["At the start of your next shift, write your list of tasks with the most important on top.","Tick tasks off as you finish them.","At the end, write what you finished, what was left and why.","Choose one time waster to reduce next week."], reflect:"What was the biggest difference when you planned your shift?" },
    quiz:[
      {q:"When should you do the most important task?", o:["Last","When you are fresh and ready","Never","When the manager shouts"], a:1, why:"You do your best work when fresh."},
      {q:"Which is a common time waster?", o:["Writing a task list","Looking at your phone during work","Arriving on time","Finishing a task"], a:1, why:"Phones interrupt work."},
      {q:"If you may miss a deadline, you should:", o:["Say nothing","Tell people before the deadline passes","Blame others","Leave work"], a:1, why:"Early warning lets others plan."}
    ],
    exam:[{q:"Why leave gaps in your plan?", o:["To rest all day","Surprises will happen and you need room for them","It is a rule","To avoid work"], a:1, why:"Gaps keep the day from falling apart."}]},
  { id:"m3", title:"Growing yourself at work", mins:50,
    reading:[
      {h:"Learn every day", p:["The people who grow fastest are the ones who keep learning. Ask questions, watch people who are good at their jobs and read, even a little each day. Free courses and short videos can teach valuable skills on your phone.","Learning is not only for school. Each new skill makes you more useful and gives you more choices."]},
      {h:"Using feedback", p:["Feedback is information that helps you improve. Ask your supervisor, “What is one thing I can do better?” Listen without defending yourself, say thank you and try the suggestion. Feedback that feels uncomfortable is often the most useful."]},
      {h:"Attitude and teamwork", p:["A positive attitude is a choice. Come to work ready to help, speak politely and solve problems instead of complaining. People notice who is reliable and who helps others, and those people get chances to grow."]}
    ],
    slides:[
      {t:"Keep learning", pts:["Ask questions","Watch the best at work","Free courses on your phone"]},
      {t:"Use feedback", pts:["Ask: what can I do better?","Listen without defending","Say thank you and try it"]},
      {t:"Attitude", pts:["Be reliable","Be polite","Solve problems, do not only complain"]}
    ],
    practical:{ title:"A feedback conversation", intro:"Be brave. It gets easier.", tasks:["Ask your supervisor or a trusted colleague, “What is one thing I can do better?”","Listen, say thank you and write the answer down.","Try it for one week.","Choose one free course from the Free courses list in Training to start."], reflect:"What feedback did you receive and what will you change?" },
    quiz:[
      {q:"When you get feedback you should:", o:["Argue","Listen, thank the person and try the suggestion","Ignore it","Complain to others"], a:1, why:"Feedback helps you improve."},
      {q:"Which is a way to keep learning?", o:["Never ask questions","Ask questions and watch people who are good at the job","Wait for the manager to teach you everything","Skip training"], a:1, why:"Curiosity builds skill."},
      {q:"A positive attitude is:", o:["Something you are born with","A choice you make each day","Not important","Only for managers"], a:1, why:"You can choose it."}
    ],
    exam:[{q:"Why is uncomfortable feedback often useful?", o:["It points to something you can improve","It is always wrong","It means you are fired","It is only opinion"], a:0, why:"It shows what to work on."}]}
  ]
},
{
  id:"sa102", code:"SA102", title:"Money Skills for Work and Life", level:"Beginner", hours:3, who:"all", color:"#E8A21E",
  summary:"Understand your pay, make a simple budget, save a little and stay safe from debt traps and scams. A short self advancement course for every member of staff.",
  outcomes:["Read a payslip and tell gross pay from net pay","Make a simple monthly budget","Start an emergency saving habit","Recognise costly debt and common money scams"],
  modules:[
  { id:"m1", title:"Understanding your pay", mins:50,
    reading:[
      {h:"Gross pay and net pay", p:["Gross pay is the full amount you earn before anything is taken off. Net pay is what you receive after deductions such as tax and social security contributions. Your payslip shows both. Always check that the hours, rate and deductions are correct.","If something looks wrong, ask politely and early. Keep your payslips in a safe place."]},
      {h:"Other money from work", p:["Some staff also earn commission, bonuses, allowances or tips. Know which are guaranteed and which change from month to month. Do not plan your budget around money that is not certain."]},
      {h:"Know your pay day", p:["Know the date you are paid and how: bank or cash. Plan expenses around it. Rent, transport and food come first."]}
    ],
    slides:[
      {t:"Gross and net", pts:["Gross: before deductions","Net: what you receive","Check both on your payslip"]},
      {t:"Other earnings", pts:["Commission and bonuses","Allowances","Tips","Not all are guaranteed"]},
      {t:"Pay day planning", pts:["Know the date","Cover rent, transport and food first","Keep payslips safe"]}
    ],
    practical:{ title:"Read your payslip", intro:"Use your latest payslip, or the sample payslip from the Payroll page if you have none.", tasks:["Find your gross pay, deductions and net pay.","Check the hours or days worked and the rate.","Write down which parts of your income are not guaranteed.","Ask your manager about anything that is unclear."], reflect:"What did you learn from your payslip that you had not noticed before?" },
    quiz:[
      {q:"Net pay is:", o:["Pay before deductions","What you receive after deductions","A bonus","A loan"], a:1, why:"Net is what is left after deductions."},
      {q:"You see a mistake on your payslip. What do you do?", o:["Ignore it","Ask politely and early","Shout at the manager","Quit"], a:1, why:"Early, polite questions fix errors."},
      {q:"Which income is least certain?", o:["Basic monthly salary","Tips","Agreed allowance","Agreed hourly rate"], a:1, why:"Tips change from day to day."}
    ],
    exam:[{q:"Why keep your payslips?", o:["To prove what you earned and check mistakes","To decorate","They have no use","To lend to others"], a:0, why:"They are proof of pay and help you spot errors."}]},
  { id:"m2", title:"Budgeting and saving", mins:55,
    reading:[
      {h:"A simple budget", p:["A budget is a plan for your money. Write your income at the top, then list what you must pay (needs), what you would like (wants) and what you save. A common guide is about half for needs, about a third for wants and the rest for saving. Your numbers may differ, so adjust.","Track your spending for a month. Most people are surprised by how many small purchases add up."]},
      {h:"Saving a little each month", p:["Start with a small emergency fund. Aim first for one month of basic costs, then more. Save on pay day before you spend, even a small amount, such as N$100. Keep savings where you cannot spend them too easily."]},
      {h:"Needs and wants", p:["A need is something you must have: food, housing, transport to work. A want is a nice extra. Before buying a want, wait a day. If you still want it, and your budget allows, buy it."]}
    ],
    slides:[
      {t:"What is a budget?", pts:["A plan for your money","Income first, then needs, wants and saving"]},
      {t:"Track your spending", pts:["Write down purchases for a month","Small spends add up"]},
      {t:"Save on pay day", pts:["Save first, then spend","Start small","Build one month of costs"]},
      {t:"Wait a day", pts:["Wants can wait a day","Check the budget first"]}
    ],
    practical:{ title:"My one page budget", intro:"Use pen and paper or a phone note.", tasks:["Write your monthly income.","List your needs and add them up.","List your wants and your saving amount.","Set one saving goal in N$ and a date."], reflect:"What is your saving goal and when will you reach it?" },
    quiz:[
      {q:"What goes first in a budget?", o:["Wants","Income","Debts only","Gifts"], a:1, why:"Start with what comes in."},
      {q:"When should you save?", o:["After you have spent everything","On pay day before spending","Never","Only at year end"], a:1, why:"Pay yourself first."},
      {q:"Which is a need?", o:["Latest phone","Transport to work","Takeaway every day","A new game"], a:1, why:"Getting to work is essential."}
    ],
    exam:[{q:"Why wait a day before buying a want?", o:["The shop might close","It stops impulse buying and lets you check your budget","It saves petrol","It is a rule"], a:1, why:"A pause helps you decide."}]},
  { id:"m3", title:"Debt, credit and staying safe", mins:55,
    reading:[
      {h:"Borrowing carefully", p:["Borrowing is costly. Interest is the extra you pay for using someone else’s money. Before you borrow, ask: How much will I pay back in total? What is the monthly payment? What happens if I miss one? If you cannot answer, do not sign.","Compare offers. Borrow only what you need. Try to repay quickly. Avoid loans to pay for wants."]},
      {h:"Choose registered lenders", p:["Only borrow from lenders that are registered. In Namibia, financial institutions such as banks and microlenders are supervised by NAMFISA, the Namibia Financial Institutions Supervisory Authority. If a lender is not registered, or pressures you, walk away. Never give your bank card and PIN to a lender as security."]},
      {h:"Scams and mobile money safety", p:["Scammers pretend to be banks, mobile wallets, employers or prize givers and ask for your PIN, a code or a small fee to release money. Real banks and wallets never ask for your PIN or one time code. Do not share them with anyone, including people who say they are from the company.","If you receive a message that sounds too good to be true, it is. Talk to a trusted person first. If you are scammed, report it to your bank or wallet provider and the police quickly."]}
    ],
    slides:[
      {t:"The cost of borrowing", pts:["Interest is the extra you pay","Ask the total you will pay back","Ask what happens if you miss a payment"]},
      {t:"Registered lenders", pts:["Check the lender is registered with NAMFISA","Walk away from pressure","Never give your card and PIN"]},
      {t:"Scams", pts:["Fake bank or prize messages","Asks for PIN, code or a fee","Too good to be true is a scam"]},
      {t:"If scammed", pts:["Tell your bank or wallet provider at once","Report to the police","Do not be ashamed, tell someone"]}
    ],
    practical:{ title:"Scam check", intro:"Ten minutes with a colleague.", tasks:["Write down three messages you or someone you know received that look like scams.","For each, list the warning signs.","Write your own rule for your PIN and one time codes.","Share one safety tip with a family member this week."], reflect:"Write your personal rule for PINs and codes." },
    quiz:[
      {q:"What is interest?", o:["A hobby","The extra you pay for using someone else’s money","A tax refund","A gift"], a:1, why:"It is the cost of borrowing."},
      {q:"A caller says they are from your bank and asks for your PIN. You:", o:["Give it","Refuse and contact the bank yourself","Give half of it","Give it if they sound polite"], a:1, why:"Banks never ask for your PIN."},
      {q:"Before taking a loan you should ask:", o:["Nothing","How much I will pay back in total","What colour the paper is","Who else borrowed"], a:1, why:"Know the total cost."}
    ],
    exam:[{q:"A lender asks for your bank card and PIN as security. You should:", o:["Hand them over","Walk away","Give the card but not the PIN","Ask a friend to give it"], a:1, why:"Never hand over your card and PIN."}]}
  ]
}
];
var EXT_COURSES = [
  { id:"ol_customers", title:"Understanding your customers", by:"The Open University (OpenLearn)", hours:"8 hours", level:"Intermediate", url:"https://www.open.edu/openlearn/money-business/understanding-your-customers", note:"Free. A statement of participation is available from OpenLearn." },
  { id:"ol_money", title:"Managing my money", by:"The Open University (OpenLearn)", hours:"Self paced", level:"Beginner", url:"https://www.open.edu/openlearn/money-business/managing-my-money", note:"Free. Budgeting, saving and borrowing basics." },
  { id:"ol_skills", title:"Skills for work", by:"The Open University (OpenLearn)", hours:"Self paced", level:"Beginner", url:"https://www.open.edu/openlearn/education-development/skills-work-0", note:"Free. Short courses on working skills." },
  { id:"ol_ready", title:"Career ready courses", by:"The Open University (OpenLearn)", hours:"Self paced", level:"Beginner", url:"https://www.open.edu/openlearn/miscellaneous/career-ready-courses", note:"Free. Prepare for the next step in your career." },
  { id:"ol_badged", title:"Free badged courses", by:"The Open University (OpenLearn)", hours:"Varies", level:"Varies", url:"https://www.open.edu/openlearn/badged-courses", note:"Free courses that earn a digital badge when you pass the quizzes." },
  { id:"alison_cs", title:"Customer service skills", by:"Alison", hours:"Self paced", level:"Beginner", url:"https://alison.com/course/customer-service-skills", note:"Free to study. A certificate from Alison may cost money." }
];

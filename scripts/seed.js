'use strict';
/*
 * Demo data for The Daily Web.
 * Usage: npm run seed   (WARNING: deletes all existing data in the configured database)
 *
 * Creates: 1 editor + 6 reporters, 600 articles in all statuses and categories,
 * articles that were updated several times after publication, comments,
 * and hourly view statistics for the Impact Analytics graph.
 */
const mongoose = require('mongoose');
const config = require('../src/config');
const { User, Article, Comment, ViewStat, ReadHistory, Session } = require('../src/models');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const TOTAL_ARTICLES = 600;

// Deterministic random numbers so every seed produces the same data
let seed = 20240901;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));

const TOPICS = {
  Politics: {
    subjects: ['Coalition partners', 'Opposition leaders', 'Finance committee members', 'Local councils', 'Senior ministers', 'Lawmakers', 'Election officials', 'Mayors'],
    actions: ['approve', 'debate', 'reject', 'push forward', 'delay', 'announce', 'clash over', 'reach a deal on'],
    objects: ['the new state budget', 'housing reform', 'public transport funding', 'the education bill', 'municipal elections reform', 'a cost-of-living package', 'judicial appointments', 'a new defence plan'],
    people: ['a senior coalition member', 'an opposition spokesperson', 'a political analyst', 'a committee member']
  },
  World: {
    subjects: ['European leaders', 'UN officials', 'US officials', 'Asian governments', 'Aid organisations', 'Diplomats', 'Neighbouring countries', 'G20 members'],
    actions: ['agree on', 'call for', 'warn against', 'prepare for', 'respond to', 'launch', 'discuss', 'sign'],
    objects: ['a new climate pact', 'humanitarian corridors', 'trade sanctions', 'a ceasefire proposal', 'border agreements', 'an energy partnership', 'refugee support plans', 'peace talks'],
    people: ['a senior diplomat', 'a regional expert', 'an aid worker', 'a foreign ministry official']
  },
  Business: {
    subjects: ['Central bank officials', 'Tel Aviv stocks', 'Retail chains', 'Exporters', 'Real estate developers', 'Small businesses', 'Investors', 'Banks'],
    actions: ['brace for', 'benefit from', 'report', 'cut back on', 'rally after', 'struggle with', 'bet on', 'react to'],
    objects: ['the interest rate decision', 'record quarterly profits', 'rising import costs', 'a weaker dollar', 'new mortgage rules', 'higher energy prices', 'the holiday shopping season', 'foreign investment'],
    people: ['a chief economist', 'a market strategist', 'a business owner', 'an industry analyst']
  },
  Technology: {
    subjects: ['Israeli startups', 'Chip makers', 'Tech giants', 'Cybersecurity firms', 'App developers', 'Researchers', 'Cloud providers', 'Regulators'],
    actions: ['unveil', 'race to build', 'warn about', 'invest in', 'roll out', 'test', 'open source', 'bet big on'],
    objects: ['a new AI assistant', 'faster quantum chips', 'a smartphone privacy feature', 'self-driving delivery robots', 'a cyber defence platform', 'satellite internet', 'battery technology', 'digital ID wallets'],
    people: ['a startup founder', 'a security researcher', 'a product manager', 'a technology analyst']
  },
  Science: {
    subjects: ['Astronomers', 'Marine biologists', 'Physicists', 'University researchers', 'Climate scientists', 'Archaeologists', 'Space agencies', 'Geologists'],
    actions: ['discover', 'map', 'measure', 'explain', 'detect', 'uncover', 'simulate', 'photograph'],
    objects: ['a distant exoplanet', 'coral reef recovery', 'ancient city walls', 'gravitational waves', 'rising sea temperatures', 'a new mineral', 'the far side of the Moon', 'migration routes of birds'],
    people: ['the lead researcher', 'a professor of physics', 'a field scientist', 'a doctoral student']
  },
  Health: {
    subjects: ['Hospitals', 'Health ministry officials', 'Doctors', 'Medical researchers', 'Health funds', 'Nutrition experts', 'Pharmacists', 'Emergency services'],
    actions: ['expand', 'warn about', 'recommend', 'test', 'launch', 'study', 'improve', 'prepare for'],
    objects: ['winter flu vaccinations', 'mental health services', 'a new cancer treatment', 'emergency room waiting times', 'healthy school meals', 'heat wave safety', 'telemedicine', 'sleep and screen time'],
    people: ['a senior physician', 'a public health expert', 'a nurse manager', 'a medical researcher']
  },
  Sports: {
    subjects: ['Maccabi Tel Aviv players', 'Hapoel Jerusalem fans', 'National team players', 'Young athletes', 'Marathon runners', 'Basketball league officials', 'Olympic hopefuls', 'Club owners'],
    actions: ['celebrate', 'prepare for', 'secure', 'lose', 'fight for', 'sign', 'dominate', 'bounce back in'],
    objects: ['the derby win', 'the European qualifiers', 'a dramatic overtime victory', 'the championship title', 'a new head coach', 'the season opener', 'a record-breaking time', 'the cup final'],
    people: ['the head coach', 'the team captain', 'a sports commentator', 'a former player']
  },
  Culture: {
    subjects: ['Israel Museum curators', 'Local theatres', 'Film festivals', 'Young musicians', 'Publishers', 'Street artists', 'Orchestra musicians', 'Writers'],
    actions: ['present', 'celebrate', 'premiere', 'bring back', 'rediscover', 'announce', 'honour', 'reimagine'],
    objects: ['a major new exhibition', 'a forgotten classic', 'the summer concert series', 'an award-winning documentary', 'a book fair', 'a mural project', 'a modern opera', 'community art workshops'],
    people: ['the festival director', 'a curator', 'a music critic', 'the lead actor']
  }
};

const CITIES = ['Tel Aviv', 'Jerusalem', 'Haifa', "Be'er Sheva", 'Eilat', 'Netanya', 'Ashdod', 'Rishon LeZion', 'Nazareth', 'Herzliya'];

const PARAGRAPHS = [
  (t) => `${t.subject} ${t.action} ${t.object} on ${pick(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Sunday'])}, in a move that ${pick(['surprised many observers', 'had been expected for weeks', 'could shape the coming months', 'drew immediate reactions'])}. The announcement was made in ${t.city}, where ${pick(['dozens of', 'hundreds of', 'many'])} people followed the developments closely.`,
  (t) => `"This is ${pick(['an important moment', 'only the first step', 'a decision we cannot ignore', 'something we have worked on for a long time'])}," said ${t.person}. "${pick(['We need to look at the long-term picture.', 'People expect clear answers, and they deserve them.', 'The details will matter more than the headlines.', 'It will take time before we see the full effect.'])}"`,
  (t) => `According to figures published this week, about ${between(12, 87)} percent of those surveyed said they were ${pick(['optimistic', 'concerned', 'undecided', 'interested'])} about ${t.object}. The numbers are ${pick(['higher', 'lower', 'roughly the same'])} than in a similar survey carried out last year.`,
  (t) => `Critics argue that the plan ${pick(['moves too fast', 'does not go far enough', 'leaves important questions open', 'ignores smaller communities'])}. Supporters, on the other hand, say it ${pick(['offers a practical solution', 'reflects what the public asked for', 'is backed by solid data', 'has worked well elsewhere'])}.`,
  (t) => `The next stage is expected ${pick(['within the coming weeks', 'before the end of the year', 'early next month', 'after further consultations'])}. Officials in ${pick(CITIES)} said they would ${pick(['publish more details soon', 'monitor the situation closely', 'hold public meetings', 'review the results carefully'])}.`,
  (t) => `${t.person.charAt(0).toUpperCase() + t.person.slice(1)} added that "${pick(['the public conversation around this is healthy', 'cooperation between all sides will be essential', 'we should be careful not to draw conclusions too early', 'the real test will come next season'])}."`,
  (t) => `For now, ${pick(['residents', 'experts', 'industry leaders', 'fans', 'families'])} are watching closely. ${pick(['Many say they are hopeful.', 'Some remain sceptical.', 'Opinions remain divided.', 'Most agree that change is needed.'])} The Daily Web will continue to follow the story and report on new developments.`
];

function makeContent(category) {
  const topic = TOPICS[category];
  const t = {
    subject: pick(topic.subjects),
    action: pick(topic.actions),
    object: pick(topic.objects),
    person: pick(topic.people),
    city: pick(CITIES)
  };
  const title = `${t.subject} ${t.action} ${t.object}`;
  const summary = `${t.subject} ${t.action} ${t.object} in ${t.city}. Here is what it means and what happens next.`;
  const count = between(4, 7);
  const order = PARAGRAPHS.slice(0, 1).concat(PARAGRAPHS.slice(1).sort(() => random() - 0.5)).slice(0, count);
  const body = order.map((fn) => fn(t)).join('\n\n');
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    summary,
    body,
    category,
    imageUrl: `/img/categories/${category.toLowerCase()}-${between(1, 3)}.svg`
  };
}

// An updated version of an article: new opening paragraph + updated title/summary.
// Always built from the original content so suffixes do not pile up.
function makeUpdate(original, version) {
  return {
    ...original,
    title: `${original.title}${pick([': latest update', ' - what changed', ': new details', ' - update'])}`,
    summary: `Updated: ${original.summary}`,
    body: `UPDATE (version ${version}): ${pick(['New information has emerged since this article was first published.', 'Officials have released additional details.', 'The story has developed further over the past day.'])} ${pick(['We have updated the article accordingly.', 'Below is the full, updated report.', 'The main changes are reflected in the text.'])}\n\n${original.body}`
  };
}

const NAMES = ['Daniel', 'Noa', 'Yossi', 'Maya', 'Omer', 'Tamar', 'Lior', 'Shira', 'Avi', 'Michal', 'Eitan', 'Yael', 'Ron', 'Gal', 'Sarah', 'David'];
const COMMENTS = [
  'Very interesting article, thank you for the detailed report.',
  'I am not sure I agree with all of the conclusions here.',
  'Finally someone explains this clearly!',
  'Will there be a follow up on this story?',
  'Great reporting, as always.',
  'This affects my family directly. Thanks for covering it.',
  'I would like to see more numbers to support these claims.',
  'Excellent summary of a complicated topic.',
  'Interesting, but I think the other side was not fully represented.',
  'Shared this with my friends, everyone should read it.'
];

// Views per hour: high after publication, decaying, with a day/night cycle and a boost after updates
function viewsAt(time, publishedAt, base, updates) {
  const ageDays = (time - publishedAt) / DAY;
  let rate = base * Math.pow(0.5, ageDays / 1.6) + base * 0.04;
  for (const u of updates) {
    if (time >= u.at) rate += u.boost * base * Math.pow(0.5, (time - u.at) / DAY / 0.8);
  }
  const hour = new Date(time).getUTCHours();
  const dayCycle = 0.35 + 0.65 * Math.max(0, Math.sin(((hour - 3) / 24) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
  const value = rate * dayCycle * (0.75 + random() * 0.5);
  return Math.max(0, Math.round(value));
}

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to', config.mongoUri);

  await Promise.all([User, Article, Comment, ViewStat, ReadHistory, Session].map((m) => m.deleteMany({})));
  await Promise.all([User, Article, Comment, ViewStat, ReadHistory, Session].map((m) => m.syncIndexes()));
  console.log('Old data removed');

  // ---------- Users ----------
  const userDefs = [
    { username: 'editor', displayName: 'Rachel Cohen', role: 'editor', password: 'editor123' },
    { username: 'dana', displayName: 'Dana Levi', role: 'reporter', password: 'reporter123' },
    { username: 'yossi', displayName: 'Yossi Mizrahi', role: 'reporter', password: 'reporter123' },
    { username: 'maya', displayName: 'Maya Friedman', role: 'reporter', password: 'reporter123' },
    { username: 'omer', displayName: 'Omer Biton', role: 'reporter', password: 'reporter123' },
    { username: 'noa', displayName: 'Noa Peretz', role: 'reporter', password: 'reporter123' },
    { username: 'lior', displayName: 'Lior Katz', role: 'reporter', password: 'reporter123' }
  ];
  const users = [];
  for (const def of userDefs) {
    const user = new User({ username: def.username, displayName: def.displayName, role: def.role });
    user.setPassword(def.password);
    users.push(await user.save());
  }
  const editor = users[0];
  const reporters = users.slice(1);
  console.log(`Created ${users.length} users`);

  // ---------- Articles ----------
  // Status plan: most are published, the rest spread over all workflow states
  const plan = [];
  const push = (n, kind) => { for (let i = 0; i < n; i++) plan.push(kind); };
  push(420, 'published');
  push(30, 'published-multi');     // published and updated several times
  push(20, 'live-update-pending'); // published, new version waiting for approval
  push(10, 'live-update-draft');   // published, reporter is editing a new version
  push(5, 'live-update-returned'); // published, new version returned for corrections
  push(45, 'draft');
  push(40, 'pending');
  push(30, 'returned');
  plan.sort(() => random() - 0.5);

  const categories = config.categories;
  const now = Date.now();
  const articles = [];
  const viewDocs = [];
  const commentDocs = [];

  plan.slice(0, TOTAL_ARTICLES).forEach((kind, index) => {
    const category = categories[index % categories.length];
    const author = reporters[index % reporters.length];
    const content = makeContent(category);
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      author: author._id,
      working: content,
      status: 'draft',
      live: null,
      isLive: false,
      publishEvents: [],
      editorNote: '',
      viewCount: 0
    };

    const isLive = kind.startsWith('published') || kind.startsWith('live-');
    if (!isLive) {
      const created = now - between(1, 20 * 24) * HOUR;
      doc.createdAt = new Date(created);
      doc.updatedAt = doc.workingSavedAt = new Date(created + between(1, 48) * HOUR);
      if (doc.updatedAt > now) doc.updatedAt = doc.workingSavedAt = new Date(now - HOUR);
      doc.status = kind;
      if (kind === 'draft' && random() < 0.4) {
        // unfinished draft
        doc.working.body = content.body.split('\n\n').slice(0, 2).join('\n\n');
      }
      if (kind === 'pending' || kind === 'returned') doc.submittedAt = doc.updatedAt;
      if (kind === 'returned') {
        doc.editorNote = pick([
          'Please add a quote from an independent source and double check the numbers in the third paragraph.',
          'The title is too long - please shorten it. Also add a better main image.',
          'Good start. Please expand the background section and fix the spelling mistakes.',
          'We need a response from the other side before we can publish this.'
        ]);
      }
      articles.push(doc);
      return;
    }

    // Published articles: spread over the last ~75 days, a few published very recently
    const ageHours = index % 15 === 0 ? between(6, 72) : between(3 * 24, 75 * 24);
    const publishedAt = Math.floor((now - ageHours * HOUR) / 60000) * 60000;
    const events = [{ at: new Date(publishedAt), editor: editor._id, version: 1 }];
    let live = content;

    if (kind === 'published-multi') {
      // 2-4 approved updates after publication, at least 18 hours apart
      const updates = between(2, 4);
      let t = publishedAt;
      for (let v = 2; v <= updates + 1; v++) {
        t += between(18, 60) * HOUR;
        if (t > now - 6 * HOUR) break;
        live = makeUpdate(content, v);
        events.push({ at: new Date(t), editor: editor._id, version: v });
      }
    }

    doc.live = live;
    doc.working = { ...live };
    doc.isLive = true;
    doc.status = 'published';
    doc.publishedAt = new Date(publishedAt);
    doc.lastPublishedAt = events[events.length - 1].at;
    doc.publishEvents = events;
    doc.createdAt = new Date(publishedAt - between(2, 30) * HOUR);
    doc.submittedAt = new Date(publishedAt - between(1, 5) * HOUR);
    doc.updatedAt = doc.workingSavedAt = doc.lastPublishedAt;

    if (kind.startsWith('live-update')) {
      doc.working = makeUpdate(content, events.length + 1);
      doc.status = kind === 'live-update-pending' ? 'pending' : (kind === 'live-update-draft' ? 'draft' : 'returned');
      doc.updatedAt = doc.workingSavedAt = new Date(now - between(1, 30) * HOUR);
      if (doc.status !== 'draft') doc.submittedAt = doc.updatedAt;
      if (doc.status === 'returned') doc.editorNote = 'The update needs a source for the new information. Please add it and resubmit.';
    }

    // Hourly view statistics (only non-empty hours are stored)
    const popularity = random();
    const base = kind === 'published-multi' ? between(40, 90) : Math.round(5 + popularity * popularity * 60);
    const boosts = events.slice(1).map((e) => ({ at: e.at.getTime(), boost: 0.8 + random() * 1.6 }));
    let total = 0;
    const startHour = Math.floor(publishedAt / HOUR) * HOUR;
    for (let t = startHour; t <= now; t += HOUR) {
      const count = viewsAt(t + HOUR / 2, publishedAt, base, boosts);
      if (count > 0) {
        viewDocs.push({ article: doc._id, bucket: new Date(t), count });
        total += count;
      }
    }
    doc.viewCount = total;

    // Comments
    const commentCount = random() < 0.3 ? 0 : between(1, 8);
    for (let c = 0; c < commentCount; c++) {
      const at = new Date(Math.min(now - 60000, publishedAt + between(10, 72 * 60) * 60000));
      commentDocs.push({
        article: doc._id,
        authorName: pick(NAMES) + ' ' + pick(['', 'from ' + pick(CITIES), '']).trim(),
        body: pick(COMMENTS),
        createdAt: at,
        updatedAt: at
      });
    }
    articles.push(doc);
  });

  await Article.insertMany(articles, { timestamps: false });
  console.log(`Created ${articles.length} articles`);

  for (let i = 0; i < viewDocs.length; i += 10000) {
    await ViewStat.insertMany(viewDocs.slice(i, i + 10000), { ordered: false });
  }
  console.log(`Created ${viewDocs.length} hourly view statistics`);

  await Comment.insertMany(commentDocs.map((c) => ({ ...c, authorName: c.authorName.trim() })), { timestamps: false });
  console.log(`Created ${commentDocs.length} comments`);

  const counts = await Article.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  console.log('Articles by status:', Object.fromEntries(counts.map((c) => [c._id, c.n])));
  console.log('Live (public) articles:', await Article.countDocuments({ isLive: true }));
  console.log('\nLogin with:  editor / editor123   or   dana, yossi, maya, omer, noa, lior / reporter123');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seeding failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});

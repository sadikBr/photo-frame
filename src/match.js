// «وضع الماتش»: the Moroccan national team's matches, from ESPN's public scoreboard (the JSON
// behind espn.com, free, no key). This file only reads and tidies that data; pulse-hub.js decides
// when to ask and tells the frame and the phones.
//
//   https://site.api.espn.com/apis/site/v2/sports/soccer/<league>/scoreboard?dates=YYYYMMDD
//
// ESPN files a national team's matches under the competition (friendlies, AFCON, its qualifiers,
// the World Cup and its qualifiers), so we look in each of those. Morocco is team 2869.

import { phaseAr, previewMatch, PREVIEW_MS, tvFor } from '../public/js/match-common.js';
export { phaseAr, previewMatch, PREVIEW_MS, tvFor };

export const MOROCCO = '2869';
export const LEAGUES = ['fifa.friendly', 'caf.nations_qual', 'caf.nations', 'fifa.worldq.caf', 'fifa.world', 'fifa.arab'];
export const COMP_AR = {
  'fifa.friendly': 'مباراة ودية',
  'caf.nations': 'كأس أمم إفريقيا',
  'caf.nations_qual': 'تصفيات كأس أمم إفريقيا',
  'fifa.world': 'كأس العالم',
  'fifa.worldq.caf': 'تصفيات كأس العالم',
  'fifa.arab': 'كأس العرب',
};
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';

// ESPN's days are US days; asking a day either side is enough for any kick-off in Morocco.
// One request per day: since Nov 2026 ESPN answers a range (dates=YYYYMMDD-YYYYMMDD) with an
// error for every competition, which hid Morocco–Niger (13 Nov) from the frame.
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
export function scoreboardUrl(slug, dayMs) {
  return BASE + slug + '/scoreboard?dates=' + ymd(dayMs) + '&limit=100';
}
export function scoreboardUrls(slug, fromMs, toMs) {
  const days = [];
  for (let t = fromMs; ; t += 86400000) {
    const d = ymd(Math.min(t, toMs));
    if (!days.includes(d)) days.push(d);
    if (t >= toMs) break;
  }
  return days.map((d) => BASE + slug + '/scoreboard?dates=' + d + '&limit=100');
}

// Ask ESPN for each day; null if no day answered, else Morocco's matches (each once).
export async function fetchMatches(fetchFn, slug, fromMs, toMs) {
  let answered = false;
  const byId = new Map();
  await Promise.all(scoreboardUrls(slug, fromMs, toMs).map(async (u) => {
    try {
      const r = await fetchFn(u, { headers: { accept: 'application/json' } });
      if (!r.ok) { console.warn('match: ESPN', r.status, u); return; }
      answered = true;
      for (const m of parseScoreboard(await r.json(), slug)) byId.set(m.id, m);
    } catch (e) { console.warn('match: ESPN', String(e), u); }
  }));
  return answered ? [...byId.values()] : null;
}

// Opponents' names in Arabic (ESPN gives English). Anything not here keeps its English name.
const AR = {
  Algeria: 'الجزائر', Angola: 'أنغولا', Benin: 'البنين', Botswana: 'بوتسوانا', 'Burkina Faso': 'بوركينا فاسو', Burundi: 'بوروندي',
  Cameroon: 'الكاميرون', 'Cape Verde': 'الرأس الأخضر', 'Cape Verde Islands': 'الرأس الأخضر', 'Central African Republic': 'إفريقيا الوسطى', Chad: 'تشاد', Comoros: 'جزر القمر',
  Congo: 'الكونغو', 'Congo DR': 'الكونغو الديمقراطية', 'DR Congo': 'الكونغو الديمقراطية', 'Democratic Republic of the Congo': 'الكونغو الديمقراطية', Djibouti: 'جيبوتي', Egypt: 'مصر',
  'Equatorial Guinea': 'غينيا الاستوائية', Eritrea: 'إريتريا', Eswatini: 'إسواتيني', Ethiopia: 'إثيوبيا', Gabon: 'الغابون', Gambia: 'غامبيا', 'The Gambia': 'غامبيا',
  Ghana: 'غانا', Guinea: 'غينيا', 'Guinea-Bissau': 'غينيا بيساو', 'Ivory Coast': 'كوت ديفوار', "Cote d'Ivoire": 'كوت ديفوار', "Côte d'Ivoire": 'كوت ديفوار', Kenya: 'كينيا',
  Lesotho: 'ليسوتو', Liberia: 'ليبيريا', Libya: 'ليبيا', Madagascar: 'مدغشقر', Malawi: 'مالاوي', Mali: 'مالي', Mauritania: 'موريتانيا', Mauritius: 'موريشيوس',
  Mozambique: 'الموزمبيق', Namibia: 'ناميبيا', Niger: 'النيجر', Nigeria: 'نيجيريا', Rwanda: 'رواندا', 'Sao Tome and Principe': 'ساو تومي وبرينسيب', Senegal: 'السنغال',
  Seychelles: 'سيشل', 'Sierra Leone': 'سيراليون', Somalia: 'الصومال', 'South Africa': 'جنوب إفريقيا', 'South Sudan': 'جنوب السودان', Sudan: 'السودان', Tanzania: 'تنزانيا',
  Togo: 'التوغو', Tunisia: 'تونس', Uganda: 'أوغندا', Zambia: 'زامبيا', Zimbabwe: 'زيمبابوي',
  'Saudi Arabia': 'السعودية', Qatar: 'قطر', 'United Arab Emirates': 'الإمارات', Kuwait: 'الكويت', Bahrain: 'البحرين', Oman: 'عُمان', Jordan: 'الأردن',
  Iraq: 'العراق', Syria: 'سوريا', Lebanon: 'لبنان', Palestine: 'فلسطين', Yemen: 'اليمن', Iran: 'إيران', Japan: 'اليابان', 'South Korea': 'كوريا الجنوبية', 'Korea Republic': 'كوريا الجنوبية',
  Australia: 'أستراليا', China: 'الصين', 'China PR': 'الصين',
  France: 'فرنسا', Spain: 'إسبانيا', Portugal: 'البرتغال', Germany: 'ألمانيا', Italy: 'إيطاليا', England: 'إنجلترا', Netherlands: 'هولندا', Belgium: 'بلجيكا',
  Croatia: 'كرواتيا', Switzerland: 'سويسرا', Denmark: 'الدنمارك', Norway: 'النرويج', Sweden: 'السويد', Poland: 'بولندا', Scotland: 'اسكتلندا', Wales: 'ويلز',
  Ireland: 'إيرلندا', 'Republic of Ireland': 'إيرلندا', Austria: 'النمسا', Serbia: 'صربيا', Ukraine: 'أوكرانيا', Turkey: 'تركيا', 'Türkiye': 'تركيا', Greece: 'اليونان',
  Czechia: 'التشيك', 'Czech Republic': 'التشيك', Hungary: 'المجر', Romania: 'رومانيا', Russia: 'روسيا',
  Brazil: 'البرازيل', Argentina: 'الأرجنتين', Uruguay: 'الأوروغواي', Colombia: 'كولومبيا', Chile: 'الشيلي', Peru: 'البيرو', Ecuador: 'الإكوادور', Paraguay: 'الباراغواي',
  Bolivia: 'بوليفيا', Venezuela: 'فنزويلا', Mexico: 'المكسيك', 'United States': 'الولايات المتحدة', USA: 'الولايات المتحدة', Canada: 'كندا', 'Costa Rica': 'كوستاريكا',
  Panama: 'بنما', Jamaica: 'جامايكا', Haiti: 'هايتي', Honduras: 'هندوراس', 'New Zealand': 'نيوزيلندا',
};
export const nameAr = (en) => AR[en] || en || 'المنافس';

const num = (v) => {
  if (v && typeof v === 'object') v = v.displayValue != null ? v.displayValue : v.value;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
// Only ESPN's own picture server: the frame loads these.
const logo = (t) => {
  const u = (t && (t.logo || (t.logos && t.logos[0] && t.logos[0].href))) || '';
  return /^https:\/\/a\.espncdn\.com\/[\w./-]+\.png$/.test(u) ? u : '';
};
const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// TV channels ESPN lists for a match. ESPN is American: its plain "broadcasts" and anything with
// region "us" are American channels (ESPN+, Fox…), useless in Morocco, so they're skipped unless
// the name is one watched here. Channels for other regions are kept as given.
const WATCHED_HERE = /bein|\bssc\b|shahid|arryadia|riyadia|aoula|snrt|\b2m\b|medi ?1|canal\+ ?afrique|supersport|الرياضية|الأولى/i;
const TV_AR = [[/arryadia|riyadia/i, 'الرياضية'], [/al[ -]?aoula/i, 'الأولى']];
export function channelsFrom(ev) {
  const c = (ev && ev.competitions && ev.competitions[0]) || {};
  const out = [];
  const add = (name, keepAnyway) => {
    let n = clean(name, 30);
    if (!n || (!keepAnyway && !WATCHED_HERE.test(n))) return;
    for (const [re, ar] of TV_AR) if (re.test(n)) n = ar;
    if (!out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
  };
  for (const g of [].concat(c.geoBroadcasts || [], ev.geoBroadcasts || [])) {
    const media = (g && g.media) || {};
    const region = String((g && g.region) || '').toLowerCase();
    add(media.shortName || media.name, region !== '' && region !== 'us');
  }
  for (const b of [].concat(c.broadcasts || [], ev.broadcasts || [])) for (const n of (b && b.names) || []) add(n, false);
  if (typeof c.broadcast === 'string') for (const n of c.broadcast.split(/[,/]/)) add(n, false);
  return out.slice(0, 4);
}

// One ESPN event → what we keep, or null if Morocco isn't playing.
export function parseEvent(ev, slug) {
  if (!ev) return null;
  const c = (ev.competitions && ev.competitions[0]) || {};
  const teams = c.competitors || ev.competitors || [];
  const idOf = (x) => String((x.team && x.team.id) != null ? x.team.id : x.id);
  const mar = teams.find((x) => idOf(x) === MOROCCO);
  if (!mar) return null;
  const opp = teams.find((x) => x !== mar) || { team: {} };
  const st = c.status || ev.status || {};
  const type = st.type || {};
  const state = ['pre', 'in', 'post'].includes(type.state) ? type.state : 'pre';
  const side = (x, isMar) => {
    const t = x.team || {};
    const out = {
      name: isMar ? 'المغرب' : nameAr(t.displayName || t.name),
      abbr: clean(t.abbreviation, 4) || (isMar ? 'MAR' : ''),
      logo: logo(t),
      score: num(x.score),
      home: x.homeAway === 'home',
    };
    if (x.shootoutScore != null) out.pens = num(x.shootoutScore);
    return out;
  };
  const goals = [];
  for (const d of c.details || []) {
    const kind = (d.type && d.type.text) || '';
    if (!(d.scoringPlay || /goal/i.test(kind)) || d.shootout) continue;
    const a = (d.athletesInvolved && d.athletesInvolved[0]) || {};
    goals.push({
      side: String(d.team && d.team.id) === MOROCCO ? 'mar' : 'opp',
      min: clean(d.clock && d.clock.displayValue, 8),
      who: clean(a.shortName || a.displayName, 32),
      og: !!d.ownGoal,
      pen: !!d.penaltyKick,
    });
  }
  const out = {
    id: clean(ev.id, 20),
    slug,
    comp: COMP_AR[slug] || clean((ev.league && ev.league.name) || '', 40),
    kickoff: Date.parse(ev.date) || 0,
    state,
    status: clean(type.name, 40),
    clock: state === 'in' ? clean(st.displayClock, 10) : '',
    period: Number(st.period) || 0,
    mar: side(mar, true),
    opp: side(opp, false),
    goals: goals.slice(0, 20),
    tv: channelsFrom(ev),
  };
  out.phase = phaseAr(out);
  return out;
}

export function parseScoreboard(json, slug) {
  const out = [];
  for (const ev of (json && json.events) || []) {
    const m = parseEvent(ev, slug);
    if (m && m.kickoff) out.push(m);
  }
  return out;
}

// Which match matters now: one being played; else the next within two days (or one that has
// just ended, if the next is still far off).
export function pickMatch(list, now) {
  const live = list.find((m) => m.state === 'in');
  if (live) return live;
  const next = list.filter((m) => m.state === 'pre' && m.kickoff > now - 3 * 3600000 && m.kickoff - now < 48 * 3600000)
    .sort((a, b) => a.kickoff - b.kickoff)[0];
  const recent = list.filter((m) => m.state === 'post' && now - m.kickoff < 5 * 3600000).sort((a, b) => b.kickoff - a.kickoff)[0];
  if (recent && (!next || next.kickoff - now > 2 * 3600000)) return recent;
  return next || recent || null;
}

// What happened between two looks at the same match.
export function matchChanges(prev, next) {
  if (!prev || !next || prev.id !== next.id) return [];
  const out = [];
  if (prev.state === 'pre' && next.state === 'in') out.push({ type: 'start' });
  if (next.mar.score > prev.mar.score) out.push({ type: 'goal', side: 'mar' });
  if (next.opp.score > prev.opp.score) out.push({ type: 'goal', side: 'opp' });
  if (prev.state !== 'post' && next.state === 'post') out.push({ type: 'end' });
  return out;
}

export const scoreLine = (m) => m.mar.name + ' ' + m.mar.score + ' – ' + m.opp.score + ' ' + m.opp.name;

// The words for the phones.
export function changeMessage(m, ch) {
  const base = { tag: 'match-' + m.id, url: '/admin#fun', heart: false, kind: 'match' };
  if (ch.type === 'start') return Object.assign(base, { title: '⚽ بدأت المباراة', body: 'المغرب × ' + m.opp.name + (m.comp ? ' · ' + m.comp : '') });
  if (ch.type === 'goal') {
    const g = m.goals.filter((x) => x.side === ch.side).slice(-1)[0];
    const extra = g ? ' · ' + (g.min ? 'د ' + g.min.replace(/'/g, '') : '') + (g.who ? ' ' + g.who : '') : '';
    return Object.assign(base, ch.side === 'mar'
      ? { title: '⚽ هدف للمغرب!', body: scoreLine(m) + extra }
      : { title: 'هدف لـ' + m.opp.name, body: scoreLine(m) + extra });
  }
  const res = m.mar.score > m.opp.score || (m.mar.pens || 0) > (m.opp.pens || 0) ? ' 🎉' : '';
  return Object.assign(base, { title: res ? '🎉 فاز المغرب!' : 'انتهت المباراة', body: scoreLine(m) });
}

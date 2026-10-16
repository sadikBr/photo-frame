# لوحة العائلة: a family dashboard for the photo frame

An Arabic, full-screen family dashboard for a 10.1" Android photo frame (1280×800), built to run
inside the kiosk app from [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard).
The frame only displays; you manage everything from the **control panel** at `/admin` on your
phone or computer. The frame has six screens:

| Screen | What it shows |
| --- | --- |
| **الساعة** (clock) | Large clock, weekday, Gregorian date with Moroccan month names, Hijri date, your family message (or a verse or hadith of the day), next prayer, current weather with a plain tip when the day calls for one (umbrella, cold morning, heat, wind) and the next five days |
| **الصلاة** (prayer) | Next prayer with a live countdown; the day drawn as the sun's path with all prayer times on it. Comes forward on its own 10 minutes before each adhan, and plays the adhan if you switch it on. **In Ramadan** it changes by itself: a big countdown to iftar (and to imsak at night), the fast's times with imsak and maghrib highlighted, the day of the month, and a Quran tracker (tap «+ جزء» for each juz read) |
| **الأذكار** (adhkar) | Morning adhkar after Fajr and evening adhkar after Asr, one card at a time; tap the card to count the repetitions. Comes forward on its own for 30 minutes after each of those prayers, until finished or closed |
| **التقويم** (calendar) | The month with Gregorian and Hijri dates, Moroccan public holidays (national and religious), Ashura and the start of Ramadan, your family dates, and the next five occasions |
| **القوائم** (lists) | What the house needs, as large tiles you tap when bought, and the family to-do list |
| **الصور** (photos) | Your family photos as a slideshow, with the time and temperature in the corner |

The screens rotate on their own. At night (23:00 to 06:00 by default) the screen dims and stays
on the clock. On the frame itself, people can switch screens by touch (you can turn that off),
tap a shopping item when it's bought or a task when it's done (tap again to undo), clear
finished tasks and bought items with a second tap to confirm, and count the Quran in Ramadan.

The **control panel** (`/admin`) has six sections:

| Section | What you can do |
| --- | --- |
| **نبضة** | Send a moment to the frame from wherever you are: a tap (أفكر فيكم, اشتقت إليكم, صباح الخير, تصبحون على خير, في الطريق, خبر سعيد), a finger drawing, or a voice note of up to 15 seconds. It appears on the frame within a second or two with its own animation; the family at home can tap «ردّ بقلب» and you see it in the app. See [نبضة](#نبضة-moments-from-your-phone) |
| **مرح** | **وضع الماتش**: when Morocco plays, the frame becomes a stadium screen (score, minute, goals, a roar and fireworks for each Moroccan goal) and phones can send cheers that fly across it. **الدقّة السرية**: tap a rhythm, the frame knocks it on a Moroccan door; knocks from the frame make phones buzz in that rhythm. **عجلة الحظ**: who washes the dishes, where to go on Sunday… spin it on the phone or on the frame. See [مرح](#مرح-match-mode-the-secret-knock-the-wheel) |
| **الرسالة** | Put a note on the clock screen, for an hour, a day, a week or until you remove it |
| **القوائم** | Add, tick and remove shopping items and tasks, with quick-add buttons. **Repeating tasks** (every N days, every week on a day, or every month on a date) come back on the to-do list by themselves when due |
| **الصور** | Upload photos (resized on your phone first) and delete them |
| **المناسبات** | Add birthdays, anniversaries and one-off family dates, or import an `.ics` calendar file (Google Calendar, Outlook, a school timetable). Repeating events are spread over the coming year; importing a file with the same name again replaces its entries |
| **الإعدادات** | City, prayer-time adjustments, **adhan** (upload the audio, choose the prayers, volume, test it on the frame), **Ramadan** mode and a button to preview it on the frame, **adhkar**, the verse of the day and weather tip, Hijri day, which screens rotate and for how long, night mode, quick-add buttons |

It also shows whether the frame is online. The frame picks up changes within 30 seconds.

Everything runs free on Cloudflare Workers. Prayer times come from aladhan.com (Morocco method:
Ministry of Habous angles) and weather from open-meteo.com. Neither needs an account.

---

## 1. Preview it on your computer

You need [Node.js](https://nodejs.org) (the LTS version).

```sh
npm install
npx wrangler dev
```

Open <http://localhost:8787/?demo> for the frame with sample data, and
<http://localhost:8787/admin?demo> for the control panel. Make the browser window 1280×800 to see it at
the frame's size; any other size scales to fit.

## 2. Put it online (Cloudflare, free)

1. Create a free account at <https://dash.cloudflare.com/sign-up>, then sign in from the terminal:
   ```sh
   npx wrangler login
   ```
2. Create the storage for everything the control panel saves:
   ```sh
   npx wrangler kv namespace create STORE
   ```
   Copy the `id` it prints into `wrangler.jsonc`, replacing `PASTE_YOUR_KV_NAMESPACE_ID_HERE`.
3. Choose an access key, so that only your family can open the dashboard. Generate one:
   ```sh
   node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
   ```
   Then save it:
   ```sh
   npx wrangler secret put ACCESS_KEY
   ```
4. Deploy:
   ```sh
   npm run deploy
   ```
   Wrangler prints your address, like `https://frame-dashboard.yourname.workers.dev`.
5. On each phone or computer that should manage the frame, open
   `https://frame-dashboard.yourname.workers.dev/admin?key=YOUR_ACCESS_KEY` once. The key is
   remembered, so after that `/admin` is enough. On a phone, use "Add to Home Screen".

Anyone with the key can change what the frame shows, so share it only with family.

If you change the code later, run `npm run deploy` again. The frame notices the new version
within a minute and reloads itself.

## 3. Show it on the frame

Do this after the frame is unlocked with ADB, following the PF1007L guide in the wesbos repo
(`docs/pf1007l-start-here.md`, then `docs/allwinner-a33-pf1007l.md` for WebView 106 and the
kiosk app).

1. **WebView 106 or newer is required.** The dashboard uses modern JavaScript. The frame's stock
   WebView is too old; the PF1007L guide shows how to install WebView 106.
2. Build and install the kiosk app from the wesbos repo (`dashboard/kiosk/build.sh`), then point
   it at your dashboard:
   ```sh
   adb shell am start -n com.wesbos.homehq/.MainActivity --es url "https://frame-dashboard.yourname.workers.dev/?key=YOUR_ACCESS_KEY"
   ```
3. Make it the Home app so it starts at boot. On Android 6:
   ```sh
   adb shell am start -n com.wesbos.homehq/.MainActivity --ez home true
   adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME
   ```
   On the frame, tap **Home HQ**, then **Always**.
4. Check the screen density is 160 (`adb shell wm density`). If not: `adb shell wm density 160`.
5. Set the frame's screen timeout to the longest option (or "never") in Android Settings → Display.

## 4. Make it yours

Use the control panel's **الإعدادات** section. Two things are worth checking once:

- **Prayer times**: compare them with the Ministry of Habous timetable for your city
  (habous.gov.ma). If your mosque differs by a minute or two, adjust that prayer.
- **Hijri date**: Morocco follows local moon sighting, which can differ by a day from the
  computed calendar. If the Hijri day on the frame is off, adjust it by one day.

The defaults the control panel starts from are in [`public/js/config.js`](public/js/config.js).
Colours and sizes are in [`public/css/app.css`](public/css/app.css).

### Holidays

Civil holidays are fixed dates, including Unity Day on 31 October (a public holiday since 2026).
Religious holidays depend on the moon sighting in Morocco, which can differ by a day from the
computed Hijri calendar. The dates Morocco announces are in `MOROCCO_DATES` at the top of
[`public/js/holidays.js`](public/js/holidays.js): 2026 is official, 2027 is a forecast. When
the Ministry announces a date, put it there and redeploy. Years not in the table are
calculated and shown with ≈ on the calendar.

### The adhan

Upload the adhan you like in **الإعدادات → الأذان** (MP3 or similar, up to 10 MB; a separate Fajr
adhan is optional), switch it on and press «تجربة الأذان على الإطار الآن».

Some Android browsers only allow sound after someone has touched the screen. The frame checks
this when it starts. If sound is blocked, a line at the bottom of the frame asks for one touch;
after that the adhan plays for as long as the frame stays on. The control panel shows whether
the frame can play sound. If your kiosk app has a setting like "autoplay media" or "media
playback requires user gesture", setting it so media can play without a gesture avoids the
touch altogether.

### Sending photos from the phone's share menu

On an Android phone, open the control panel in Chrome and choose ⋮ → «Add to Home screen» (or
«Install app»). From then on, «الإطار» appears in the share menu of the gallery, WhatsApp and
other apps: pick photos, tap Share, choose «الإطار», and the control panel opens and uploads
them (resized on the phone, like the upload button). iPhones don't let websites appear in the
share menu; use the upload button there. This needs the site online over HTTPS (it is, on
Cloudflare); it is handled by `public/sw.js`.

### Repeating tasks and the date

Repeating tasks use Morocco's date (GMT). If you live elsewhere, set your offset from UTC in
minutes as a variable in `wrangler.jsonc`: `"vars": { "UTC_OFFSET_MINUTES": 60 }`.

### نبضة: moments from your phone

Open the control panel (it opens on «نبضة»), choose who you are once (ماما, بابا, جدتي… or type
a name), then:

- **Tap** one of six buttons. The frame shows it over whatever screen is up, with its own
  animation: hearts rising, rose petals, a sunrise, a night sky with the moon, a car driving
  home, confetti. A soft two-note chime plays (not at night; switch it off in الإعدادات → نبضة).
- **Draw** with your finger. The frame draws it again stroke by stroke, in the time you took,
  then keeps it as a small card in the bottom corner for the rest of the day. Tap the card on
  the frame to see it again.
- **Record** a voice note (tap, speak up to 15 seconds, tap, listen, send). The frame shows
  «رسالة صوتية» with your name and plays it. Voice notes also stay in the corner for the day.

Under each moment there is a «ردّ بقلب» button. When someone at home taps it, the sender's
phone gets a notification «❤ قلب من البيت», and the list at the bottom of «نبضة» shows it.

**Missed moments**: if nobody touched the frame while a moment played (or in the two minutes
after), a glowing «نبضة جديدة» / «3 نبضات جديدة» badge waits in the bottom-left corner. Tapping
it plays them again, with the «ردّ بقلب» button. The badge empties at midnight.

At night the moments still arrive, but under the dimmed screen and without sound; a voice note
waits for someone to tap «▶ استمع», and the badge is there in the morning. Moments sent while
the frame is off play when it comes back (if they're less than 12 hours old).

**On the family's phones** (with notifications switched on, below): a moment from someone
else arrives as a notification («نبضة من ماما — «أفكر فيكم»») even when the app is closed, with
a «❤ ردّ بقلب» button on Android; a heart back arrives as «❤ قلب من …». Each phone chooses «كل
النبضات» or «القلوب التي تصلني فقط», and notifications are silent from 23:00 to 06:00 unless
switched off. With the app open, the same moment shows as a card at the top instead. The list
«آخر النبضات» is grouped by day (the server keeps the last 60 moments for a week) and has a ❤
button to answer any moment from the phone too.

#### Setting up the notifications (once)

Notifications use Web Push, which every browser has built in: nothing to sign up for, only a
key pair that proves the notifications come from your site.

```sh
node tools/make-vapid.mjs
```

(Already done for this copy: the public key is in `wrangler.jsonc` and both keys are in `.dev.vars`;
only the `wrangler secret put` step below is left.) It prints two lines. Put the first in `wrangler.jsonc`:

```jsonc
"vars": { "VAPID_PUBLIC_KEY": "B…" },
```

and save the second as a secret (paste it when asked):

```sh
npx wrangler secret put VAPID_PRIVATE_KEY
npm run deploy
```

Then on each phone: «نبضة» → «فعّل الإشعارات» (or the banner at the top). **iPhone**: notifications
work only after «Add to Home Screen» (Share button → «إضافة إلى الشاشة الرئيسية»), opening the app from
there, on iOS 16.4 or newer. Android: Chrome, installed or not. They work only on the real site
(HTTPS), not on `localhost` from a phone. To try them with `wrangler dev` on your computer, put both
lines in a file named `.dev.vars` (git-ignored).

**Grandparents and family far away**: press «مشاركة الرابط» at the bottom of «نبضة» and send
the link by WhatsApp. They open it once and add it to the home screen. The link contains the
access key, so it also lets them use the other sections; send it only to family.

**Voice notes need HTTPS**: phones only allow the microphone on secure sites. On Cloudflare
that's automatic; on `localhost` it works too, but not on your computer's address from a phone
(`http://192.168…`).

How it works: one Cloudflare **Durable Object** (`src/pulse-hub.js`, binding `PULSE` in
`wrangler.jsonc`) keeps the last 60 moments for a week, with recordings and drawings, and holds
a live WebSocket to the frame so each moment is pushed the instant it's sent. If the live
connection drops, the frame asks every 8 seconds instead. It's included in the free plan
(SQLite-backed Durable Objects); `npm run deploy` creates it the first time.

### مرح: match mode, the secret knock, the wheel

**وضع الماتش.** The frame follows the Moroccan national team by itself: friendlies, AFCON and
its qualifiers, the World Cup and its qualifiers. On match day the clock screen
shows «⚽ الليلة 20:00 · المغرب × مالي». From 15 minutes before kick-off until 15 minutes after
the end the frame is a stadium screen: the flags, the score, the minute and who scored. A goal
for Morocco brings a crowd's roar, fireworks and «هدااااف!»; it stays awake even in night hours.
«إخفاء 10 دقائق» puts the normal screens back for a while (a goal brings it back). The adhan
still comes first. Phones that get all notifications are told about the kick-off, every goal
and the result («⚽ هدف للمغرب! المغرب 1 – 0 مالي · د 34»); in «مرح» you can switch these off,
or switch match mode off altogether. During the match «مرح» shows the score and five cheers
(ديما مغرب, سير سير, هيا!, برافو, نار!) that fly across the frame with your name.
«معاينة على الإطار» plays a 3-minute practice match (Morocco scores after 20 seconds) so you can
see it without waiting for a real one.

The scores come from ESPN's public scoreboard (`site.api.espn.com`, free, no account): the
server looks for matches every 3 hours (every 30 minutes on match day) and, during a match,
reads the score every 15–30 seconds, also when no one is looking (a Durable Object alarm), so
the goal notifications arrive even if the frame is off. ESPN doesn't promise this feed will
stay the same; if it changes, match mode simply shows nothing and the rest works as before.

**الدقّة السرية.** In «مرح», tap the door with your own rhythm (طق طق … طق) and send it: the
frame shows its door and knocks your rhythm on it twice, with the sound of a wooden door, and
only then says who it was. Save a rhythm as «دقّتي» to send it with one press. From the frame,
the «دقّة» button opens the door: knock, then choose everyone or one person; that phone gets a
notification «🚪 دقّة من البيت» and, on Android, vibrates in the same rhythm (when the app is
open it also knocks out loud). iPhones can't play a custom vibration, so they get the
notification and hear the knock when it's opened.

**عجلة الحظ.** In «مرح», start from a ready wheel (من يغسل الصحون؟، أين نخرج يوم الأحد؟،
ماذا نأكل الليلة؟…) or make your own: a question and 2 to 12 choices. «أدِر العجلة» spins it on
the phone, and the frame spins it too, live, then shows the result with confetti. On the frame
the «العجلة» button (it appears once there is a wheel) spins it there. The server draws the
result, so it's the same everywhere and nobody can cheat; the result is in the list of moments
and a notification goes to the phones that get everything.

## About the time zone

Morocco returned to permanent GMT on 20 September 2026. Older Android versions, including the
frame's Android 6, still think Morocco is GMT+1, which would put every clock an hour ahead. The
dashboard therefore ignores the device's time-zone rules. It takes the current offset from the
prayer-times service, which follows the law as it changes, and corrects the device clock
against the server every hour.

## Limits

- Cloudflare's free plan allows 1,000 storage writes a day. Each change in the control panel
  is one or two writes, and the frame's check-in about 150 a day, far below the limit.
- «نبضة» uses Durable Object requests: a frame with the live connection uses about 5,000 a day,
  one without it about 11,000; the free plan allows 100,000. Match mode adds about 1,500 a day
  (the frame asks once a minute, every 8 seconds during a match).
- Up to 300 photos are kept. Delete old ones from the control panel to add more.
- If the internet drops, the frame keeps showing the last weather, prayer times, lists, message
  and settings it received. The calendar and holidays need no internet. A small notice appears in the corner
  after ten minutes offline.

## Files

```
src/worker.js        Cloudflare Worker: API for lists, repeating tasks, photos, adhan audio,
                     settings, dates, message, Quran tracker, previews, time
src/pulse-hub.js     «نبضة»: the Durable Object that keeps moments, talks live to the frame and
                     sends phone notifications (src/webpush.js: VAPID signing + encryption);
                     also knocks, wheels and match mode (src/match.js reads ESPN's scoreboard)
src/settings.js      Validation of settings saved from the control panel
public/index.html    The frame (display only)
public/admin.html    The control panel (/admin); public/sw.js receives photos shared from phones
                     and shows «نبضة» notifications
public/js/           Frame screens (screens/), frame data (data.js), holidays (holidays.js),
                     Ramadan (ramadan.js, decorations in ramadan-decor.js), adhan (adhan.js), adhkar and verses
                     (adhkar-data.js), weather tip (nudge.js), repeating-task dates
                     (routines.js), «نبضة» on the frame (pulse.js) and on the phone
                     (admin-pulse.js, shared parts in pulse-common.js), «مرح» on the frame
                     (frame-knock.js, frame-wheel.js, frame-match.js) and on the phone (admin-fun.js;
                     shared: fun-common.js, sound.js, match-common.js), control panel (admin.js), .ics import (ics.js,
                     ics-import.js), defaults (config.js)
public/css/          Styles: app.css (frame), admin.css (control panel)
public/fonts/        Reem Kufi and Readex Pro (SIL Open Font License)
public/demo/         Sample pictures for ?demo (painted in code, tools/paint-demo-photos.py)
tools/make-vapid.mjs Makes the key pair for phone notifications
public/brand/        Icons, splash screens and install screenshots (tools/make-brand.py);
                     favicon.svg, apple-touch-icon.png, icon-*.png at the top of public/
test/                npm test: API, notifications, knocks/wheel/match, .ics import and frame logic tests
```

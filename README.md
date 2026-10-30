# لوحة العائلة: a family dashboard for the photo frame

An Arabic, full-screen family dashboard for a 10.1" Android photo frame (1280×800), built to run
inside the kiosk app from [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard).
The frame only displays; you manage everything from the **control panel** at `/admin` on your
phone or computer. The frame has six screens:

| Screen | What it shows |
| --- | --- |
| **الساعة** (clock) | Large clock, weekday, Gregorian date with Moroccan month names, Hijri date, your family message (or a verse or hadith of the day), next prayer, current weather with a plain tip when the day calls for one (umbrella, cold morning, heat, wind) and the next five days |
| **الصلاة** (prayer) | Next prayer with a live countdown; the day drawn as the sun's path with all prayer times on it. Comes forward on its own 10 minutes before each adhan, and plays the adhan if you switch it on. **In Ramadan** it changes by itself: a big countdown to iftar (and to imsak at night), the fast's times with imsak and maghrib highlighted, the day of the month, and a Quran tracker (tap «+ جزء» for each juz read) |
| **الأذكار** (adhkar) | Morning adhkar after Fajr and evening adhkar after Asr, one card at a time; tap the card to count the repetitions. Comes forward on its own for 30 minutes after each of those prayers, until finished or closed. If you upload a recording of the morning and evening adhkar, a play button at the top plays it, and it can start by itself |
| **التقويم** (calendar) | The month with Gregorian and Hijri dates, Moroccan public holidays (national and religious), Ashura and the start of Ramadan, your family dates, and the next five occasions |
| **القوائم** (lists) | What the house needs, as large tiles you tap when bought, and the family to-do list |
| **الصور** (photos) | Your family photos as a slideshow, with the time and temperature in the corner |

The screens rotate on their own. At night (23:00 to 06:00 by default) the screen dims and stays
on the clock. On the frame itself, people can switch screens by touch (you can turn that off),
tap a shopping item when it's bought or a task when it's done (tap again to undo), clear
finished tasks and bought items with a second tap to confirm, and count the Quran in Ramadan.
The «القرآن» button at the bottom opens the Quran player (see [القرآن](#القرآن-recitation-on-the-frame)).

The **control panel** (`/admin`) has five tabs: **الرئيسية** (today at a glance: send a moment, the
message, photos, مرح, the frame's look, and what the house needs today), **نبضة** (with مرح under it),
**القرآن**, **البيت** (القوائم، المناسبات، الصور، الرسالة under one switcher) and **الإعدادات** (a menu of
short pages). What each part does:

| Part | What you can do |
| --- | --- |
| **نبضة** | Send a moment to the frame from wherever you are: a tap (أفكر فيكم, اشتقت إليكم, صباح الخير, تصبحون على خير, في الطريق, خبر سعيد), a finger drawing, or a voice note of up to 15 seconds. It appears on the frame within a second or two with its own animation; the family at home can tap «ردّ بقلب» and you see it in the app. See [نبضة](#نبضة-moments-from-your-phone) |
| **نبضة**, more | **🎁 مفاجأة لاحقاً**: write a moment now and choose when it appears (midnight for a birthday, 7:30 before an exam); nobody sees it before. **نبضك الحقيقي**: your fingertip on the phone's camera for 15 seconds, and the frame shows a heart beating in your own rhythm. **حالتي**: «📚 في الامتحان حتى 12:00» on the clock screen, gone when the time is up |
| **القرآن** | Have the frame recite any surah, choosing the reciter: **Ahmad Al-Nufais, Khalid Al-Jaleel, Badr Al-Turki, Hicham El Harraz** (Warsh) or **Mishary Alafasy**: your list (البقرة، الكهف، الحجر، الشعراء، يوسف، الملك، السجدة to start), one surah or the whole list in a row, pause, next, stop and volume from the phone, set times (al-Kahf on Friday morning, al-Mulk every night), or listen on the phone itself. See [القرآن](#القرآن-recitation-on-the-frame) |
| **مرح** | **وضع الماتش**: when Morocco plays, the frame becomes a stadium screen (score, minute, goals, a roar and fireworks for each Moroccan goal) and phones can send cheers that fly across it. **الدقّة السرية**: tap a rhythm, the frame knocks it on a Moroccan door; knocks from the frame make phones buzz in that rhythm. **عجلة الحظ**: who washes the dishes, where to go on Sunday… spin it on the phone or on the frame. See [مرح](#مرح-match-mode-the-secret-knock-the-wheel) |
| **الرسالة** | Put a note on the clock screen, for an hour, a day, a week or until you remove it |
| **القوائم** | Add, tick and remove shopping items and tasks, with quick-add buttons. **Repeating tasks** (every N days, every week on a day, or every month on a date) come back on the to-do list by themselves when due |
| **الصور** | Upload photos (resized on your phone first) and delete them |
| **المناسبات** | Add birthdays, anniversaries and one-off family dates, or import an `.ics` calendar file (Google Calendar, Outlook, a school timetable). Repeating events are spread over the coming year; importing a file with the same name again replaces its entries |
| **الإعدادات** | **The frame's look** (eight to choose from, see below), city, prayer-time adjustments, **adhan** (upload the audio, choose the prayers, volume, test it on the frame), **Ramadan** mode and a button to preview it on the frame, **adhkar** (with their morning and evening recordings, and whether they start by themselves), **guest Wi-Fi** (shown on the frame as a QR code), night mode (dimmed, or the screen **fully off**), the verse of the day and weather tip, Hijri day, which screens rotate and for how long, night mode, quick-add buttons |

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

### The frame's look (مظهر الإطار)

**الإعدادات → المظهر** picks one of twelve looks for the whole frame, special screens included:
الأصلي (the original), رياض, فاتح, أندلسي, للأطفال, صحراء, ماجوريل, ألبوم العائلة (every screen over
the family's photos), الأطلس (the mountains follow the season), السماء الحيّة (the sky drawn from the
live weather), اللوحة القلّابة (a split-flap station board whose tiles flip) and الهلال (tonight's moon
and the Hijri month). The choice is saved at once; «جرّب» shows the selected look on the frame for
one minute without changing the setting. On the preview page, `/?demo&theme=kids` shows a look.

Each look is a stylesheet and a small script: edit `tools/themes/<id>.css`, then run
`python3 tools/build-themes.py` (or `… build-themes.py <id>` for one look) to rebuild `public/css/themes/<id>.css` (it turns inline
`svg(…)` drawings into data URLs and adds the look's fonts). The pictures drawn behind the screens
(the window, the clock hands, the dunes…) are in `public/js/themes/<id>.js`. Only the chosen
look's files and fonts are loaded on the frame.

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

### Adhkar recordings

In **الإعدادات › الأذكار**, upload one recording for the morning adhkar and one for the evening
(MP3, M4A, OGG or WAV, up to 50 MB each, about 50 minutes at normal quality). They are kept in
your Cloudflare storage like the adhan, so they don't depend on another website (a file over 20 MB
is stored in parts, because Cloudflare's storage takes at most 25 MB per item, and joined again
when it plays).

- On the frame, the adhkar screen shows a play button with the time beside the close button
  whenever a recording exists for that time of day.
- **«تشغيل التسجيل تلقائياً…»** (on by default): when the adhkar come up by themselves after Fajr
  or Asr, or when you press «عرض الأذكار على الإطار الآن», the recording starts on its own, once per
  morning and once per evening. It doesn't start over a Quran recitation that is already playing.
  Switch it off to start the recording only with the button.
- It has its own volume. The adhan pauses it; a moment from «نبضة» turns it down; the screen stays
  on the adhkar while it plays; leaving the screen or closing the adhkar (×) stops it.
- Starting a surah from «القرآن» stops the adhkar recording; starting the adhkar recording while a
  surah plays holds the surah until the recording ends or is paused.

### Guest Wi-Fi

In **الإعدادات › الواي فاي للضيوف**, type the network name and password. A round Wi-Fi button
then appears at the end of the frame's tab row: it shows the network as a big QR code that a
phone camera turns into "join this network" (iPhone and Android), with the name and password
written beside it (untick «كتابة كلمة السر…» to show only the code). «عرض الرمز على الإطار الآن»
opens it from your phone. The password is stored with the frame's settings in your Cloudflare
account, like everything else.

### Timers (مؤقّت)

The «مؤقّت» tab (or a tap on the big clock) opens kitchen timers: pick a name if you like (أتاي، الطبخ،
الفرن…) and touch a duration (1 to 60 minutes) or set another one. Up to six run at once; they
show in the tab in the original look and as small counters in the bottom-left corner in the other
looks, and keep running through a reload or a power cut. When one ends, a red card fills the
screen (even at night, when it wakes the screen) and a loud two-tone alarm rings until someone
touches «إيقاف», or «غفوة» for 1, 5 or 10 more minutes. It stops by itself after 10 minutes and
waits while the adhan plays.

The alarm plays at full volume, but it can't be louder than the frame's media volume. With the
updated kiosk app (`bash tools/kiosk-screen/update_kiosk.sh`, needs the frame on adb), the frame
turns its media volume up to the maximum while a timer rings and puts it back afterwards. On the
preview page, `frameDemo.timer(5, 'أتاي')` in the console starts a 5-second timer.

### Night: dimmed or fully off

**الإعدادات › الوضع الليلي** dims the screen between the two times. With **«إطفاء الشاشة كلياً»**
the screen goes black and the frame's light is switched off instead; one touch anywhere turns it
on (that touch doesn't press anything), and it goes off again after two minutes untouched.

Switching the light itself off needs the Home HQ app on the frame to be updated once, with the
two files in `tools/kiosk-screen/` (`ScreenControl.java` gives the page `window.HomeHQ.screen()`,
which turns the backlight off through root; `update_kiosk.sh` adds it to the app, rebuilds and
reinstalls it). The control panel says what the frame can do: light fully off, lowest brightness
only, or (before the app update) a black page.

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

**تلوين الزليج.** A zellige page (8-pointed stars, a rosette, a terrace) to colour together:
on the frame (the «مرح» button → «تلوين») and from every phone in «مرح», each tile with a tap,
everyone seeing the others' colours appear. A new page every Monday. When a page is finished,
the frame saves it into the slideshow's photos («لوحة العائلة»); a page left at least half done
at the end of the week is saved too. «لوحة جديدة» starts the next one early.

**عجلة الحظ.** In «مرح», start from a ready wheel (من يغسل الصحون؟، أين نخرج يوم الأحد؟،
ماذا نأكل الليلة؟…) or make your own: a question and 2 to 12 choices. «أدِر العجلة» spins it on
the phone, and the frame spins it too, live, then shows the result with confetti. On the frame
the «العجلة» button (it appears once there is a wheel) spins it there. The server draws the
result, so it's the same everywhere and nobody can cheat; the result is in the list of moments
and a notification goes to the phones that get everything.

### More ways to send a moment

**🎁 مفاجأة لاحقاً.** Above the taps in «نبضة», choose «مفاجأة لاحقاً…» and a day and time
(quick choices: midnight tonight, tomorrow 7:30, in an hour). The next tap, drawing, voice note or
heartbeat you send is kept on the server, invisible to everyone, and appears on the frame at that
minute (a Durable Object alarm wakes up for it, even if no one is looking), marked «🎁 مفاجأة ·
كُتبت أمس». Phones with notifications get «🎁 مفاجأة من …». «مفاجآتي المؤجلة» lists yours, with
«إلغاء». Up to two months ahead. Times are Morocco's, whatever the phone's clock thinks.

**نبضك الحقيقي.** In «نبضة», «ابدأ القياس»: put a fingertip gently on the back camera; the
phone turns the camera's light on and reads the pulse from the tiny changes in the red of your
skin (15 seconds, keep still). The frame then shows a big heart beating at your real rhythm with
a monitor line and soft heartbeat sounds («قلب ماما ينبض لكم · 72»), and home can send a heart
back. The camera light needs an Android phone; on an iPhone (or if the camera can't read it),
«أو انقر مع نبضك»: feel the pulse at the wrist and tap along 10 times. It's for love, not
medicine.

**حالتي.** In «نبضة», pick a status (في الامتحان، في الخدمة، نايم، مسافر…) or write one, and
until when (an hour, 3 hours, 20:00, tomorrow 8:00, 3 days). It shows as a small card at the top
of the frame's clock screen and on the other phones, and disappears by itself.

### القرآن: recitation on the frame

The recordings are streamed from [mp3quran.net](https://mp3quran.net), which hosts all 114 surahs
for each reciter, so nothing has to be uploaded and the frame needs the internet while it recites.
Five reciters to choose from:

| Reciter | Reading |
| --- | --- |
| أحمد النفيس (Ahmad Al-Nufais), the default | Hafs ʿan ʿĀṣim |
| خالد الجليل (Khalid Al-Jaleel) | Hafs ʿan ʿĀṣim |
| بدر التركي (Badr Al-Turki) | Hafs ʿan ʿĀṣim |
| هشام الهراز (Hicham El Harraz) | **Warsh ʿan Nāfiʿ**, the Moroccan reading |
| مشاري العفاسي (Mishary Alafasy) | Hafs ʿan ʿĀṣim |

- **The reciter** is chosen on the phone («القارئ» card) or on the frame (the row of names in the
  Quran player). The choice is shared: it is used for everything the frame recites next, for set
  times and for 🎧. If a surah is playing when you change it, that surah starts again from the
  beginning in the new voice. To add another reciter, add a line to `RECITERS` in
  `public/js/quran-common.js` (its mp3quran.net folder).

- **From the phone**, «القرآن» tab: your list of surahs. «الإطار ▶» recites one on the frame;
  «تشغيل القائمة كلها على الإطار» recites them all in order, then stops («ثم تتوقف») or starts again
  («ثم تُعاد»). The card at the top shows what is being recited and how far it is, with
  previous, pause, next, stop and the volume. 🎧 plays a surah on the phone instead. Add any of the
  114 surahs to the list, or remove one with ×.
- **On the frame**, the «القرآن» button opens your list in large tiles, «كل السور» shows all 114,
  and the bar at the bottom has the same controls. While a surah plays, a small card at the top of
  every screen shows its name with pause and stop; tap it to open the player again. The screens
  stay put while it plays.
- **Set times** («تشغيل تلقائي»): a surah, the days and the hour, and the frame starts it by itself
  (suggested: al-Kahf every Friday at 10:00, al-Mulk every night at 22:00). If something is already
  playing, the set time doesn't interrupt it.
- **It gives way:** the adhan pauses it and it carries on after; a moment from «نبضة» turns it down
  while it shows.
- The sound comes from the frame's own speaker. If it is quiet even at 100%, raise the frame's
  media volume once (Android's volume buttons or settings).

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
- A recited surah streams about 1 MB a minute (al-Baqarah is a little over 2 hours).
- Up to 300 photos are kept. Delete old ones from the control panel to add more.
- If the internet drops, the frame keeps showing the last weather, prayer times, lists, message
  and settings it received. The calendar and holidays need no internet. A small notice appears in the corner
  after ten minutes offline.

## Files

```
src/worker.js        Cloudflare Worker: API for lists, repeating tasks, photos, adhan audio,
                     settings, dates, message, Quran tracker, previews, time; recordings (adhan, adhkar)
src/pulse-hub.js     «نبضة»: the Durable Object that keeps moments, talks live to the frame and
                     sends phone notifications (src/webpush.js: VAPID signing + encryption);
                     also knocks, wheels, match mode (src/match.js reads ESPN's scoreboard) and
                     the Quran player's list, set times and what is playing
src/settings.js      Validation of settings saved from the control panel
public/index.html    The frame (display only)
public/admin.html    The control panel (/admin); public/sw.js receives photos shared from phones
                     and shows «نبضة» notifications
public/js/           Frame screens (screens/), looks (theme.js loads themes/<id>.js; prayer-row.js), frame data (data.js), holidays (holidays.js),
                     Ramadan (ramadan.js, decorations in ramadan-decor.js), adhan (adhan.js), adhkar and verses
                     (adhkar-data.js), weather tip (nudge.js), repeating-task dates
                     (routines.js), «نبضة» on the frame (pulse.js) and on the phone
                     (admin-pulse.js, shared parts in pulse-common.js), «مرح» on the frame
                     (frame-knock.js, frame-wheel.js, frame-match.js, frame-color.js, frame-status.js) and on
                     the phone (admin-fun.js, admin-beat.js, admin-status.js, admin-time.js; shared:
                     fun-common.js, sound.js, match-common.js, zellige.js, heart.js), «القرآن» on the
                     frame (frame-quran.js) and on the phone (admin-quran.js; surahs and reciter in
                     quran-common.js), guest Wi-Fi (frame-wifi.js, wifi-common.js; QR codes by
                     vendor/qrcode.js, MIT), night screen off (screen.js), control panel (admin.js), .ics import (ics.js,
                     ics-import.js), defaults (config.js)
public/css/          Styles: app.css (frame), admin.css (control panel), themes/ (built looks)
public/fonts/        Reem Kufi and Readex Pro; themes/: the looks' Arabic fonts (all SIL Open Font
                     License, from Fontsource)
tools/themes/        Sources of the looks; tools/build-themes.py builds them
public/demo/         Sample pictures for ?demo (painted in code, tools/paint-demo-photos.py)
tools/make-vapid.mjs Makes the key pair for phone notifications
tools/kiosk-screen/  Lets the frame's Home HQ app switch the screen's light off at night (see above)
public/brand/        Icons, splash screens and install screenshots (tools/make-brand.py);
                     favicon.svg, apple-touch-icon.png, icon-*.png at the top of public/
test/                npm test: API, notifications, knocks/wheel/match, surprises/statuses/colouring, Quran, Wi-Fi,
                     heartbeat detection, .ics import and frame logic tests
```

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

The **control panel** (`/admin`) has five sections:

| Section | What you can do |
| --- | --- |
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

## About the time zone

Morocco returned to permanent GMT on 20 September 2026. Older Android versions, including the
frame's Android 6, still think Morocco is GMT+1, which would put every clock an hour ahead. The
dashboard therefore ignores the device's time-zone rules. It takes the current offset from the
prayer-times service, which follows the law as it changes, and corrects the device clock
against the server every hour.

## Limits

- Cloudflare's free plan allows 1,000 storage writes a day. Each change in the control panel
  is one or two writes, and the frame's check-in about 150 a day, far below the limit.
- Up to 300 photos are kept. Delete old ones from the control panel to add more.
- If the internet drops, the frame keeps showing the last weather, prayer times, lists, message
  and settings it received. The calendar and holidays need no internet. A small notice appears in the corner
  after ten minutes offline.

## Files

```
src/worker.js        Cloudflare Worker: API for lists, repeating tasks, photos, adhan audio,
                     settings, dates, message, Quran tracker, previews, time
src/settings.js      Validation of settings saved from the control panel
public/index.html    The frame (display only)
public/admin.html    The control panel (/admin); public/sw.js receives photos shared from phones
public/js/           Frame screens (screens/), frame data (data.js), holidays (holidays.js),
                     Ramadan (ramadan.js, decorations in ramadan-decor.js), adhan (adhan.js), adhkar and verses
                     (adhkar-data.js), weather tip (nudge.js), repeating-task dates
                     (routines.js), control panel (admin.js), .ics import (ics.js,
                     ics-import.js), defaults (config.js)
public/css/          Styles: app.css (frame), admin.css (control panel)
public/fonts/        Reem Kufi and Readex Pro (SIL Open Font License)
public/demo/         Sample pictures for ?demo (painted in code, tools/paint-demo-photos.py)
public/brand/        Icons, splash screens and install screenshots (tools/make-brand.py);
                     favicon.svg, apple-touch-icon.png, icon-*.png at the top of public/
test/                npm test: API, .ics import and frame logic tests
```

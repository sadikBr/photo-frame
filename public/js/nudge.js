// One plain sentence about the day's weather, for the clock screen.
// Given a day from the forecast ({ code, max, min, rain (%), mm, gusts (km/h) }).
// Returns { kind, text }: a tip when the day calls for one (umbrella, cold, heat…), otherwise
// a short summary ("غداً غائم ودافئ، بين 18 و27 درجة"); null only without a forecast.
import { describeWeather } from './icons.js';

export function weatherNudge(day, tomorrow) {
  if (!day) return null;
  const when = tomorrow ? 'غداً' : 'اليوم';
  const code = Number(day.code);
  const rain = day.rain == null ? 0 : day.rain;
  const mm = day.mm == null ? 0 : day.mm;
  if (code >= 95) return { kind: 'storm', text: 'عواصف رعدية متوقعة ' + when + '، خذوا الحيطة والمظلة' };
  if (rain >= 60 || mm >= 3) return { kind: 'rain', text: 'خذوا المظلة ' + when + '، أمطار متوقعة' };
  if (day.gusts != null && day.gusts >= 55) return { kind: 'wind', text: 'رياح قوية ' + when + '، انتبهوا للنوافذ والغسيل المنشور' };
  if (day.max != null && day.max >= 35) return { kind: 'hot', text: 'حر شديد ' + when + '، اشربوا الماء كثيراً وتجنبوا شمس الظهيرة' };
  const morning = tomorrow ? 'صباح الغد' : 'صباحاً';
  if (day.min != null && day.min <= 8) return { kind: 'cold', text: tomorrow ? 'صباح الغد بارد، لبّسوا الصغار جيداً' : 'الجو بارد صباحاً، لبّسوا الصغار جيداً' };
  if (rain >= 35) return { kind: 'rain', text: 'قد تمطر ' + when + '، المظلة احتياط جيد' };
  if (day.min != null && day.max != null && day.min <= 12 && day.max - day.min >= 10) {
    return { kind: 'cold', text: (tomorrow ? 'غداً ' : '') + 'صباح بارد ونهار دافئ، البسوا طبقات تُنزع' };
  }
  if (code === 45 || code === 48) return { kind: 'fog', text: 'ضباب ' + morning + '، القيادة بحذر' };
  if (day.max != null && day.max >= 30) return { kind: 'hot', text: (tomorrow ? 'غداً يوم حار' : 'يوم حار') + '، لا تنسوا قنينة الماء' };
  if (code <= 2 && day.max != null && day.max >= 18 && day.max <= 28 && rain < 20) {
    return { kind: 'nice', text: 'جو جميل ' + when + '، مناسب للخروج' };
  }
  // An ordinary day: say what it is like in words, with the range.
  if (day.min == null || day.max == null) return null;
  const sky = describeWeather(code).ar;
  const feel = day.max >= 30 ? 'حار' : day.max >= 24 ? 'دافئ' : day.max >= 17 ? 'معتدل' : day.max >= 10 ? 'بارد' : 'بارد جداً';
  return { kind: 'info', text: when + ' ' + (sky ? sky + ' و' + feel : feel) + '، بين ' + Math.round(day.min) + ' و' + Math.round(day.max) + ' درجة' };
}

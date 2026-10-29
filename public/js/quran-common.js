// «القرآن»: what the server, the frame and the phones share — the surahs' names, the reciters and
// where their recordings are (mp3quran.net: all 114 surahs for each, streamed directly).

export const SURAHS = ['الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس'];
export const surahName = (n) => SURAHS[n - 1] || '';
export const validSurah = (n) => Number.isInteger(n) && n >= 1 && n <= 114;

// Brahim's reciters, in his order. Hicham El Harraz recites in Warsh ʿan Nāfiʿ (the Moroccan
// reading); the others in Hafs ʿan ʿĀṣim. Checked 2026-10-29: 114 surahs each.
export const RECITERS = {
  nufais: { name: 'أحمد النفيس', riwaya: 'حفص', base: 'https://server16.mp3quran.net/nufais/Rewayat-Hafs-A-n-Assem/' },
  jaleel: { name: 'خالد الجليل', riwaya: 'حفص', base: 'https://server10.mp3quran.net/jleel/' },
  bader: { name: 'بدر التركي', riwaya: 'حفص', base: 'https://server10.mp3quran.net/bader/Rewayat-Hafs-A-n-Assem/' },
  harraz: { name: 'هشام الهراز', riwaya: 'ورش', base: 'https://server16.mp3quran.net/H-Lharraz/Rewayat-Warsh-A-n-Nafi/' },
  afasy: { name: 'مشاري العفاسي', riwaya: 'حفص', base: 'https://server8.mp3quran.net/afs/' },
};
export const DEFAULT_RECITER = 'nufais';
export const validReciter = (r) => typeof r === 'string' && Object.prototype.hasOwnProperty.call(RECITERS, r);
export const reciterOf = (r) => (validReciter(r) ? r : DEFAULT_RECITER);
export const reciterName = (r) => RECITERS[reciterOf(r)].name;
export const surahUrl = (n, reciter = DEFAULT_RECITER) => RECITERS[reciterOf(reciter)].base + String(n).padStart(3, '0') + '.mp3';

// Brahim's first choices, in his order.
export const DEFAULT_FAVS = [2, 18, 15, 26, 12, 67, 32];
// Suggested times (the control panel offers them): al-Kahf on Friday, al-Mulk at night.
export const SCHEDULE_SUGGESTIONS = [
  { surah: 18, days: [5], time: '10:00' },
  { surah: 67, days: [0, 1, 2, 3, 4, 5, 6], time: '22:00' },
];
export const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export function daysLabel(days) {
  const d = [...new Set(days)].sort();
  if (d.length === 7) return 'كل يوم';
  if (d.length === 1) return 'كل ' + DAYS_AR[d[0]];
  return d.map((x) => DAYS_AR[x]).join('، ');
}
export const mmss = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
};

// The book icon for buttons.
export const BOOK = (s, c = 'currentColor') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6c-2-1.6-4.6-2.3-8-2v14c3.4-.3 6 .4 8 2 2-1.6 4.6-2.3 8-2V4c-3.4-.3-6 .4-8 2z" fill="none" stroke="${c}" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 6v14" stroke="${c}" stroke-width="1.9"/></svg>`;

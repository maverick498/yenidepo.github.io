// Karşılama ekranı service worker'ı.
// Yalnız bu iki değer sisteme özeldir. "ORTAK KOD" satırının altı üç sw.js'te aynıdır (P-09 denetler).
const ESKI_ONBELLEK = 'g3-depo-launcher-v1';
const DOSYALAR = [
  './',
  './index.html',
  './G3 png.png',
  './manifest.json',
];

// ---------- ORTAK KOD ----------
// Önbellek adı kapsamı içerir: aynı adresteki sistemler ve site kopyaları birbirini silmez.
const KAPSAM = new URL(self.registration.scope).pathname;
const ONEK = `g3:${KAPSAM}:`;
const ONBELLEK = `${ONEK}v3`;
const AG_SURESI_MS = 3000;
const YAZI_TIPI_SUNUCULARI = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (olay) => {
  olay.waitUntil((async () => {
    const onbellek = await caches.open(ONBELLEK);
    // HTTP önbelleği atlanır: yeni sürüme eski dosya karışmasın. addAll atomiktir; tek dosya
    // alınamazsa kurulum başarısız olur ve önceki sürüm çalışmaya devam eder.
    await onbellek.addAll(DOSYALAR.map((dosya) => new Request(dosya, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil((async () => {
    // /beta/ kopyası, aynı adreste çalışan canlı sürümün eski önbelleğine dokunmaz.
    const silinecek = (ad) => (ad.startsWith(ONEK) && ad !== ONBELLEK)
      || (ad === ESKI_ONBELLEK && !KAPSAM.includes('/beta/'));
    const adlar = await caches.keys();
    await Promise.all(adlar.filter(silinecek).map((ad) => caches.delete(ad)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (olay) => {
  if (olay.request.method !== 'GET') return;
  const adres = new URL(olay.request.url);
  const yaziTipi = YAZI_TIPI_SUNUCULARI.includes(adres.hostname);
  if (adres.origin !== self.location.origin && !yaziTipi) return;
  olay.respondWith(agOncelikli(olay, yaziTipi));
});

// Ağ öncelikli: AG_SURESI_MS içinde yanıt gelmezse önbellekten sunulur, geç gelen yanıt yine saklanır.
// Önbellekte de yoksa ağ beklenmeye devam edilir: yavaş bağlantıdaki ilk açılış boşa düşmesin.
async function agOncelikli(olay, yaziTipi) {
  const istek = olay.request;
  const ag = fetch(istek);
  olay.waitUntil(ag.then((yanit) => (saklanir(yanit, yaziTipi) ? sakla(istek, yanit.clone()) : null)).catch(() => {}));

  const sonuc = await Promise.race([
    ag.then((yanit) => ({ yanit }), () => ({ agYok: true })),
    new Promise((coz) => { setTimeout(coz, AG_SURESI_MS, {}); }),
  ]);
  if (sonuc.yanit) return sonuc.yanit;

  const kayitli = await kayittaBul(istek);
  if (kayitli) return kayitli;
  if (!sonuc.agYok) {
    try { return await ag; } catch (hata) { /* ağ da yanıt vermedi: son çareye geç */ }
  }
  return sonCare(istek);
}

// Google Fonts sayfaya CORS'suz bağlanır, yanıtı "opaque" olur (durum 0).
const saklanir = (yanit, yaziTipi) => yanit.status === 200 || (yaziTipi && yanit.type === 'opaque');

async function sakla(istek, yanit) {
  const onbellek = await caches.open(ONBELLEK);
  await onbellek.put(istek, yanit);
}

async function kayittaBul(istek) {
  const onbellek = await caches.open(ONBELLEK);
  return (await onbellek.match(istek, { ignoreVary: true })) || caches.match(istek, { ignoreVary: true });
}

async function sonCare(istek) {
  if (istek.mode === 'navigate') {
    const giris = new URL('index.html', self.registration.scope).href;
    // Başka klasördeki sayfaya bu index.html verilirse göreli bağlantıları bozulur: adres de değişmeli.
    if (new URL('.', istek.url).href !== self.registration.scope) return Response.redirect(giris);
    const sayfa = await kayittaBul(giris);
    if (sayfa) return sayfa;
  }
  // Yazı tipi yoksa sayfa sistem yazı tipiyle açılır; konsola hata düşmez.
  if (new URL(istek.url).hostname === 'fonts.googleapis.com') {
    return new Response('', { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
  }
  return Response.error();
}

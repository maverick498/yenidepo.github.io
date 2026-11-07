'use strict';
// ==========================================
// BARKOD KURALLARI VE KAMERA TARAYICISI
// ==========================================
// Kabul edilen etiketler:
//   - M + 9 hane (asil etiket, ornek: M123456789)
//   - En az 10 karakter: istege bagli tek harf + en az 9 hane (ornek: 91000001234, N123456789)
//   - GS1 etiketleri: icindeki SSCC / seri / GTIN degeri
// Yalniz bu barkod turleri aranir. Urun barkodlari (EAN, UPC) ve karekod aranmaz.
const TURLER_YEREL = ['code_128', 'code_39', 'data_matrix'];
const TURLER_YEDEK = ['Code128', 'Code39', 'DataMatrix'];

const BARKOD_EN_AZ = 10;
const BARKOD_EN_COK = 32;
const BARKOD_KURALI = /^[A-Z]?\d{9,}$/;
const M_BARKOD = /^M\d{9}$/;

// Tek karede yanlis okunan bir deger kabul edilmesin diye:
const KARE_ARALIGI_MS = 50; // cozme denemeleri arasi en kisa sure
const ONAY_ADET = 3; // ayni deger en az bu kadar okunmali
const ONAY_SURE_M_MS = 150; // M + 9 etiket icin ilk ve son okuma arasi en kisa sure
const ONAY_SURE_DIGER_MS = 400; // diger etiketler icin (daha temkinli)
const ADAY_ZAMAN_ASIMI_MS = 700; // bu kadar gorulmeyen aday unutulur
const M_ONCELIK_MS = 1000; // kadrajda M etiketi varken diger barkodlar yok sayilir
const AYNI_ETIKET_MS = 2000; // etiket bu sure boyunca hic gorulmezse yeni okuma sayilir
const EN_BUYUK_KARE_GENISLIGI = 1280;

const GS = '\x1D';
const SEMBOL_ONEKI = /^\](C1|d2|e0|Q3)/i;
const GS1_SABIT = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
const GS1_DEGISKEN = { '10': 20, '21': 20, '22': 20, '30': 8, '37': 8 };

function gs1EnIyiDeger(a) {
  return a['00'] || a['21'] || a['01'] || null;
}

// Parantezsiz GS1 verisi: 01...21...<GS>10...
function gs1Alanlari(metin) {
  const a = {};
  let i = 0;
  while (i < metin.length) {
    if (metin[i] === GS) { i++; continue; }
    const k = metin.substr(i, 2);
    if (GS1_SABIT[k]) {
      const u = GS1_SABIT[k];
      const v = metin.substr(i + 2, u);
      if (v.length < u) break;
      a[k] = v;
      i += 2 + u;
    } else if (GS1_DEGISKEN[k]) {
      let son = metin.indexOf(GS, i + 2);
      if (son === -1) son = metin.length;
      a[k] = metin.slice(i + 2, Math.min(son, i + 2 + GS1_DEGISKEN[k]));
      i = son;
    } else {
      break;
    }
  }
  return a;
}

// GS1 yapisi taniniyorsa degeri, yoksa null dondurur.
function gs1Deger(ham) {
  const metin = String(ham == null ? '' : ham).trim();
  const onekli = /^\](C1|d2|e0)/i.test(metin);
  const govde = metin.replace(SEMBOL_ONEKI, '');
  if (govde.includes('(')) {
    const a = {};
    const desen = /\((\d{2,4})\)([^(]+)/g;
    const duz = govde.split(GS).join('');
    let m;
    while ((m = desen.exec(duz)) !== null) a[m[1]] = m[2].trim();
    return gs1EnIyiDeger(a);
  }
  if (onekli || govde.startsWith(GS)) return gs1EnIyiDeger(gs1Alanlari(govde));
  return null;
}

function parseGS1Barcode(rawData) {
  const g = gs1Deger(rawData);
  if (g) return g;
  return String(rawData == null ? '' : rawData).trim().replace(SEMBOL_ONEKI, '').split(GS).join('').trim();
}

function barkodGecerliMi(deger) {
  return deger.length >= BARKOD_EN_AZ && deger.length <= BARKOD_EN_COK && BARKOD_KURALI.test(deger);
}

// Ham okumayi temizler ve kurala gore dogrular. Gecersizse null.
function barkodCoz(ham, tur) {
  let metin = String(ham == null ? '' : ham);
  if (!metin.startsWith(']') && !metin.includes('(')) {
    if (tur === 'data_matrix' && /^\x1D?(00\d{18}|01\d{14})/.test(metin)) metin = ']d2' + metin;
    else if (tur === 'code_128' && /^\x1D?00\d{18}$/.test(metin)) metin = ']C1' + metin;
  }
  const g = gs1Deger(metin);
  if (g) {
    const d = g.toUpperCase();
    return /^[A-Z0-9]+$/.test(d) && d.length <= BARKOD_EN_COK ? { deger: d, gs1: true } : null;
  }
  const d = parseGS1Barcode(metin).toUpperCase();
  return barkodGecerliMi(d) ? { deger: d, gs1: false } : null;
}

// Listedeki anahtar: M + 9 hane etiket, Excel'deki 9 haneli numarayla eslesir.
function listeAnahtari(deger) {
  return M_BARKOD.test(deger) ? deger.substring(1) : deger;
}

let yedekMotorSozu = null;
function yedekMotoruYukle() {
  if (yedekMotorSozu) return yedekMotorSozu;
  if (typeof ZXingWASM === 'undefined') {
    yedekMotorSozu = Promise.resolve(false);
    return yedekMotorSozu;
  }
  yedekMotorSozu = ZXingWASM.prepareZXingModule({
    overrides: {
      locateFile: (yol, onek) => (yol.endsWith('.wasm') ? new URL('lib/' + yol, document.baseURI).href : onek + yol),
    },
    fireImmediately: true,
  }).then(() => true).catch((e) => {
    console.warn('Yedek barkod motoru yuklenemedi:', e);
    return false;
  });
  return yedekMotorSozu;
}

const YEDEK_TUR_ADI = { Code128: 'code_128', Code39: 'code_39', DataMatrix: 'data_matrix' };

class BarkodTarayici {
  // kap: videonun konacagi oge; kutu: ekrandaki okuma alani; onKabul(deger): onaylanan barkod
  constructor({ kap, kutu, onKabul }) {
    this.kap = kap;
    this.kutu = kutu;
    this.onKabul = onKabul;
    this.izle = null; // test ve tani icin: her karedeki ham sonuclar
    this.turler = TURLER_YEREL.slice();
    this.video = null;
    this.akis = null;
    this.acik = false;
    this.okuyor = false;
    this.oturum = 0;
    this.okumaNo = 0;
    this.basliyor = null;
    this.tuval = document.createElement('canvas');
    this.ctx = this.tuval.getContext('2d', { willReadFrequently: true });
    this.yerel = null;
    this.yerelHata = 0;
    this.yerelSonBulgu = 0;
    this.yedekHazir = false;
    this.kareNo = 0;
    this.sonM = -Infinity;
    this.adaylar = new Map();
    this.kabuller = new Set();
    this.sonGorulme = new Map();
    this.istatistik = { cozme: 0, sure: 0 };
  }

  async baslat() {
    if (this.acik) return undefined;
    if (this.basliyor) return this.basliyor;
    const no = ++this.oturum;
    const iptalMi = () => no !== this.oturum;
    const iptal = (akis) => {
      if (akis) akis.getTracks().forEach((t) => t.stop());
      const e = new Error('Kamera acilisi iptal edildi');
      e.iptal = true;
      return e;
    };
    this.basliyor = (async () => {
      const akis = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (iptalMi()) throw iptal(akis);
      const v = document.createElement('video');
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.srcObject = akis;
      this.kap.replaceChildren(v);
      await v.play();
      if (!v.videoWidth) {
        await new Promise((coz) => {
          v.addEventListener('loadeddata', coz, { once: true });
          setTimeout(coz, 3000);
        });
      }
      if (iptalMi()) {
        this.kap.replaceChildren();
        throw iptal(akis);
      }
      this.akis = akis;
      this.video = v;
      this.acik = true;
      const iz = akis.getVideoTracks()[0];
      if (iz && iz.applyConstraints) iz.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      this._motorlariHazirla();
    })();
    try {
      await this.basliyor;
    } finally {
      this.basliyor = null;
    }
    return undefined;
  }

  durdur() {
    this.oturum++;
    this.okumayiKapat();
    this.acik = false;
    if (this.akis) this.akis.getTracks().forEach((t) => t.stop());
    this.akis = null;
    this.video = null;
    this.kap.replaceChildren();
  }

  // Sekme arka plandan donunce video durmus olabilir.
  devamEt() {
    if (this.video && this.video.paused) this.video.play().catch(() => {});
  }

  okumayiAc() {
    if (!this.acik || this.okuyor) return;
    this.okuyor = true;
    this._okumaDongusu(++this.okumaNo);
  }

  okumayiKapat() {
    this.okuyor = false;
    this.okumaNo++;
  }

  // Okuma alaninin ekrandaki yeri
  ekranBolgesi() {
    return this.kutu.getBoundingClientRect();
  }

  // Okuma alaninin kamera goruntusundeki yeri (video: object-fit cover)
  kaynakBolgesi() {
    const v = this.video;
    const vr = v.getBoundingClientRect();
    const kr = this.kutu.getBoundingClientRect();
    const olcek = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const pX = (v.videoWidth * olcek - vr.width) / 2;
    const pY = (v.videoHeight * olcek - vr.height) / 2;
    const sx = Math.max(0, (kr.left - vr.left + pX) / olcek);
    const sy = Math.max(0, (kr.top - vr.top + pY) / olcek);
    return {
      sx,
      sy,
      sw: Math.min(v.videoWidth - sx, kr.width / olcek),
      sh: Math.min(v.videoHeight - sy, kr.height / olcek),
    };
  }

  async _motorlariHazirla() {
    if (!this.yerel && 'BarcodeDetector' in window) {
      try {
        const destek = await BarcodeDetector.getSupportedFormats();
        const turler = TURLER_YEREL.filter((t) => destek.includes(t));
        if (turler.includes('code_128')) this.yerel = new BarcodeDetector({ formats: turler });
      } catch (e) {
        console.warn('Yerlesik barkod motoru kullanilamiyor:', e);
      }
    }
    this.yedekHazir = await yedekMotoruYukle();
  }

  async _okumaDongusu(no) {
    while (this.okuyor && this.acik && no === this.okumaNo) {
      const t0 = performance.now();
      try {
        await this._birKare();
      } catch (e) {
        console.warn('Kare cozulemedi:', e);
      }
      const kalan = KARE_ARALIGI_MS - (performance.now() - t0);
      await new Promise((coz) => setTimeout(coz, Math.max(1, kalan)));
    }
  }

  async _birKare() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    if (!this.yerel && !this.yedekHazir) return;
    const b = this.kaynakBolgesi();
    if (b.sw <= 0 || b.sh <= 0) return;
    const oran = Math.min(1, EN_BUYUK_KARE_GENISLIGI / b.sw);
    const g = Math.round(b.sw * oran);
    const y = Math.round(b.sh * oran);
    if (this.tuval.width !== g || this.tuval.height !== y) {
      this.tuval.width = g;
      this.tuval.height = y;
    }
    this.ctx.drawImage(v, b.sx, b.sy, b.sw, b.sh, 0, 0, g, y);
    const t0 = performance.now();
    const okumalar = await this._coz();
    this.istatistik.cozme++;
    this.istatistik.sure += performance.now() - t0;
    if (this.izle) this.izle(okumalar);
    if (this.okuyor) this._isle(okumalar, performance.now());
  }

  async _coz() {
    const sonuc = [];
    const simdi = performance.now();
    this.kareNo++;
    if (this.yerel) {
      try {
        const l = await this.yerel.detect(this.tuval);
        this.yerelHata = 0;
        for (const x of l) sonuc.push({ ham: x.rawValue, tur: x.format });
        if (l.length) this.yerelSonBulgu = simdi;
      } catch (e) {
        if (++this.yerelHata >= 3) {
          console.warn('Yerlesik barkod motoru kapatildi:', e);
          this.yerel = null;
        }
      }
    }
    // Yerlesik motor yoksa her karede; varsa yalniz bir sure hicbir sey bulamadiysa yardimci olur.
    const yedek = this.yedekHazir && (!this.yerel || (!sonuc.length && simdi - this.yerelSonBulgu > 300 && this.kareNo % 2 === 0));
    if (yedek) {
      const l = await ZXingWASM.readBarcodes(this.ctx.getImageData(0, 0, this.tuval.width, this.tuval.height), {
        formats: TURLER_YEDEK,
        tryHarder: true,
        maxNumberOfSymbols: 4,
      });
      for (const x of l) if (x.isValid) sonuc.push({ ham: x.text, tur: YEDEK_TUR_ADI[x.format] || x.format });
    }
    return sonuc;
  }

  // Kabul kurali: ayni deger art arda okunmali; ayni etiket surekli gorunurken yeniden sayilmaz.
  _isle(okumalar, simdi) {
    const gecerli = new Map();
    for (const o of okumalar) {
      const c = barkodCoz(o.ham, o.tur);
      if (c) gecerli.set(c.deger, c);
    }
    for (const d of gecerli.keys()) if (M_BARKOD.test(d)) this.sonM = simdi;
    for (const [d, c] of gecerli) {
      const oncelikli = M_BARKOD.test(d) || c.gs1;
      if (!oncelikli && simdi - this.sonM < M_ONCELIK_MS) continue;
      const onceki = this.sonGorulme.get(d);
      this.sonGorulme.set(d, simdi);
      if (this.kabuller.has(d)) {
        if (onceki !== undefined && simdi - onceki < AYNI_ETIKET_MS) continue;
        this.kabuller.delete(d);
      }
      let a = this.adaylar.get(d);
      if (!a || simdi - a.son > ADAY_ZAMAN_ASIMI_MS) a = { ilk: simdi, son: simdi, adet: 0 };
      a.adet++;
      a.son = simdi;
      this.adaylar.set(d, a);
      if (a.adet >= ONAY_ADET && simdi - a.ilk >= (oncelikli ? ONAY_SURE_M_MS : ONAY_SURE_DIGER_MS)) {
        this.adaylar.delete(d);
        this.kabuller.add(d);
        this.onKabul(d, c);
      }
    }
  }
}

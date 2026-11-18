'use strict';
// ==========================================
// KAMERA OKUMA MANTIĞI
// ==========================================
// Kullanıcının çalışan referans uygulamasından (BarkodingKontroling.github.io, app.js) birebir alınmıştır:
//   - html5-qrcode 2.3.8 ve aynı başlatma ayarları (startCamera içindeki config).
//     new Html5Qrcode("reader") tür listesi verilmeden kurulduğu için kütüphanenin okuduğu
//     bütün türler aranır; telefonda yerleşik barkod okuyucu varsa o da kullanılır.
//   - parseGS1Barcode: GS1 ayıklama.
//   - onScanSuccess: 9 hane kuralı (9 hane / M + 9 / harf + 9 / içindeki ilk 9 hane) ve 2 saniye tekrar engeli.
// Okuma aynıdır; tek fark tekrar engelindedir. Referansta engel M'li ham değeri (M123456789) 9 haneli
// sonuçla (123456789) karşılaştırdığı için M etiketlerinde hiç devreye girmiyor, ayrıca yalnız bir önceki
// okumaya baktığı için iki barkodlu etikette (A, B, A, B...) her okuma yeniden sayılıyordu.
// Burada her 9 haneli değerin kendi 2 saniyesi vardır: etiket kamerada dururken her karede yeniden sayılmaz.

const DEBOUNCE_TIME = 2000; // 2 saniye

// Referanstaki startCamera() config nesnesi, olduğu gibi
function kameraAyarlari() {
    return {
        fps: 30, // Yüksek FPS
        qrbox: { width: 280, height: 140 },
        aspectRatio: 1.777778,
        // TÜM 1D BARKODLAR + GS1 Formatları + 2D
        formatsToSupport: [
            // 1D Barkodlar (Çizgili)
            Html5QrcodeSupportedFormats.CODE_128,        // Lojistik/Depo standart + GS1-128
            Html5QrcodeSupportedFormats.CODE_39,         // Askeri, otomotiv
            Html5QrcodeSupportedFormats.CODE_93,         // Posta servisleri
            Html5QrcodeSupportedFormats.CODABAR,         // Kütüphane, kan bankaları
            Html5QrcodeSupportedFormats.EAN_13,          // Ürün barkodları (13 haneli)
            Html5QrcodeSupportedFormats.EAN_8,           // Küçük ürünler (8 haneli)
            Html5QrcodeSupportedFormats.UPC_A,           // ABD/Kanada ürünleri
            Html5QrcodeSupportedFormats.UPC_E,           // UPC kompakt versiyon
            Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION, // Ek bilgi kodları
            Html5QrcodeSupportedFormats.ITF,             // Palet/koli barkodları (ITF-14)
            Html5QrcodeSupportedFormats.RSS_14,          // GS1 DataBar
            Html5QrcodeSupportedFormats.RSS_EXPANDED,    // GS1 DataBar genişletilmiş
            // 2D Barkodlar (GS1 DataMatrix - Ford Otosan için kritik!)
            Html5QrcodeSupportedFormats.QR_CODE,         // Karekod
            Html5QrcodeSupportedFormats.DATA_MATRIX      // GS1 DataMatrix (2D)
        ],
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true  // Native API - Donanım Hızlandırma
        },
        rememberLastUsedCamera: true,
        // Video kısıtlamaları - performans için
        videoConstraints: {
            facingMode: "environment",
            focusMode: "continuous",
            advanced: [
                { focusMode: "continuous" },
                { zoom: 1.0 }
            ]
        }
    };
}

// ==========================================
// GS1 BARKOD PARSING (FNC1 ve AI Desteği) — referanstan birebir
// ==========================================
function parseGS1Barcode(rawData) {
    // FNC1 karakterini temizle (]C1, ]d2, ]e0 gibi prefiksler)
    let cleanData = rawData.replace(/^\]C1|^\]d2|^\]e0|^\]Q3/i, '');

    // GS (Group Separator - ASCII 29) karakterini temizle
    cleanData = cleanData.replace(/\x1D/g, '');

    // Eğer AI formatında değilse (örn: (01)123...), direkt döndür
    if (!cleanData.includes('(')) {
        return cleanData.trim();
    }

    // Application Identifiers'ı parse et
    const aiPattern = /\((\d{2,4})\)([^\(]+)/g;
    let matches;
    let parsedData = {
        raw: rawData,
        cleaned: cleanData,
        ai: {}
    };

    while ((matches = aiPattern.exec(cleanData)) !== null) {
        const ai = matches[1];
        const value = matches[2].trim();
        parsedData.ai[ai] = value;

        // Yaygın AI'lar
        switch(ai) {
            case '00': parsedData.sscc = value; break;           // SSCC (18 haneli)
            case '01': parsedData.gtin = value; break;           // GTIN
            case '10': parsedData.batch = value; break;          // Batch/Lot
            case '11': parsedData.productionDate = value; break; // Üretim tarihi
            case '15': parsedData.bestBefore = value; break;     // Son kullanma
            case '17': parsedData.expiryDate = value; break;     // Son kullanma
            case '21': parsedData.serialNumber = value; break;   // Seri numarası
            case '37': parsedData.quantity = value; break;       // Miktar
        }
    }

    // En kullanışlı veriyi döndür (SSCC, Serial, GTIN veya raw)
    return parsedData.sscc || parsedData.serialNumber || parsedData.gtin || cleanData.trim();
}

// ==========================================
// BARKOD TEMİZLEME VE VALİDASYON — referanstaki onScanSuccess / handleManualEntry senaryoları
// ==========================================
// Sonuç her zaman 9 haneli rakamdır; bulunamazsa null.
function gecerliBarkodBul(barcode) {
    barcode = String(barcode === undefined || barcode === null ? '' : barcode).trim();
    let validBarcode = null;

    // SENARYO 1: Tam 9 haneli rakam
    if (/^\d{9}$/.test(barcode)) {
        validBarcode = barcode;
    }
    // SENARYO 2: M + 9 rakam (M123456789)
    else if (/^M\d{9}$/i.test(barcode)) {
        validBarcode = barcode.substring(1); // M'yi at, son 9 rakamı al
    }
    // SENARYO 3: Harf + 9 rakam (başka harfler olabilir: A123456789, B123456789)
    else if (/^[A-Z]\d{9}$/i.test(barcode)) {
        validBarcode = barcode.substring(1); // İlk harfi at
    }
    // SENARYO 4: İçinde 9 haneli rakam ara (GS1 uzun formatlar)
    else {
        const nineDigitMatch = barcode.match(/\d{9}/);
        if (nineDigitMatch) {
            validBarcode = nineDigitMatch[0];
        }
    }
    return validBarcode;
}

// ==========================================
// KAMERA: html5-qrcode ile, referanstaki startCamera / stopCamera / onScanSuccess
// ==========================================
class BarkodTarayici {
    // kap: html5-qrcode'un görüntüyü koyacağı öge (id'si olmalı); onKabul(deger): 9 haneli barkod
    constructor({ kap, onKabul }) {
        this.kap = kap;
        this.onKabul = onKabul;
        this.izle = null; // test ve tanı için: (decodedText, decodedResult) her başarılı çözmede
        this.html5QrcodeScanner = null;
        this.acik = false;
        this.okuyor = false; // referanstaki isScanningEnabled: Basılı Tut'a basılıyken true
        this.oturum = 0;
        this.basliyor = null;
        this.sonOkumalar = new Map(); // 9 haneli değer -> son işlendiği an (tekrar engeli)
        this.istatistik = { cozme: 0, basarili: 0 }; // tanı için: her çözme denemesi
    }

    // Okuma kutusunun ekrandaki yeri (tanı ve test için). html5-qrcode kutuyu görüntünün ortasına koyar.
    ekranBolgesi() {
        const v = this.kap.querySelector('video');
        const q = this.html5QrcodeScanner && this.html5QrcodeScanner.qrRegion;
        if (!v || !q) return null;
        const r = v.getBoundingClientRect();
        const left = r.left + q.x;
        const top = r.top + q.y;
        return { left, top, width: q.width, height: q.height, right: left + q.width, bottom: top + q.height };
    }

    // Okuma kutusunun kamera görüntüsündeki karşılığı: html5-qrcode'un kendi hesabıyla aynı
    kaynakBolgesi() {
        const v = this.kap.querySelector('video');
        const q = this.html5QrcodeScanner && this.html5QrcodeScanner.qrRegion;
        if (!v || !q || !v.clientWidth || !v.clientHeight) return null;
        const ox = v.videoWidth / v.clientWidth;
        const oy = v.videoHeight / v.clientHeight;
        return { sx: q.x * ox, sy: q.y * oy, sw: q.width * ox, sh: q.height * oy, cozucu: [q.width, q.height] };
    }

    async baslat() {
        if (this.acik) return undefined;
        if (this.basliyor) return this.basliyor;
        const no = ++this.oturum;
        this.basliyor = (async () => {
            const tarayici = new Html5Qrcode(this.kap.id);
            await tarayici.start(
                { facingMode: "environment" }, // Arka kamera
                kameraAyarlari(),
                (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
                (error) => this.onScanFailure(error)
            );
            if (no !== this.oturum) {
                // Açılırken kapatıldı
                await this._kapat(tarayici, no);
                const e = new Error('Kamera açılışı iptal edildi');
                e.iptal = true;
                throw e;
            }
            this.html5QrcodeScanner = tarayici;
            this.acik = true;
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
        const tarayici = this.html5QrcodeScanner;
        this.html5QrcodeScanner = null;
        if (tarayici) this._kapat(tarayici, this.oturum);
    }

    async _kapat(tarayici, no) {
        // html5-qrcode başlatmayı görüntü oynamaya başlamadan bitmiş sayar ve video.play() sözünü
        // yakalamaz. Hemen kapatılırsa (açılırken geri dönme) yakalanmamış hata düşer:
        // önce görüntünün oynamaya başlaması kısa bir süre beklenir.
        const v = this.kap.querySelector('video');
        if (v && v.readyState < 3) {
            await new Promise((coz) => {
                v.addEventListener('playing', coz, { once: true });
                setTimeout(coz, 1500);
            });
        }
        try {
            await tarayici.stop();
            tarayici.clear();
        } catch (e) {
            console.warn('Kamera durdurma hatası:', e);
        }
        // Bu arada yeni kamera açılmadıysa alan boş kalsın ("kamerayı başlatın" yazısı görünsün)
        if (no === this.oturum && !this.acik) this.kap.replaceChildren();
    }

    // Sekme arka plandan dönünce video durmuş olabilir.
    devamEt() {
        const v = this.kap.querySelector('video');
        if (v && v.paused) v.play().catch(() => {});
    }

    okumayiAc() {
        this.okuyor = true;
    }

    okumayiKapat() {
        this.okuyor = false;
    }

    // BARKOD TARAMA BAŞARILI
    onScanSuccess(decodedText, decodedResult) {
        this.istatistik.cozme++;
        this.istatistik.basarili++;
        if (this.izle) this.izle(decodedText, decodedResult);
        // Okuma aktif değilse işlem yapma
        if (!this.okuyor) {
            return;
        }

        // GS1 formatını parse et
        const parsedBarcode = parseGS1Barcode(decodedText);

        // Barkod temizleme ve validasyon
        const validBarcode = gecerliBarkodBul(parsedBarcode.trim());

        // Geçerli barkod bulunamadı
        if (!validBarcode) {
            return;
        }

        // Debounce kontrolü: aynı barkod, 2 saniye geçmedi
        const currentTime = Date.now();
        const onceki = this.sonOkumalar.get(validBarcode);
        if (onceki !== undefined && (currentTime - onceki) < DEBOUNCE_TIME) {
            return;
        }

        // Güncelle (eski kayıtlar atılır, liste büyümez)
        for (const [deger, an] of this.sonOkumalar) {
            if (currentTime - an >= DEBOUNCE_TIME) this.sonOkumalar.delete(deger);
        }
        this.sonOkumalar.set(validBarcode, currentTime);

        // İş mantığı
        this.onKabul(validBarcode);
    }

    // BARKOD TARAMA HATALI (Sessiz)
    onScanFailure(error) {
        // Sessiz, sürekli okuma devam eder
        this.istatistik.cozme++;
    }
}

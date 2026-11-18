# Depo Kontrol

Depo sevkiyat kontrolü için telefonda çalışan barkod okuma uygulaması. Sunucu gerektirmez; veriler telefonda saklanır.

## Modlar

- **Listeye Göre Kontrol:** Excel yüklenir, paletler okutulur; okunan, kalan, fazla ve mükerrer ayrılır.
- **Tara ve Listele:** Liste olmadan okutulan barkodlar tabloya yazılır, Excel olarak indirilir.

İki modda da okunan değer 9 haneli palet numarasına çevrilir (aşağıdaki kural).

## Okuma mantığı

Kamera okuması, çalışan referans uygulamadan (BarkodingKontroling) birebir alınmıştır:

- Kütüphane `html5-qrcode` 2.3.8, ayarlar aynı: saniyede 30 kare, ortada 280×140 px okuma kutusu, arka kamera, sürekli odak.
- Kütüphanenin okuduğu bütün barkod türleri aranır (Code128, Code39, Code93, Codabar, ITF, EAN, UPC, DataBar, QR, DataMatrix, PDF417 ve diğerleri). Telefonda yerleşik barkod okuyucu varsa (Android Chrome) o da kullanılır.
- Okuma yalnız **Basılı Tut**'a basılıyken sayılır.
- Aynı barkod 2 saniye içinde yeniden sayılmaz.

Okunan değerin 9 haneye çevrilmesi (kamera ve elle giriş aynı):

| Okunan | Kaydedilen |
|---|---|
| `123456789` | `123456789` |
| `M123456789` | `123456789` (M atılır) |
| Başka harf + 9 hane, ör. `A123456789` | `123456789` (harf atılır) |
| Daha uzun değer, ör. GS1 veya `91000001234` | İçindeki ilk 9 hane (`910000012`) |
| İçinde 9 hane olmayan değer | Kaydedilmez |

GS1 etiketlerinde önce SSCC, seri veya GTIN değeri ayıklanır.

## Excel biçimi

İlk sütun barkod, ikinci sütun lokasyon. İlk satır başlık olabilir.

| Değer | Sonuç |
|---|---|
| `123456789` | Listeye girer |
| `M123456789` veya `A123456789` | Harf atılır, `123456789` olarak girer |
| Başka biçim | Atlanır, Özet Rapor'da satır numarasıyla yazılır |

## Dosyalar

| Dosya | Görev |
|---|---|
| `index.html`, `style.css` | Ekran |
| `app.js` | Sayım, rapor, Excel, kayıt |
| `tarayici.js` | Kamera ve okuma mantığı (referanstan) |
| `sw.js` | Çevrimdışı çalışma |
| `lib/` | `html5-qrcode` (Apache-2.0) ve `xlsx-js-style` (MIT), yerel kopya |

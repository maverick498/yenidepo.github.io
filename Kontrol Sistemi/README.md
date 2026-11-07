# Depo Kontrol

Depo sevkiyat kontrolü için telefonda çalışan barkod okuma uygulaması. Sunucu gerektirmez; veriler telefonda saklanır.

## Modlar

- **Listeye Göre Kontrol:** Excel yüklenir, paletler okutulur; okunan, kalan, fazla ve mükerrer ayrılır.
- **Tara ve Listele:** Liste olmadan okutulan barkodlar tabloya yazılır, Excel olarak indirilir. M öneki atılır, kalan rakamlar yazılır (`M123456789` → `123456789`). Elle girişte düz 9 hane de kabul edilir.

## Excel biçimi

İlk sütun barkod, ikinci sütun lokasyon. İlk satır başlık olabilir.

| Değer | Sonuç |
|---|---|
| `123456789` veya `M123456789` | Aynı palet sayılır |
| En az 10 karakter (`91000001234`, `N123456789`) | Kendi değeriyle listeye girer |
| Daha kısa veya başka biçim | Atlanır, Özet Rapor'da satır numarasıyla yazılır |

## Hangi barkodlar okunur

Kamera yalnız Code128, Code39 ve DataMatrix arar. Ürün barkodları (EAN, UPC) ve karekod okunmaz.

Kabul edilen değerler:

- M + 9 hane
- Tek harf (isteğe bağlı) + en az 9 hane, toplam en az 10 karakter
- GS1 etiketleri: içindeki SSCC, seri veya GTIN değeri

Etikette M + 9 hane barkod varsa önce o alınır. Bir değerin kabul edilmesi için art arda birkaç karede aynı okunması gerekir. Aynı etiket görünmeye devam ettiği sürece yeniden sayılmaz; 2 saniye görünmedikten sonra okunursa mükerrer sayılır.

## Okuma motoru

Telefonda yerleşik barkod motoru varsa (Android Chrome) o kullanılır; bulamazsa veya yoksa `lib/` içindeki `zxing-wasm` devreye girer. Çözme yalnız Basılı Tut'a basılıyken yapılır.

## Dosyalar

| Dosya | Görev |
|---|---|
| `index.html`, `style.css` | Ekran |
| `app.js` | Sayım, rapor, Excel, kayıt |
| `tarayici.js` | Barkod kuralları, kamera, çözme |
| `sw.js` | Çevrimdışı çalışma |
| `lib/` | `xlsx-js-style` ve `zxing-wasm` (MIT lisanslı), yerel kopya |

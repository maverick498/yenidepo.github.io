// ==========================================
// GLOBAL DEĞİŞKENLER VE YAPILANDIRMA
// ==========================================

// Veri Yapısı - O(1) karmaşıklık için Object kullanımı
let paletDatabase = {}; // { "123456789": "TTA101", ... }
let scannedPalets = {}; // { "123456789": timestamp, ... }
let extraPalets = []; // Listede olmayan paletler (her palet bir kez)
let scanHistory = []; // Tarama geçmişi
let yuklemeNotlari = []; // Excel'de atlanan veya şüpheli satırlar
let sonOkuma = null; // { barcode, location, durum }

// Mod Değişkenleri
let currentAppMode = 'home'; // 'home', 'list', 'free'
let freeScanList = []; // { id, barcode, timestamp }
let freeScanDuplicateMode = null; // true, false, veya null
let freeScanDuplicates = {}; // Mükerrerleri saymak için: { barcode: count }

// Kamera ve Tarayıcı
let listeTarayici = null;
let serbestTarayici = null;
let isScanning = false;
let isScanningEnabled = false; // Okuma aktif mi?
let kameraAciliyor = false;
let isFreeScanning = false;
let isFreeScanningEnabled = false;
let serbestKameraAciliyor = false;

// Manuel girişte aynı barkodun çok hızlı tekrarını engeller
let lastScannedBarcode = null;
let lastScannedTime = 0;
const MANUEL_LISTE_KORUMA_MS = 1000;
const MANUEL_SERBEST_KORUMA_MS = 2000;

const STORAGE_KEY = 'depo-kontrol-data';
const EN_COK_BILDIRIM = 2;

// Ses (Web Audio API)
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// DOM Elementleri
let elements = {};

// HTML içine yazılan her dış veri bundan geçer (Excel hücresi, barkod içeriği)
const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const lokasyonMetni = (l) => (l === undefined || l === null || l === '' ? 'Lokasyon yok' : l);

// ==========================================
// SAYFA YÜKLENDİĞİNDE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    attachEventListeners();
    listeTarayici = new BarkodTarayici({
        kap: elements.reader,
        kutu: elements.cameraOverlay.querySelector('.scan-box'),
        onKabul: (deger) => onScanSuccess(deger)
    });
    serbestTarayici = new BarkodTarayici({
        kap: elements.freeReader,
        kutu: elements.freeCameraOverlay.querySelector('.scan-box'),
        onKabul: (deger) => handleFreeScan(serbestKayitDegeri(deger))
    });
    const restored = loadFromStorage();
    updateStats();
    updateHistoryList();
    updateFreeTable();
    sonOkumaGoster();
    basligaGoreKaydirmaPayi();
    if (restored) {
        showToast('✅ Oturum geri yüklendi', 'success');
    }
});

// ==========================================
// DOM ELEMENTLERINI BAŞLATMA
// ==========================================
function initializeElements() {
    const id = (x) => document.getElementById(x);
    elements = {
        header: document.querySelector('.header'),

        // Home
        homeSection: id('homeSection'),
        btnModeList: id('btnModeList'),
        btnModeFree: id('btnModeFree'),

        // Free Scan Mode
        freeScanSection: id('freeScanSection'),
        freeBackBtn: id('freeBackBtn'),
        freeStartCameraBtn: id('freeStartCameraBtn'),
        freeStopCameraBtn: id('freeStopCameraBtn'),
        freeManualBarcodeInput: id('freeManualBarcodeInput'),
        freeManualSubmitBtn: id('freeManualSubmitBtn'),
        freeCameraContainer: id('freeCameraContainer'),
        freeReader: id('freeReader'),
        freeCameraOverlay: id('freeCameraOverlay'),
        freeScanControl: id('freeScanControl'),
        freeScanBtn: id('freeScanBtn'),
        freeSummaryCount: id('freeSummaryCount'),
        freeLastBarcode: id('freeLastBarcode'),
        btnShowFreeReport: id('btnShowFreeReport'),
        freeReportModal: id('freeReportModal'),
        closeFreeReportBtn: id('closeFreeReportBtn'),
        freeTableBody: id('freeTableBody'),
        exportFreeScansBtn: id('exportFreeScansBtn'),
        clearFreeScansBtn: id('clearFreeScansBtn'),
        freeClearAllBtn: id('freeClearAllBtn'),
        freeDuplicatesContainer: id('freeDuplicatesContainer'),
        freeDuplicatesList: id('freeDuplicatesList'),
        duplicateModeModal: id('duplicateModeModal'),
        btnDuplicateYes: id('btnDuplicateYes'),
        btnDuplicateNo: id('btnDuplicateNo'),

        // Upload
        uploadSection: id('uploadSection'),
        uploadBox: id('uploadBox'),
        fileInput: id('fileInput'),
        uploadBtn: id('uploadBtn'),

        // Scanner
        scannerSection: id('scannerSection'),
        scannerBackBtn: id('scannerBackBtn'),
        listStatsPanel: id('listStatsPanel'),
        startCameraBtn: id('startCameraBtn'),
        stopCameraBtn: id('stopCameraBtn'),
        changeFileBtn: id('changeFileBtn'),
        scanControl: id('scanControl'),
        scanBtn: id('scanBtn'),
        reader: id('reader'),
        cameraOverlay: id('cameraOverlay'),

        // Stats
        totalCount: id('totalCount'),
        scannedCount: id('scannedCount'),
        remainingCount: id('remainingCount'),
        extraCount: id('extraCount'),

        // Progress Bar
        progressFill: id('progressFill'),
        progressText: id('progressText'),

        // Last Scan Info
        lastScanInfo: id('lastScanInfo'),
        lastBarcode: id('lastBarcode'),
        lastLocation: id('lastLocation'),

        // History
        historyList: id('historyList'),

        // Report & Export
        reportSection: id('reportSection'),
        showReportBtn: id('showReportBtn'),
        exportScannedBtn: id('exportScannedBtn'),
        exportUnscannedBtn: id('exportUnscannedBtn'),
        clearAllBtn: id('clearAllBtn'),
        reportModal: id('reportModal'),
        closeModalBtn: id('closeModalBtn'),
        reportContent: id('reportContent'),

        // Manual Entry
        manualBarcodeInput: id('manualBarcodeInput'),
        manualSubmitBtn: id('manualSubmitBtn'),

        // Dark Mode
        darkModeToggle: id('darkModeToggle'),

        // Toast
        toastContainer: id('toastContainer')
    };
}

// ==========================================
// EVENT LISTENER'LARI BAĞLAMA
// ==========================================
// Basılı tut düğmesi: dokunma ve fare
function basiliTutBagla(dugme, bas, birak) {
    dugme.addEventListener('mousedown', bas);
    dugme.addEventListener('mouseup', birak);
    dugme.addEventListener('mouseleave', birak);
    dugme.addEventListener('touchstart', (e) => {
        e.preventDefault();
        bas();
    });
    dugme.addEventListener('touchend', (e) => {
        e.preventDefault();
        birak();
    });
    dugme.addEventListener('touchcancel', birak);
}

function attachEventListeners() {
    // Mode Selection (Home)
    elements.btnModeList.addEventListener('click', startListMode);
    elements.btnModeFree.addEventListener('click', startFreeMode);
    // Kartlar div; Enter ve Boşluk ile de açılsın (klavye, el terminali tuşları)
    [elements.btnModeList, elements.btnModeFree].forEach(kart => {
        kart.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                kart.click();
            }
        });
    });

    // Back Buttons
    document.getElementById('listBackBtn').addEventListener('click', showHome);
    elements.freeBackBtn.addEventListener('click', showHome);
    elements.scannerBackBtn.addEventListener('click', showHome);

    // Free Scan Mode
    elements.freeStartCameraBtn.addEventListener('click', startFreeCamera);
    elements.freeStopCameraBtn.addEventListener('click', stopFreeCamera);
    elements.freeManualSubmitBtn.addEventListener('click', handleFreeManualEntry);
    elements.freeManualBarcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleFreeManualEntry();
        }
    });
    basiliTutBagla(elements.freeScanBtn, startFreeScanning, stopFreeScanning);

    // Free Scan Modal & Export
    elements.btnShowFreeReport.addEventListener('click', () => {
        elements.freeReportModal.classList.add('active');
    });
    elements.closeFreeReportBtn.addEventListener('click', () => {
        elements.freeReportModal.classList.remove('active');
    });
    elements.freeReportModal.addEventListener('click', (e) => {
        if (e.target === elements.freeReportModal) {
            elements.freeReportModal.classList.remove('active');
        }
    });
    elements.exportFreeScansBtn.addEventListener('click', exportFreeScansToExcel);
    elements.clearFreeScansBtn.addEventListener('click', clearFreeScans);
    elements.freeClearAllBtn.addEventListener('click', clearFreeScans);

    // Excel yükleme
    elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());
    elements.uploadBox.addEventListener('click', (e) => {
        if (!e.target.closest('#uploadBtn') && e.target !== elements.fileInput) {
            elements.fileInput.click();
        }
    });
    elements.fileInput.addEventListener('change', handleFileUpload);

    // Kamera kontrolleri
    elements.startCameraBtn.addEventListener('click', startCamera);
    elements.stopCameraBtn.addEventListener('click', stopCamera);
    elements.changeFileBtn.addEventListener('click', changeFile);
    basiliTutBagla(elements.scanBtn, startScanning, stopScanning);

    // Rapor
    elements.showReportBtn.addEventListener('click', showReport);
    elements.closeModalBtn.addEventListener('click', closeReport);
    elements.exportScannedBtn.addEventListener('click', () => exportToExcel('scanned'));
    elements.exportUnscannedBtn.addEventListener('click', () => exportToExcel('unscanned'));
    elements.clearAllBtn.addEventListener('click', clearAllData);
    elements.reportModal.addEventListener('click', (e) => {
        if (e.target === elements.reportModal) {
            closeReport();
        }
    });

    // Manuel barkod girişi
    elements.manualSubmitBtn.addEventListener('click', handleManualEntry);
    elements.manualBarcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleManualEntry();
        }
    });
    // Baştaki tek harf ve rakamlar kalır
    elements.manualBarcodeInput.addEventListener('input', (e) => {
        const value = e.target.value.toUpperCase();
        const bas = /^[A-Z]/.test(value) ? value[0] : '';
        e.target.value = bas + value.slice(bas.length).replace(/[^0-9]/g, '');
    });

    // Dark Mode Toggle
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);

    // Drag & Drop
    ['dragenter', 'dragover'].forEach((event) => {
        elements.uploadBox.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.uploadBox.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach((event) => {
        elements.uploadBox.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.uploadBox.classList.remove('dragover');
        });
    });
    elements.uploadBox.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            elements.fileInput.files = files;
            elements.fileInput.dispatchEvent(new Event('change'));
        }
    });

    // Ripple Effect on all buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && !btn.classList.contains('dark-mode-toggle') && !btn.classList.contains('modal-close') && !btn.classList.contains('toast-close')) {
            createRipple(e, btn);
        }
    });

    window.addEventListener('resize', basligaGoreKaydirmaPayi);
}

// Odaklanan kutu yapışkan başlığın ve düğmenin altında kalmasın
function basligaGoreKaydirmaPayi() {
    if (!elements.header) return;
    const k = document.documentElement.style;
    k.scrollPaddingTop = `${Math.round(elements.header.getBoundingClientRect().height) + 12}px`;
    k.scrollPaddingBottom = '110px';
}

function gorunurYap(el) {
    const r = el.getBoundingClientRect();
    const ust = elements.header.getBoundingClientRect().bottom + 8;
    const alt = window.innerHeight - 12;
    if (r.top < ust) window.scrollBy(0, r.top - ust);
    else if (r.bottom > alt) window.scrollBy(0, r.bottom - alt);
}

// Kamera açılınca kullanıcı onu ekranda görmeli
function kamerayiGorunurYap(kutu, kontrol) {
    requestAnimationFrame(() => {
        const r = kutu.getBoundingClientRect();
        const ust = elements.header.getBoundingClientRect().bottom;
        const alt = kontrol.getBoundingClientRect().top;
        if (r.top < ust - 12) window.scrollBy(0, r.top - ust - 6);
        else if (r.bottom > alt + 12) window.scrollBy(0, r.bottom - alt + 6);
    });
}

// Klavyeyi kapatır: okuma sırasında odak bir giriş kutusunda kalmamalı
function odagiBirak() {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) a.blur();
}

// ==========================================
// EXCEL DOSYASI YÜKLEME VE İŞLEME
// ==========================================
// Excel'deki değeri liste anahtarına çevirir: 9 hane, M + 9 hane veya en az 10 karakter
function excelBarkodAnahtari(ham) {
    if (ham === undefined || ham === null) return null;
    const m = String(ham).trim().toUpperCase();
    if (/^\d{9}$/.test(m)) return m;
    const c = barkodCoz(m);
    return c ? listeAnahtari(c.deger) : null;
}

// Tara ve Listele kaydı: M öneki atılır, kalan rakamlar yazılır (M123456789 → 123456789)
function serbestKayitDegeri(deger) {
    const m = /^M(\d{9,})$/.exec(deger);
    return m ? m[1] : deger;
}

function excelSatirlariniOku(satirlar) {
    const db = {};
    const notlar = [];
    let tekrar = 0;
    let lokasyonsuz = 0;
    let gecersiz = 0;
    const ilk = satirlar[0] || [];
    const baslikVar = excelBarkodAnahtari(ilk[0]) === null;
    const bos = (v) => v === undefined || v === null || String(v).trim() === '';

    for (let i = baslikVar ? 1 : 0; i < satirlar.length; i++) {
        const satir = satirlar[i] || [];
        const hamBarkod = satir[0];
        const hamYer = satir[1];
        if (bos(hamBarkod) && bos(hamYer)) continue;
        const anahtar = excelBarkodAnahtari(hamBarkod);
        if (!anahtar) {
            gecersiz++;
            notlar.push(`${i + 1}. satır atlandı: "${bos(hamBarkod) ? 'boş' : String(hamBarkod).trim()}" geçerli barkod değil`);
            continue;
        }
        const yer = bos(hamYer) ? '' : String(hamYer).trim();
        if (!yer) {
            lokasyonsuz++;
            notlar.push(`${i + 1}. satır: ${anahtar} için lokasyon boş`);
        }
        if (Object.prototype.hasOwnProperty.call(db, anahtar)) {
            tekrar++;
            notlar.push(`${i + 1}. satır: ${anahtar} tekrar ediyor${db[anahtar] !== yer ? `, son lokasyon alındı (${yer || 'boş'})` : ''}`);
        }
        db[anahtar] = yer;
    }
    return { db, notlar, tekrar, lokasyonsuz, gecersiz, baslikVar };
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast('📂 Dosya yükleniyor...', 'info');

    const hata = (mesaj) => {
        showToast(mesaj, 'error');
        playSound('error');
        vibrate([200, 100, 200]);
    };

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const satirlar = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        const sonuc = excelSatirlariniOku(satirlar);
        const adet = Object.keys(sonuc.db).length;

        if (satirlar.length < 2 && sonuc.baslikVar) {
            hata('❌ Dosyada yeterli veri yok!');
            return;
        }
        if (adet === 0) {
            hata('❌ Dosyada geçerli barkod bulunamadı!');
            return;
        }

        paletDatabase = sonuc.db;
        yuklemeNotlari = sonuc.notlar;
        scannedPalets = {};
        extraPalets = [];
        scanHistory = [];
        sonOkuma = null;
        lastScannedBarcode = null;
        lastScannedTime = 0;

        const uyarilar = [];
        if (sonuc.gecersiz) uyarilar.push(`${sonuc.gecersiz} satır atlandı`);
        if (sonuc.tekrar) uyarilar.push(`${sonuc.tekrar} tekrar eden barkod`);
        if (sonuc.lokasyonsuz) uyarilar.push(`${sonuc.lokasyonsuz} lokasyonsuz palet`);
        if (uyarilar.length) {
            showToast(`⚠️ ${adet} palet yüklendi. ${uyarilar.join(', ')}. Ayrıntı Özet Rapor'da.`, 'warning', 7000);
        } else {
            showToast(`✅ ${adet} palet yüklendi!`, 'success');
        }
        playSound('success');
        vibrate([100]);

        elements.uploadSection.style.display = 'none';
        elements.scannerSection.style.display = 'block';
        elements.reportSection.style.display = 'flex';

        updateStats();
        updateHistoryList();
        sonOkumaGoster();
        saveToStorage();
    } catch (error) {
        console.error('Dosya okuma hatası:', error);
        hata('❌ Dosya okunamadı!');
    } finally {
        // Aynı dosya düzeltilip yeniden seçilebilsin
        elements.fileInput.value = '';
    }
}

// ==========================================
// KAMERA: LİSTEYE GÖRE KONTROL
// ==========================================
async function startCamera() {
    if (isScanning || kameraAciliyor) return;
    kameraAciliyor = true;
    sesiAc();
    try {
        await listeTarayici.baslat();
        isScanning = true;
        elements.startCameraBtn.style.display = 'none';
        elements.stopCameraBtn.style.display = 'inline-flex';
        elements.scanControl.style.display = 'block';
        elements.cameraOverlay.style.display = 'block';
        requestWakeLock();
        showToast('📷 Kamera başlatıldı', 'success');
        playSound('success');
        kamerayiGorunurYap(elements.reader.parentElement, elements.scanControl);
    } catch (err) {
        if (err && err.iptal) return;
        console.error('Kamera başlatma hatası:', err);
        showToast('❌ Kamera erişim hatası!', 'error');
        playSound('error');
        vibrate([200, 100, 200]);
    } finally {
        kameraAciliyor = false;
    }
}

function stopCamera() {
    if (!isScanning && !kameraAciliyor) return;
    const acikti = isScanning;
    stopScanning();
    isScanning = false;
    listeTarayici.durdur();
    elements.startCameraBtn.style.display = 'inline-flex';
    elements.stopCameraBtn.style.display = 'none';
    elements.scanControl.style.display = 'none';
    elements.cameraOverlay.style.display = 'none';
    releaseWakeLock();
    if (acikti) showToast('⏹️ Kamera durduruldu', 'info');
}

// ==========================================
// OKUMA KONTROLÜ - Basılı Tut
// ==========================================
function startScanning() {
    if (!isScanning) return;
    sesiAc();
    odagiBirak();
    isScanningEnabled = true;
    elements.scanBtn.classList.add('scanning');
    elements.cameraOverlay.classList.add('scanning');
    vibrate([50]);
    listeTarayici.okumayiAc();
}

function stopScanning() {
    isScanningEnabled = false;
    elements.scanBtn.classList.remove('scanning');
    elements.cameraOverlay.classList.remove('scanning');
    if (listeTarayici) listeTarayici.okumayiKapat();
}

// Tarayıcının onayladığı değer: kurallara uyan, art arda okunmuş barkod
function onScanSuccess(deger) {
    if (!isScanningEnabled) return;
    const anahtar = listeAnahtari(deger);
    lastScannedBarcode = anahtar;
    lastScannedTime = Date.now();
    processScan(anahtar);
}

// ==========================================
// MANUEL BARKOD GİRİŞİ
// ==========================================
function handleManualEntry() {
    const girilen = elements.manualBarcodeInput.value.trim().toUpperCase();

    if (!girilen) {
        showToast('❌ Lütfen bir barkod girin!', 'error');
        elements.manualBarcodeInput.focus();
        return;
    }

    // Elle yazarken M yazılmayabilir: 9 hane de kabul edilir
    const anahtar = excelBarkodAnahtari(girilen);

    if (!anahtar) {
        showToast('❌ Geçersiz barkod! 9 hane veya en az 10 karakter (M + 9 hane) gerekli.', 'error');
        playSound('error');
        vibrate([200, 100, 200]);
        elements.manualBarcodeInput.focus();
        elements.manualBarcodeInput.select();
        return;
    }

    const simdi = Date.now();
    if (anahtar === lastScannedBarcode && (simdi - lastScannedTime) < MANUEL_LISTE_KORUMA_MS) {
        showToast('⚠️ Aynı barkod çok hızlı giriliyor!', 'warning');
        return;
    }

    lastScannedBarcode = anahtar;
    lastScannedTime = simdi;

    processScan(anahtar);

    elements.manualBarcodeInput.value = '';
    if (isScanning) {
        // Kamera açıkken klavye kapansın: okumaya dönülecek
        odagiBirak();
    } else {
        elements.manualBarcodeInput.focus({ preventScroll: true });
        gorunurYap(elements.manualBarcodeInput);
    }
}

// ==========================================
// TARAMA İŞ MANTIĞI
// ==========================================
function processScan(barcode) {
    const timestamp = new Date();

    if (Object.prototype.hasOwnProperty.call(paletDatabase, barcode)) {
        const location = paletDatabase[barcode];
        if (Object.prototype.hasOwnProperty.call(scannedPalets, barcode)) {
            handleDuplicateScan(barcode, location, timestamp);
        } else {
            handleSuccessfulScan(barcode, location, timestamp);
        }
    } else {
        handleExtraPalet(barcode, timestamp);
    }

    updateStats();
    updateHistoryList();
    saveToStorage();
}

function sonOkumaYaz(barcode, location, durum) {
    sonOkuma = { barcode, location, durum };
    sonOkumaGoster();
}

function sonOkumaGoster() {
    if (!elements.lastScanInfo) return;
    elements.lastScanInfo.dataset.durum = sonOkuma ? (sonOkuma.durum || 'success') : 'bos';
    elements.lastBarcode.textContent = sonOkuma ? sonOkuma.barcode : '-';
    elements.lastLocation.textContent = sonOkuma ? lokasyonMetni(sonOkuma.location) : '-';
}

function handleSuccessfulScan(barcode, location, timestamp) {
    scannedPalets[barcode] = timestamp.getTime();
    scanHistory.unshift({ barcode, location, status: 'success', timestamp });
    sonOkumaYaz(barcode, location, 'success');
    playSound('success');
    vibrate([100]);
    showScanFlash();
}

function handleDuplicateScan(barcode, location, timestamp) {
    scanHistory.unshift({ barcode, location, status: 'duplicate', timestamp });
    sonOkumaYaz(barcode, location, 'duplicate');
    showToast(`⚠️ ${barcode} - Zaten Okundu!`, 'warning');
    playSound('warning');
    vibrate([100, 100, 100]);
}

function handleExtraPalet(barcode, timestamp) {
    if (!extraPalets.includes(barcode)) extraPalets.push(barcode);
    scanHistory.unshift({ barcode, location: 'Listede Yok', status: 'error', timestamp });
    sonOkumaYaz(barcode, 'Listede Yok', 'error');
    showToast(`❌ ${barcode} - Fazla Palet!`, 'error');
    playSound('error');
    vibrate([200, 100, 200]);
}

// ==========================================
// İSTATİSTİKLERİ GÜNCELLEME
// ==========================================
function updateStats() {
    const total = Object.keys(paletDatabase).length;
    const scanned = Object.keys(scannedPalets).length;
    const remaining = total - scanned;
    const extra = extraPalets.length;

    updateStatValue(elements.totalCount, total);
    updateStatValue(elements.scannedCount, scanned);
    updateStatValue(elements.remainingCount, remaining);
    updateStatValue(elements.extraCount, extra);

    if (elements.progressFill && elements.progressText) {
        const percent = total > 0 ? Math.round((scanned / total) * 100) : 0;
        elements.progressFill.style.width = percent + '%';
        elements.progressText.textContent = `%${percent} tamamlandı`;
    }
}

function updateStatValue(el, newValue) {
    if (!el) return;
    const oldValue = el.textContent;
    el.textContent = newValue;
    if (oldValue !== String(newValue)) {
        el.classList.remove('pulse');
        void el.offsetWidth; // Force reflow to restart animation
        el.classList.add('pulse');
    }
}

// ==========================================
// GEÇMİŞ LİSTESİNİ GÜNCELLEME
// ==========================================
function updateHistoryList() {
    if (scanHistory.length === 0) {
        elements.historyList.innerHTML = '<p class="empty-message">Henüz okutma yapılmadı</p>';
        return;
    }

    const recentHistory = scanHistory.slice(0, 20);

    elements.historyList.innerHTML = recentHistory.map((item) => {
        const statusClass = esc(item.status);
        return `
            <div class="history-item ${statusClass}">
                <div class="history-item-header">
                    <span class="history-barcode">${esc(item.barcode)}</span>
                    <span class="history-time">${esc(formatTime(item.timestamp))}</span>
                </div>
                <div class="history-location">📍 ${esc(lokasyonMetni(item.location))}</div>
                <span class="history-status ${statusClass}">${esc(getStatusText(item.status))}</span>
            </div>
        `;
    }).join('');
}

function getStatusText(status) {
    const statusMap = {
        success: '✅ Başarılı',
        duplicate: '⚠️ Mükerrer',
        error: '❌ Fazla Palet'
    };
    return statusMap[status] || status;
}

function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// ==========================================
// TOAST BİLDİRİMLERİ
// ==========================================
// Ekranın üstünde çıkar: kamerayı ve Basılı Tut düğmesini kapatmaz. Aynı anda en çok iki bildirim.
function showToast(message, type = 'info', sure = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const mesaj = document.createElement('div');
    mesaj.className = 'toast-message';
    mesaj.textContent = message;

    const kapat = document.createElement('button');
    kapat.className = 'toast-close';
    kapat.type = 'button';
    kapat.textContent = '×';
    kapat.setAttribute('aria-label', 'Kapat');
    kapat.addEventListener('click', () => toast.remove());

    const ilerleme = document.createElement('div');
    ilerleme.className = 'toast-progress';
    ilerleme.style.animationDuration = `${sure}ms`;

    toast.append(mesaj, kapat, ilerleme);
    elements.toastContainer.appendChild(toast);
    while (elements.toastContainer.children.length > EN_COK_BILDIRIM) {
        elements.toastContainer.firstElementChild.remove();
    }

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, sure);
}

// ==========================================
// SES ÜRETİMİ (Web Audio API)
// ==========================================
// Telefon tarayıcıları sesi ancak bir dokunuştan sonra açar
let sesAcildi = false;
function sesiAc() {
    if (sesAcildi || !audioContext) return;
    sesAcildi = true;
    audioContext.resume().catch(() => { sesAcildi = false; });
}

function bip(frekans, tur, ses, sure) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = frekans;
    oscillator.type = tur;
    gainNode.gain.setValueAtTime(ses, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sure);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + sure);
}

function playSound(type) {
    if (!audioContext) return;
    switch (type) {
        case 'success':
            bip(800, 'sine', 0.3, 0.15);
            break;
        case 'warning':
            bip(600, 'square', 0.2, 0.1);
            setTimeout(() => bip(600, 'square', 0.2, 0.1), 150);
            break;
        case 'error':
            bip(300, 'sawtooth', 0.3, 0.3);
            break;
        default:
            bip(500, 'sine', 0.2, 0.1);
    }
}

// ==========================================
// TİTREŞİM (Vibration API)
// ==========================================
function vibrate(pattern) {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

// ==========================================
// VERİ SAKLAMA (localStorage)
// ==========================================
function saveToStorage() {
    try {
        const hasData = Object.keys(paletDatabase).length > 0 || freeScanList.length > 0;
        if (!hasData) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        const data = {
            currentAppMode,
            paletDatabase,
            scannedPalets,
            extraPalets,
            yuklemeNotlari,
            scanHistory: scanHistory.map((item) => ({
                barcode: item.barcode,
                location: item.location,
                status: item.status,
                timestamp: item.timestamp instanceof Date ? item.timestamp.toISOString() : item.timestamp
            })),
            lastScan: sonOkuma,
            freeScanList,
            freeScanDuplicateMode,
            freeScanDuplicates,
            savedAt: Date.now()
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error('Veri kaydetme hatası:', error);
        showToast('⚠️ Veri kaydedilemedi — depolama dolu olabilir', 'warning');
    }
}

function kayitGecerliMi(data) {
    const nesne = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    if (!nesne(data)) return false;
    const istege = (x, kosul) => x === undefined || kosul(x);
    return istege(data.paletDatabase, nesne)
        && istege(data.scannedPalets, nesne)
        && istege(data.extraPalets, Array.isArray)
        && istege(data.scanHistory, Array.isArray)
        && istege(data.freeScanList, Array.isArray)
        && istege(data.freeScanDuplicates, nesne)
        && istege(data.yuklemeNotlari, Array.isArray);
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const data = JSON.parse(raw);
        if (!kayitGecerliMi(data)) {
            localStorage.removeItem(STORAGE_KEY);
            return false;
        }

        const hasList = data.paletDatabase && Object.keys(data.paletDatabase).length > 0;
        const hasFree = data.freeScanList && data.freeScanList.length > 0;
        if (!hasList && !hasFree) {
            return false;
        }

        currentAppMode = data.currentAppMode || 'home';
        paletDatabase = data.paletDatabase || {};
        scannedPalets = data.scannedPalets || {};
        extraPalets = [...new Set(data.extraPalets || [])];
        yuklemeNotlari = data.yuklemeNotlari || [];
        scanHistory = (data.scanHistory || []).map((item) => ({
            ...item,
            timestamp: new Date(item.timestamp)
        }));
        sonOkuma = data.lastScan || null;

        // Eski kayıtlarda M önekli değerler olabilir: yeni kurala çevrilir, mükerrer kontrolü bozulmaz
        freeScanList = (data.freeScanList || []).map((item) => (
            item && typeof item.barcode === 'string' ? { ...item, barcode: serbestKayitDegeri(item.barcode) } : item
        ));
        freeScanDuplicateMode = data.freeScanDuplicateMode !== undefined ? data.freeScanDuplicateMode : null;
        freeScanDuplicates = {};
        Object.entries(data.freeScanDuplicates || {}).forEach(([barkod, adet]) => {
            const yeni = serbestKayitDegeri(barkod);
            freeScanDuplicates[yeni] = yeni in freeScanDuplicates ? freeScanDuplicates[yeni] + adet : adet;
        });

        if (currentAppMode === 'list') {
            startListMode();
        } else if (currentAppMode === 'free') {
            startFreeMode();
        } else {
            showHome();
        }

        return true;
    } catch (error) {
        console.error('Veri yükleme hatası:', error);
        localStorage.removeItem(STORAGE_KEY);
        return false;
    }
}

// ==========================================
// LOKASYONA GÖRE SIRALAMA
// ==========================================
function parseLocation(location) {
    const str = String(location || '').trim();
    const match = str.match(/^([A-Za-z]+)(\d+)$/);
    if (match) {
        return { prefix: match[1].toUpperCase(), num: parseInt(match[2], 10), raw: str };
    }
    return { prefix: str.toUpperCase(), num: 0, raw: str };
}

function compareByLocation(a, b) {
    const locA = typeof a === 'string' ? a : a.location;
    const locB = typeof b === 'string' ? b : b.location;
    const pa = parseLocation(locA);
    const pb = parseLocation(locB);

    const prefixCompare = pa.prefix.localeCompare(pb.prefix);
    if (prefixCompare !== 0) return prefixCompare;
    if (pa.num !== pb.num) return pa.num - pb.num;
    return pa.raw.localeCompare(pb.raw, 'tr');
}

function getScannedListSorted() {
    return Object.keys(scannedPalets).map((barcode) => ({
        barcode,
        location: paletDatabase[barcode],
        timestamp: scannedPalets[barcode]
    })).sort((a, b) => compareByLocation(a, b) || a.barcode.localeCompare(b.barcode));
}

function getUnscannedListSorted() {
    return Object.keys(paletDatabase)
        .filter((barcode) => !Object.prototype.hasOwnProperty.call(scannedPalets, barcode))
        .map((barcode) => ({ barcode, location: paletDatabase[barcode] }))
        .sort((a, b) => compareByLocation(a, b) || a.barcode.localeCompare(b.barcode));
}

// ==========================================
// EXCEL DIŞA AKTARMA
// ==========================================
// Dosya adı yerel saate göre: gece yarısından sonra tarih geride kalmasın
function dosyaZamani(now = new Date()) {
    const c = (n) => String(n).padStart(2, '0');
    return {
        tarih: `${now.getFullYear()}-${c(now.getMonth() + 1)}-${c(now.getDate())}`,
        saat: `${c(now.getHours())}${c(now.getMinutes())}`
    };
}

function getExportFilename(prefix) {
    const z = dosyaZamani();
    return `${prefix}_${z.tarih}_${z.saat}.xlsx`;
}

function fazlaOkumaSayisi(barcode) {
    return scanHistory.filter((x) => x.status === 'error' && x.barcode === barcode).length;
}

function exportToExcel(type) {
    if (Object.keys(paletDatabase).length === 0) {
        showToast('❌ Önce Excel dosyası yükleyin!', 'error');
        return;
    }

    try {
        if (type === 'scanned') {
            const list = getScannedListSorted();
            if (list.length === 0 && extraPalets.length === 0) {
                showToast('⚠️ Henüz okunan palet yok!', 'warning');
                return;
            }

            const wb = XLSX.utils.book_new();
            if (list.length > 0) {
                const rows = [
                    ['Barkod', 'Lokasyon', 'Okuma Zamanı'],
                    ...list.map((item) => [
                        item.barcode,
                        item.location,
                        new Date(item.timestamp).toLocaleString('tr-TR')
                    ])
                ];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Okunan Paletler');
            }
            if (extraPalets.length > 0) {
                const rows = [
                    ['Barkod', 'Okunma Sayısı'],
                    ...extraPalets.map((b) => [b, fazlaOkumaSayisi(b) || 1])
                ];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Fazla Paletler');
            }
            XLSX.writeFile(wb, getExportFilename('okunan-paletler'));
            const ek = extraPalets.length ? `, ${extraPalets.length} fazla` : '';
            showToast(`✅ ${list.length} okunan palet${ek} indirildi`, 'success');
        } else if (type === 'unscanned') {
            const list = getUnscannedListSorted();
            if (list.length === 0) {
                showToast('🎉 Tüm paletler okunmuş!', 'success');
                return;
            }

            const rows = [
                ['Barkod', 'Lokasyon'],
                ...list.map((item) => [item.barcode, item.location])
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Okunmayan Paletler');
            XLSX.writeFile(wb, getExportFilename('okunmayan-paletler'));
            showToast(`✅ ${list.length} okunmayan palet indirildi`, 'success');
        }
    } catch (error) {
        console.error('Excel export hatası:', error);
        showToast('❌ Excel indirilemedi!', 'error');
    }
}

// ==========================================
// LİSTE VERİSİNİ SIFIRLAMA
// ==========================================
// Yalnız liste verisi silinir; Tara ve Listele kaydı durur.
function listeVerisiniSil() {
    stopCamera();
    paletDatabase = {};
    scannedPalets = {};
    extraPalets = [];
    scanHistory = [];
    yuklemeNotlari = [];
    sonOkuma = null;
    lastScannedBarcode = null;
    lastScannedTime = 0;

    elements.scannerSection.style.display = 'none';
    elements.reportSection.style.display = 'none';
    elements.uploadSection.style.display = 'block';
    elements.fileInput.value = '';

    updateStats();
    updateHistoryList();
    sonOkumaGoster();
    saveToStorage();
}

function clearAllData() {
    const confirmed = confirm(
        'Tüm veriler silinecek:\n\n' +
        '• Yüklenen Excel listesi\n' +
        '• Okunan / okunmayan kayıtlar\n' +
        '• Tarama geçmişi\n\n' +
        'Bu işlem geri alınamaz. Devam etmek istiyor musunuz?'
    );
    if (!confirmed) return;

    listeVerisiniSil();
    showToast('🗑️ Tüm veriler temizlendi', 'info');
}

function changeFile() {
    const okunan = Object.keys(scannedPalets).length;
    const fazla = extraPalets.length;
    if (okunan > 0 || fazla > 0) {
        const onay = confirm(
            `Dosya değiştirilirse bu sayım silinir:\n\n• ${okunan} okunan palet\n• ${fazla} fazla palet\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`
        );
        if (!onay) return;
    }
    listeVerisiniSil();
    showToast('🔄 Yeni dosya yükleyebilirsiniz', 'info');
}

// ==========================================
// RAPOR GÖSTERME
// ==========================================
function showReport() {
    const total = Object.keys(paletDatabase).length;
    const scanned = Object.keys(scannedPalets).length;
    const remaining = total - scanned;
    const extra = extraPalets.length;
    const percent = total > 0 ? Math.round((scanned / total) * 100) : 0;

    const unscannedPalets = getUnscannedListSorted();
    const scannedPaletsArray = getScannedListSorted();

    // Mükerrer okutulan paletler (geçmişten bul)
    const duplicateMap = {};
    scanHistory.forEach((item) => {
        if (item.status === 'duplicate') {
            if (!duplicateMap[item.barcode]) {
                duplicateMap[item.barcode] = { barcode: item.barcode, location: item.location, count: 1 };
            } else {
                duplicateMap[item.barcode].count++;
            }
        }
    });
    const duplicatePalets = Object.values(duplicateMap).sort(compareByLocation);

    const radius = 48;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (percent / 100) * circumference;

    let reportHTML = `
        <div class="report-progress-ring">
            <svg width="120" height="120" viewBox="0 0 120 120">
                <circle class="ring-bg" cx="60" cy="60" r="${radius}"/>
                <circle class="ring-fill" cx="60" cy="60" r="${radius}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${dashOffset}"/>
            </svg>
            <span class="report-progress-text">%${percent}</span>
        </div>
        <div class="report-summary">
            <h3>Genel Özet</h3>
            <div class="report-stats-grid">
                <div class="report-stat-card"><span class="label">Toplam Palet</span><span class="value">${total}</span></div>
                <div class="report-stat-card success"><span class="label">Okunan</span><span class="value">${scanned}</span></div>
                <div class="report-stat-card warning"><span class="label">Kalan</span><span class="value">${remaining}</span></div>
                <div class="report-stat-card error"><span class="label">Fazla / Mükerrer</span><span class="value">${extra} / ${duplicatePalets.length}</span></div>
            </div>
        </div>
    `;

    const blok = (baslik, sinif, satirlar) => `
        <div class="report-section-block">
            <div class="report-section-title ${sinif}">${baslik}</div>
            <div class="report-list-container">${satirlar}</div>
        </div>`;
    const dahaFazla = (n) => (n > 50 ? `<div class="report-more">... ve ${n - 50} palet daha</div>` : '');

    if (scannedPaletsArray.length > 0) {
        const satirlar = scannedPaletsArray.slice(0, 50).map((item) => {
            const time = new Date(item.timestamp).toLocaleTimeString('tr-TR');
            return `<div class="report-list-item">✓ ${esc(item.barcode)} — ${esc(lokasyonMetni(item.location))}<span class="time">${esc(time)}</span></div>`;
        }).join('');
        reportHTML += blok(`✅ Okutulan Paletler (${scannedPaletsArray.length})`, 'success', satirlar + dahaFazla(scannedPaletsArray.length));
    }

    if (duplicatePalets.length > 0) {
        const satirlar = duplicatePalets.map((item) => `<div class="report-list-item">⚠ ${esc(item.barcode)} — ${esc(lokasyonMetni(item.location))}<span class="count">${item.count + 1}x</span></div>`).join('');
        reportHTML += blok(`⚠️ Mükerrer Okutulan (${duplicatePalets.length})`, 'warning', satirlar);
    }

    if (unscannedPalets.length > 0) {
        const satirlar = unscannedPalets.slice(0, 50).map((item) => `<div class="report-list-item">○ ${esc(item.barcode)} — ${esc(lokasyonMetni(item.location))}</div>`).join('');
        reportHTML += blok(`⏳ Okunmayan Paletler (${unscannedPalets.length})`, 'warning', satirlar + dahaFazla(unscannedPalets.length));
    }

    if (extraPalets.length > 0) {
        const satirlar = extraPalets.map((barcode) => `<div class="report-list-item">✕ ${esc(barcode)}</div>`).join('');
        reportHTML += blok(`❌ Fazla Paletler (${extraPalets.length})`, 'error', satirlar);
    }

    if (yuklemeNotlari.length > 0) {
        const satirlar = yuklemeNotlari.slice(0, 50).map((n) => `<div class="report-list-item">${esc(n)}</div>`).join('');
        reportHTML += blok(`📝 Excel Yükleme Notları (${yuklemeNotlari.length})`, 'warning', satirlar);
    }

    elements.reportContent.innerHTML = reportHTML;
    elements.reportModal.classList.add('active');
}

function closeReport() {
    elements.reportModal.classList.remove('active');
}

// ==========================================
// EKRAN KAPATILMASINI ÖNLEME
// ==========================================
let wakeLock = null;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        const kilit = await navigator.wakeLock.request('screen');
        if (!isScanning && !isFreeScanning) {
            kilit.release().catch(() => {});
            return;
        }
        wakeLock = kilit;
    } catch (err) {
        console.log('Wake Lock hatası:', err);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}

document.addEventListener('visibilitychange', () => {
    const kameraAcik = isScanning || isFreeScanning;
    if (document.visibilityState === 'visible') {
        if (!kameraAcik) return;
        requestWakeLock();
        if (isScanning) listeTarayici.devamEt();
        if (isFreeScanning) serbestTarayici.devamEt();
    } else {
        // Arka plana geçerken parmağın kalktığı haber gelmeyebilir
        stopScanning();
        stopFreeScanning();
        wakeLock = null;
    }
});

// Uygulama kapanmadan önce son kez kaydet
window.addEventListener('pagehide', saveToStorage);
window.addEventListener('beforeunload', saveToStorage);

// ==========================================
// DARK MODE
// ==========================================
function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('depo-kontrol-theme', newTheme);
}

function restoreTheme() {
    const saved = localStorage.getItem('depo-kontrol-theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

restoreTheme();

// ==========================================
// RIPPLE EFFECT
// ==========================================
function createRipple(event, button) {
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    button.appendChild(ripple);
    // Düğme gizlenirse animationend hiç gelmez; zamanlayıcı öğeyi yine de siler
    setTimeout(() => ripple.remove(), 700);
}

// ==========================================
// SCAN FLASH OVERLAY
// ==========================================
function showScanFlash() {
    const flash = document.createElement('div');
    flash.className = 'scan-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
}

// ==========================================
// EKRAN YÖNETİMİ
// ==========================================
function showHome() {
    currentAppMode = 'home';
    elements.homeSection.style.display = 'block';
    elements.uploadSection.style.display = 'none';
    elements.scannerSection.style.display = 'none';
    elements.reportSection.style.display = 'none';
    elements.freeScanSection.style.display = 'none';
    elements.listStatsPanel.style.display = 'none';

    stopCamera();
    stopFreeCamera();
    basligaGoreKaydirmaPayi();
    saveToStorage();
}

function startListMode() {
    currentAppMode = 'list';
    elements.homeSection.style.display = 'none';
    elements.freeScanSection.style.display = 'none';
    elements.listStatsPanel.style.display = 'block';

    if (Object.keys(paletDatabase).length > 0) {
        elements.uploadSection.style.display = 'none';
        elements.scannerSection.style.display = 'block';
        elements.reportSection.style.display = 'flex';
    } else {
        elements.uploadSection.style.display = 'block';
        elements.scannerSection.style.display = 'none';
        elements.reportSection.style.display = 'none';
    }
    basligaGoreKaydirmaPayi();
    saveToStorage();
}

function startFreeMode() {
    currentAppMode = 'free';
    elements.homeSection.style.display = 'none';
    elements.uploadSection.style.display = 'none';
    elements.scannerSection.style.display = 'none';
    elements.reportSection.style.display = 'none';
    elements.freeScanSection.style.display = 'block';
    elements.listStatsPanel.style.display = 'none';

    updateFreeTable();
    basligaGoreKaydirmaPayi();
    saveToStorage();
}

// ==========================================
// TARA VE LİSTELE: KAMERA
// ==========================================
function startFreeCamera() {
    if (isFreeScanning || serbestKameraAciliyor) return;
    sesiAc();
    if (freeScanDuplicateMode === null) {
        // İlk kez kameraya basılıyor, mükerrer modunu sor
        elements.duplicateModeModal.classList.add('active');
        const sec = (mod) => {
            freeScanDuplicateMode = mod;
            elements.duplicateModeModal.classList.remove('active');
            saveToStorage();
            updateFreeTable();
            startFreeCameraInternal();
        };
        elements.btnDuplicateYes.onclick = () => sec(true);
        elements.btnDuplicateNo.onclick = () => sec(false);
    } else {
        startFreeCameraInternal();
    }
}

async function startFreeCameraInternal() {
    if (isFreeScanning || serbestKameraAciliyor) return;
    serbestKameraAciliyor = true;
    elements.freeCameraContainer.style.display = 'block';
    elements.freeStartCameraBtn.style.display = 'none';
    elements.freeStopCameraBtn.style.display = 'inline-flex';
    try {
        await serbestTarayici.baslat();
        isFreeScanning = true;
        elements.freeScanControl.style.display = 'block';
        elements.freeCameraOverlay.style.display = 'block';
        requestWakeLock();
        showToast('📷 Kamera başlatıldı', 'success');
        playSound('success');
        kamerayiGorunurYap(elements.freeCameraContainer, elements.freeScanControl);
    } catch (err) {
        if (err && err.iptal) return;
        console.error('Kamera başlatılamadı:', err);
        showToast('❌ Kamera başlatılamadı', 'error');
        playSound('error');
        serbestKamerayiKapat();
    } finally {
        serbestKameraAciliyor = false;
    }
}

function serbestKamerayiKapat() {
    stopFreeScanning();
    isFreeScanning = false;
    serbestTarayici.durdur();
    elements.freeCameraContainer.style.display = 'none';
    elements.freeStartCameraBtn.style.display = 'inline-flex';
    elements.freeStopCameraBtn.style.display = 'none';
    elements.freeScanControl.style.display = 'none';
    elements.freeCameraOverlay.style.display = 'none';
    releaseWakeLock();
}

function stopFreeCamera() {
    if (!isFreeScanning && !serbestKameraAciliyor) return;
    const acikti = isFreeScanning;
    serbestKamerayiKapat();
    if (acikti) showToast('⏹️ Kamera durduruldu', 'info');
}

function startFreeScanning() {
    if (!isFreeScanning) return;
    sesiAc();
    odagiBirak();
    isFreeScanningEnabled = true;
    elements.freeScanBtn.classList.add('scanning');
    elements.freeScanControl.classList.add('scanning');
    elements.freeCameraOverlay.classList.add('scanning');
    elements.freeScanBtn.querySelector('.scan-text').textContent = 'Okunuyor...';
    vibrate([50]);
    serbestTarayici.okumayiAc();
}

function stopFreeScanning() {
    isFreeScanningEnabled = false;
    elements.freeScanBtn.classList.remove('scanning');
    elements.freeScanControl.classList.remove('scanning');
    elements.freeCameraOverlay.classList.remove('scanning');
    elements.freeScanBtn.querySelector('.scan-text').textContent = 'Basılı Tut ve Oku';
    if (serbestTarayici) serbestTarayici.okumayiKapat();
}

// Doğrulanmış barkodu listeye işler (kamera ve elle giriş)
function handleFreeScan(barcode) {
    const isDuplicate = freeScanList.some((item) => item.barcode === barcode);

    if (isDuplicate && freeScanDuplicateMode !== true) {
        freeScanDuplicates[barcode] = (freeScanDuplicates[barcode] || 1) + 1;
        playSound('warning');
        vibrate([100, 100, 100]);
        showToast('⚠️ Barkod zaten okundu: ' + barcode, 'warning');
        updateFreeTable();
        saveToStorage();
    } else {
        addFreeScan(barcode);
    }
}

function handleFreeManualEntry() {
    const girilen = elements.freeManualBarcodeInput.value.trim().toUpperCase();
    if (!girilen) return;

    // Elle yazarken M yazılmayabilir: 9 hane de kabul edilir. M yazılırsa atılır.
    const c = /^\d{9}$/.test(girilen) ? { deger: girilen } : barkodCoz(girilen);
    if (!c) {
        showToast('❌ Geçersiz barkod! En az 9 hane gerekli.', 'error');
        playSound('error');
        vibrate([200, 100, 200]);
        elements.freeManualBarcodeInput.focus();
        elements.freeManualBarcodeInput.select();
        return;
    }
    const deger = serbestKayitDegeri(c.deger);

    const simdi = Date.now();
    elements.freeManualBarcodeInput.value = '';
    if (deger === lastScannedBarcode && (simdi - lastScannedTime) < MANUEL_SERBEST_KORUMA_MS) {
        showToast('⚠️ Aynı barkod az önce girildi, eklenmedi', 'warning');
        return;
    }
    lastScannedBarcode = deger;
    lastScannedTime = simdi;
    handleFreeScan(deger);

    if (isFreeScanning) odagiBirak();
}

function addFreeScan(barcode) {
    const now = new Date();
    const timestampStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    freeScanList.push({
        id: Date.now(),
        barcode,
        timestamp: timestampStr
    });

    playSound('success');
    vibrate([100]);
    showScanFlash();
    updateFreeTable();
    saveToStorage();
}

// ==========================================
// TARA VE LİSTELE: TABLO VE DIŞA AKTARIM
// ==========================================
function mukerrerGosterilsinMi() {
    return freeScanDuplicateMode !== true && Object.keys(freeScanDuplicates).length > 0;
}

function updateFreeTable() {
    elements.freeSummaryCount.textContent = freeScanList.length;
    const son = freeScanList[freeScanList.length - 1];
    elements.freeLastBarcode.textContent = son ? son.barcode : '-';

    elements.freeTableBody.innerHTML = '';
    if (freeScanList.length === 0) {
        elements.freeTableBody.innerHTML = '<tr class="empty-row"><td colspan="3">Henüz barkod okutulmadı.</td></tr>';
    } else {
        const seenBarcodes = new Set();
        freeScanList.forEach((item, index) => {
            const tr = document.createElement('tr');
            if (seenBarcodes.has(item.barcode)) {
                tr.classList.add('duplicate-row');
            } else {
                seenBarcodes.add(item.barcode);
            }
            tr.innerHTML = `<td>${index + 1}</td><td>${esc(item.barcode)}</td><td>${esc(item.timestamp)}</td>`;
            elements.freeTableBody.appendChild(tr);
        });

        const tableContainer = document.querySelector('#freeReportModal .free-table-container');
        if (tableContainer) {
            tableContainer.scrollTop = tableContainer.scrollHeight;
        }
    }

    const goster = mukerrerGosterilsinMi();
    elements.freeDuplicatesContainer.style.display = goster ? 'block' : 'none';
    elements.freeDuplicatesList.innerHTML = '';
    if (goster) {
        for (const [barcode, count] of Object.entries(freeScanDuplicates)) {
            const div = document.createElement('div');
            div.className = 'duplicate-item';
            div.innerHTML = `<span>${esc(barcode)}</span> <span>${esc(count)} kez okundu</span>`;
            elements.freeDuplicatesList.appendChild(div);
        }
    }
}

// Tara ve Listele ekranını baştan başlatır (ekrandaki Temizle ve rapordaki Temizle)
function clearFreeScans() {
    const kayitVar = freeScanList.length > 0 || Object.keys(freeScanDuplicates).length > 0;
    if (!kayitVar) {
        elements.freeManualBarcodeInput.value = '';
        showToast('ℹ️ Liste zaten boş', 'info');
        return;
    }
    if (!confirm(`Tara ve Listele ekranındaki ${freeScanList.length} okuma silinecek. Emin misiniz?`)) return;

    // Kayıt modu yeniden sorulacak: kamera eski modla açık kalmasın
    if (isFreeScanning || serbestKameraAciliyor) serbestKamerayiKapat();
    elements.freeManualBarcodeInput.value = '';
    freeScanList = [];
    freeScanDuplicates = {};
    freeScanDuplicateMode = null;
    lastScannedBarcode = null;
    lastScannedTime = 0;
    updateFreeTable();
    saveToStorage();
    showToast('🧹 Tara ve Listele temizlendi', 'success');
}

function exportFreeScansToExcel() {
    if (freeScanList.length === 0) {
        showToast('⚠️ Dışa aktarılacak veri yok', 'warning');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        const sheetData = [['Sıra', 'Barkod', 'Zaman']];
        const seenBarcodes = new Set();
        const duplicateRowIndices = [];

        freeScanList.forEach((item, index) => {
            sheetData.push([index + 1, item.barcode, item.timestamp]);
            if (seenBarcodes.has(item.barcode)) {
                // Excel satırı 1-tabanlı, 1. satır başlık
                duplicateRowIndices.push(index + 2);
            } else {
                seenBarcodes.add(item.barcode);
            }
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        const headerStyle = {
            font: { name: 'Arial', bold: true, color: { rgb: 'FFFFFF' }, size: 11 },
            fill: { patternType: 'solid', fgColor: { rgb: '1E3A5F' } },
            alignment: { horizontal: 'center', vertical: 'center' }
        };
        ['A', 'B', 'C'].forEach((col) => {
            const ref = `${col}1`;
            if (ws[ref]) ws[ref].s = headerStyle;
        });

        const duplicateStyle = {
            fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } },
            font: { name: 'Arial', color: { rgb: '555555' } }
        };
        duplicateRowIndices.forEach((rowIdx) => {
            ['A', 'B', 'C'].forEach((col) => {
                const ref = `${col}${rowIdx}`;
                if (ws[ref]) ws[ref].s = duplicateStyle;
            });
        });

        ws['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 15 }];

        XLSX.utils.book_append_sheet(wb, ws, 'Tarama Listesi');

        if (mukerrerGosterilsinMi()) {
            const dupData = [['Barkod', 'Okunma Sayısı']];
            for (const [barcode, count] of Object.entries(freeScanDuplicates)) {
                dupData.push([barcode, count]);
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dupData), 'Mükerrer Okutmalar');
        }

        const z = dosyaZamani();
        XLSX.writeFile(wb, `Serbest_Tarama_Raporu_${z.tarih}_${z.saat}.xlsx`);
        showToast('✅ Rapor Excel olarak indirildi', 'success');
    } catch (error) {
        console.error('Excel export hatası:', error);
        showToast('❌ Excel oluşturulamadı!', 'error');
    }
}

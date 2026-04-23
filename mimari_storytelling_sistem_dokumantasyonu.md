# Teknik Şartname: Web Tabanlı 3D Mimari Storytelling Sistemi

Bu döküman, mimari modellerin web ortamında scroll-tabanlı bir anlatı (scrollytelling) ile sunulmasını sağlayan sistemin teknik gereksinimlerini ve uygulama katmanlarını kapsar.

## 1. Kritik Uyarı: Model Optimizasyonu (Darboğaz)
Sistemin çalışabilirliği, yazılım kodundan ziyade veri hazırlığına bağlıdır. Mimari yazılımlardan (Rhino, Revit, SketchUp) çıkan ham modeller web ortamı için uygun değildir.
* **Poligon Limiti:** Sahne başına maksimum 500k - 1M poligon (cihaz performansına bağlı).
* **Texture Baking:** Gerçek zamanlı ışıklandırma web üzerinde maliyetlidir. Tüm gölge ve ışık bilgisi dokulara "bake" edilmelidir.
* **Draw Calls:** GPU performansını korumak için benzer materyallerin birleştirilmesi (mesh merging) zorunludur.

## 2. Yazılım Yığını (Tech Stack)

| Katman | Teknoloji | Fonksiyon |
| :--- | :--- | :--- |
| **3D Render Motoru** | Three.js / React Three Fiber | WebGL tabanlı sahne yönetimi. |
| **Dosya Formatı** | GLTF / GLB | Web için optimize edilmiş 3D iletim formatı. |
| **Sıkıştırma** | Draco Mesh Compression | Geometri verisini %90'a varan oranda küçültme. |
| **Animasyon/Scroll** | GSAP + ScrollTrigger | Kaydırma verisinin kamera koordinatlarına map edilmesi. |
| **Smooth Scroll** | Lenis | Tarayıcı jitter etkisini önlemek için sanal scroll. |

## 3. Uygulama Mimarisi

### 3.1. Kamera Yolu ve Enterpolasyon
Kamera hareketi, sahnede serbest dolaşım değil, önceden tanımlanmış bir matematiksel eğri (CatmullRomCurve3) üzerinde gerçekleşir.
* **Input:** `window.scrollY` (Lenis tarafından normalize edilmiş).
* **Processing:** Scroll yüzdesi (0.0 - 1.0), eğrinin `t` parametresine bağlanır.
* **Output:** `camera.position.set(curve.getPointAt(t))`.
* **LookAt Enterpolasyonu:** Kamera pozisyonu değişirken bakış yönü (`lookAt`) keskin geçişler yapmamalıdır. Hedefler arası geçişlerde Quaternion Slerp (Spherical Linear Interpolation) veya sönümleme (damping) uygulanarak yumuşak bir seyir sağlanmalıdır.

### 3.2. Senkronizasyon Katmanı
Metin blokları (DOM) ile 3D sahnenin (Canvas) senkronizasyonu GSAP `ScrollTrigger` ile sağlanır.
* Her metin bloğu (`<section>`), 3D sahnede bir "checkpoint" olarak tanımlanır.
* Metin ekrana girdiğinde (onEnter), kamera ilgili koordinata ve bakış açısına (lookAt) yumuşak geçiş yapar.

### 3.3. Asset Hattı (Pipeline)
1.  **Modelleme:** Rhino/Revit.
2.  **Optimizasyon:** Blender (Retopoloji + Texture Baking).
3.  **Export:** GLB (Khronos Texture Transmission Format - KTX2 desteğiyle).
4.  **Frontend:** Three.js `GLTFLoader` + `DRACOLoader`.

## 4. Donanım ve Performans Kısıtları
* **VRAM:** Web tarayıcıları GPU belleğinin sınırlı bir kısmını kullanabilir. 4K texture kullanımı sistemin çökmesine neden olur. 2K (2048x2048) üst limit kabul edilmelidir.
* **Fallback:** Mobil cihazlar ve düşük konfigürasyonlu bilgisayarlar için post-processing (Bloom, SSAO, SSR) efektleri varsayılan olarak kapalı tutulmalıdır. Ayrıca WebGL desteklenmeyen durumlarda statik görsellerden oluşan bir 2D fallback yapısı kurulmalıdır.
* **Device Pixel Ratio (DPR):** Yüksek çözünürlüklü ekranlarda (Retina vb.) sistemin 4K render almaya çalışmasını engellemek için DPR limiti koyulmalıdır: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`.
* **Bellek Yönetimi (Memory Leaks):** Sayfa değişimlerinde veya sahne sıfırlanmalarında tarayıcı belleğinin dolmasını önlemek için geometriler, materyaller ve dokular düzenli olarak bellekten silinmelidir (`dispose()`).

## 5. Uygulama Sırası (Roadmap)
1.  **Boilerplate:** Three.js sahnesinin ve temel ışıklandırmanın kurulması.
2.  **Scroll Engine:** Lenis ve GSAP entegrasyonu ile boş bir sahnenin kaydırılması.
3.  **Curve Definition:** Sahne içine görünmez bir spline eklenerek kameranın bu yolda yürümesi.
4.  **Content Injection:** HTML metin katmanlarının (Z-index: 10) eklenmesi ve 3D koordinatlarla eşlenmesi.

## 6. Yükleme ve Yaşam Döngüsü (Loading & Lifecycle)
* **Preloading Katmanı:** 3D asset'lerin (GLB, dokular) boyutları büyüktür. Three.js `LoadingManager` kullanılarak arka planda indirme yüzdesi hesaplanmalı ve kullanıcıya şık bir "Yükleniyor" ekranı (Progress bar) sunulmalıdır.
* **Cleanup (Temizlik):** Kullanıcı sayfadan ayrıldığında GPU belleğinde sızıntı (memory leak) olmaması için oluşturulan tüm sahne elementlerinin yaşam döngüsü kurallarına uygun şekilde `dispose()` edilmesi zorunludur.

## 7. Responsive ve UX (Kullanıcı Deneyimi) Politikaları
* **Resize Yönetimi:** Tarayıcı penceresi boyutlandırıldığında veya mobil cihazlarda ekran yan çevrildiğinde (orientation change), kamera `aspect` oranı ve `renderer.setSize()` değerleri dinamik olarak güncellenmelidir.
* **Scroll İpucu (Onboarding):** Kullanıcı siteye ilk girdiğinde "Aşağı Kaydır" etkileşimini teşvik eden belirgin bir görsel ipucu (bouncing arrow vb.) bulunmalıdır.
* **Pacing ve Hız Kalibrasyonu:** Model üzerinde kaydırma hızı çok hızlı olmamalıdır. Scroll mesafesi ile kameranın ilerleme hızı arasında akıcı bir sürtünme (friction) oranı kurulmalıdır.
* **Mobil/Masaüstü Ayrımı:** HTML metin katmanları mobilde 3D sahneyi kapatmamalıdır. Mobilde metinler alt kısımda sabit kartlar olarak gösterilebilir veya kamera yolu (FOV) mobilde daha geniş bir açıdan bakacak şekilde revize edilmelidir.
* **Erişilebilirlik (A11y):** Cihazında "Hareketi Azalt" (`prefers-reduced-motion`) seçili olan kullanıcılar için WebGL sahnesi iptal edilerek sade ve erişilebilir bir okuma modu sunulmalıdır.

## 8. İçerik Yönetim ve Editör Sistemi (Authoring Tool / CMS)
Sistemin sadece kod üzerinden değil, bir görsel arayüz (UI) paneli üzerinden yönetilebilmesi için bir "Editör Modu" tasarlanmalıdır. Bu mod, mimarın veya içerik yöneticisinin kamera açılarını ve metinleri kod bilmeden belirlemesini sağlar.

### 8.1. Editör Arayüzü Özellikleri
* **Serbest Gezinme (Free Roam):** Kullanıcı, "Editör Modu"na geçtiğinde scroll kısıtlaması kalkmalı ve sahne içerisinde "Orbit Controls" veya "Fly Controls" ile serbestçe gezinip istediği açıyı bulabilmelidir.
* **Checkpoint (Durak) Oluşturma:** İstenilen açı yakalandığında UI üzerindeki "Buraya Durak Ekle" butonu ile kameranın o anki konumu (`position`) ve bakış hedefi (`lookAt` veya `target`) sisteme kaydedilmelidir.
* **İçerik Girişi:** Eklenen her durak için bir form alanı açılmalı; bu durakta görünecek başlık (Title), ana metin (Body) ve gerekiyorsa html elementleri eklenebilmelidir.
* **Sıralama ve Önizleme:** Oluşturulan duraklar bir liste halinde arayüzde görünmeli, sıraları değiştirilebilmeli (drag & drop) ve "Önizleme" (Preview) butonu ile girilen noktalar arasında oluşturulan scroll yolculuğu test edilebilmelidir.

### 8.2. Veri Yapısı ve Export/Import İşlemi
Oluşturulan bu hikaye akışı, dışa aktarılabilir bir JSON formatında (konfigürasyon dosyası olarak) tutulmalıdır.
* **Örnek JSON Şeması:** Her durak (sahne adımı) temelde şu bilgileri içermelidir:
  ```json
  {
    "id": "step-1",
    "order": 1,
    "cameraPos": { "x": 10.5, "y": 5.0, "z": -3.2 },
    "lookAtPos": { "x": 0.0, "y": 2.0, "z": 0.0 },
    "content": {
      "title": "Ana Giriş Cephesi",
      "body": "Bina girişindeki ahşap paneller..."
    }
  }
  ```
* **Dinamik Kamera Yolu Çizimi:** Sistem arka planda, json dosyasında kaydedilen `cameraPos` noktalarını baz alıp, aralarından geçen yumuşak bir kamera eğrisini (`CatmullRomCurve3`) otomatik olarak hesaplayıp oluşturmalıdır. Böylece kullanıcı sadece "noktaları" belirler, sistem "yolu" kendi çizer.
* **Entegrasyon:** Bu JSON verisi projede statik bir `config.json` dosyası olarak tutulabileceği gibi, ilerleyen aşamalarda bir veritabanından (Headless CMS, Firebase vb.) dinamik olarak da çekilebilir.
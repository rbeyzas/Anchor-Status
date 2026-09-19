# Yapılacaklar

Durum: 18 Eylül 2026. Geliştirme planının 1–6. adımları tamamlandı; 5. adım (gerçek anchor'a karşı tam yatırma testi) iptal edildi. Maddeler aciliyet sırasına göre dizildi.

## 1. Plandan kalanlar (adım 7)

- [ ] **Arşivin sunucu dışına yedeklenmesi.** `/var/lib/anchor-status/history.json` şu an tek sunucuda duruyor ve sunucu dışında yedeği yok. Veri kaybı riski gerçek.
- [ ] **Arşiv hash'inin periyodik olarak zincire yazılması.** Böylece arşivin sonradan değiştirilmediğini herkes doğrulayabilir.
- [ ] **Anchor listesinin persistent storage'a taşınması.** Liste hâlâ instance storage'da. 107 anchor var ve sayı arttıkça listeyi tutan kayıt, Soroban'ın kayıt başına boyut sınırına yaklaşıyor.

## 2. Mainnet öncesi yapılması gerekenler

- [ ] **Sızan testnet anahtarlarının yenilenmesi.** Repo geçmişindeki `secrets.env` içinde testnet issuer anahtarları var.
- [ ] **Toplayıcı için sağlık uç noktası.** Son başarılı turun zamanını göstersin; 40 dakikayı geçerse uyarı versin. Şu an cron sessizce durursa kimse fark etmez.
- [ ] **Kontrat eksikleri:**
  - [ ] Anchor silme fonksiyonu yok.
  - [ ] `upgrade` fonksiyonunda zaman kilidi (timelock) yok.
  - [ ] Sınır durumları için fuzz testi yok.

## 3. Ölçümü güçlendirecek işler

- [ ] **Boyutlu skor (1b).** Tek skor yerine erişilebilirlik, gecikme, canlılık ve uyum ayrı ayrı gösterilsin.
- [ ] **İstatistiksel sağlamlık (1c):**
  - [ ] Rapor sıklığından bağımsız, zamana göre sönen ortalama.
  - [ ] Gecikme için ortalama yerine p50/p95.
- [ ] **Daha fazla SEP (3d):**
  - [ ] SEP-38 ile kur farkı (makas) ölçümü.
  - [ ] Withdraw (çekme) akışı.
  - [ ] SEP-31.
- [ ] **Farklı coğrafi bölgelerden ölçüm (3f).**

## 4. Güven modeli

- [ ] **Birden fazla bağımsız raporlayıcı ve çoğunluk (2b).** Bugün skoru tek bir raporlayıcı anahtarı yazıyor.
- [ ] **İtiraz mekanizması (2c).** Anchor'ın bir rapora itiraz edebilmesi.

## 5. Dokümantasyon ve açıklık

- [ ] **Açık metodoloji belgesi.** Skorun nasıl hesaplandığı, kısıtları ve kimin nasıl yeniden üretebileceği.
- [ ] **Açık veri seti.** Geçmiş verisinin versiyonlu ve imzalı olarak yayınlanması.
- [ ] **README'nin gözden geçirilmesi.** Anlatım "tarafsız ölçüm, stake kesintisi yok" modeline uygun olmalı.

## 6. Küçük tutarsızlıklar

- [ ] **Dashboard alt başlığı.** Hâlâ "simulated sources" diyor, oysa artık mock veri gönderilmiyor ([Dashboard.tsx:59](../dashboard/components/Dashboard.tsx#L59)).
- [ ] **Dashboard canlılık rozeti.** Mainnet de izlendiği halde "Testnet live" yazıyor ([Dashboard.tsx:75](../dashboard/components/Dashboard.tsx#L75)).
- [ ] **Hackathon PDF'i.** Repo kökündeki `2026_08_10 Rise In__ Stellar Pro Hackathon Tracks.docx.pdf` git tarafından takip edilmiyor. Commit'lenmeli mi, `.gitignore`'a mı eklenmeli, karar verilmeli.

## Önerilen sıra

1. Adım 7: arşiv yedeği ve arşiv hash'inin zincire yazılması.
2. Sızan anahtarların yenilenmesi ve sağlık uç noktası.
3. Dashboard metinleri (bunlarla birlikte yapılabilir).

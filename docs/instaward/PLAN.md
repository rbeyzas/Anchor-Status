# Instaward sprint planı: on-chain güven modeli

**Dayanak:** onaylanan SOW (12 Ekim 2026, resubmission). SOW'da ne yazıyorsa o teslim edilecek. Bu dosya o taahhütlerin nasıl ve ne zaman yapılacağını anlatıyor.

**Takvim:** 1. gün 19 Ekim 2026 (Pazartesi), 30. gün 17 Kasım 2026 (Salı).

**Bütçe:** 100 saat.

| Teslimat | Saat |
|---|---|
| D1 | 40 |
| D2 | 32 |
| D3 | 24 |
| Ortak işler | 4 |

**Ekip:**
- **Beyza:** kontratlar, aggregator, verify-score, dispute CLI.
- **Önder:** sunucular, domain ve stellar.toml, dashboard panelleri, scriptler, prova ve migration.

Bir sonraki Instaward'a başvurabilmek için SOW'daki bütün başarı kriterlerinin **eksiksiz** teslim edilmesi gerekiyor. Yarım kalan bir kriter follow-on hakkını riske atar.

Her kanıt (tx hash, ekran görüntüsü, komut çıktısı) elde edildiği gün [`EVIDENCE.md`](EVIDENCE.md) dosyasına yazılır. Kanıt toplamak sprintin sonuna bırakılmaz.

---

## Kritik tarihler

| Tarih | Ne olacak | Neden kritik |
|---|---|---|
| **17 Ekim (Cmt)** | B sunucusu probe'lara başlar | B'nin skor kartı 30 günlük pencereden hesaplanıyor. Ne kadar erken başlarsa A ile arasındaki fark o kadar küçük olur. |
| 18 Ekim (Paz) | Sprint öncesi işler biter | SOW "anahtarlar sprintten önce yenilenir" diyor |
| 25 Ekim (Paz) | 1. hafta sonu | Upgrade testi geçmeli, domain stellar.toml'ü sunmalı, B probe'ları çalışmalı |
| 28–29 Ekim | Prova ve canlı upgrade | Shadow modun 1 Kasım'dan önce başlaması gerekiyor |
| **1 Kasım (14. gün)** | En geç bu tarihte shadow mod başlamış olmalı | SOW'da yazılı |
| 30 Ekim – 2 Kasım | İrem ile mid-sprint check-in | SOW'da yazılı (yaklaşık 14. gün) |
| 8 Kasım | Threshold 2'ye çıkar | Shadow modun bir haftasını doldurması gerekiyor |
| **17 Kasım (30. gün)** | Bütün kanıtlar tamam; git tag'leri, demo videosu ve sprint raporu gönderilir | Teslim tarihi |
| **~28 Kasım** | 19 Eylül'den kalan v1 kart event'leri Alchemy'nin 70 günlük penceresinden düşer | verify-score'un eski kartları üretebilmesi için arşivin 1. haftada tamamlanması gerekiyor |

---

## Hafta 0: bu hafta sonu (16–18 Ekim), sprint öncesi

Bu işler hiçbir teslimata faturalanmıyor; SOW bunları "sprintten önce" ya da "faturalanmaz" diye tanımlıyor.

| # | İş | Kim | Bitti sayılması için |
|---|---|---|---|
| 0.1 | **B sunucusunu kiralamak.** A'dan farklı bir sağlayıcıda ve bölgede olmalı, örneğin Hetzner Helsinki veya DigitalOcean Frankfurt; 2 vCPU ve 4 GB yeterli. `scripts/deploy-to-server.sh` B için de çalışmalı. | Önder | SSH ile girilebiliyor ve cron kurulu |
| 0.2 | **B'de yalnızca ölçüm başlatmak.** `mainnet-probe probe` ve `testnet-probe probe` çalışacak. B **discover / onboard / register çalıştırmaz** (zincire anchor kaydı yalnızca A'dan yapılır) ve **henüz zincire hiçbir şey yazmaz**. B, ölçeceği anchor listesini A'nın `anchors.json` dosyasından değil, zincirdeki registry'den okur. | Beyza (kod), Önder (kurulum) | B'nin `evidence/` klasöründe her 20 dakikada bir yeni belge oluşuyor |
| 0.3 | **Sızan testnet anahtarlarını yenilemek.** `secrets.env` geçmişindeki issuer anahtarlarına yenileri üretilir ve eskilerinin yerine geçer. A'nın reporter anahtarları da yenilenir: yeni anahtar `authorize_reporter` ile yetkilendirilir, eskisi yetkisiz kalır. Bugün kontratta revoke fonksiyonu yok, bu yüzden eski anahtar bir dummy source type'a yönlendirilir. | Beyza | `docs/TODO.md` maddesi işaretlendi; yeni anahtarlar yalnızca sunucuların env dosyalarında duruyor |
| 0.4 | **Apex domain'i düzeltmek.** `monarank.xyz/.well-known/stellar.toml` bugün 308 koduyla `www`'ye yönlendiriyor. SOW "monarank.xyz serves" diyor ve SEP-1 istemcilerinin çoğu yönlendirmeyi izlemez. Vercel'de bu yol için apex yönlendirmesiz 200 dönmeli ve CORS `*` başlığı korunmalı. | Önder | `curl -sI https://monarank.xyz/.well-known/stellar.toml` sonucu 200 ve `access-control-allow-origin: *` |
| 0.5 | **Kanıt kaydını başlatmak:** `docs/instaward/EVIDENCE.md`. | Beyza | Dosya repoda |
| 0.6 | **Branch düzeni.** Sprint işi `instaward` branch'inde yapılır. `main`'e yalnızca dashboard'un iki storage düzenini de okuyabildiği sürüm erken merge edilir, çünkü Vercel `main`'den otomatik deploy ediyor. | İkisi | Branch açıldı |
| 0.7 | **İrem'e haber vermek.** 19 Ekim'in 1. gün olduğunu, haftalık güncelleme gününü (Cuma) ve mid-sprint check-in tarihini önermek. | Beyza | Mesaj gönderildi |

**Durum (17 Ekim):**
- **0.2:** Tamam. B, A'dan farklı bir sağlayıcıda ve bölgede, `scripts/setup-secondary.sh` ile kuruldu ve 17 Ekim 20:52 UTC'de ilk turunu tamamladı. Anchor listesini zincirden alıyor (104 mainnet, 2 testnet). `SECONDARY_PUBLISH=false` olduğu için zincire hiçbir şey yazmıyor. B'nin discovery'si liveness geçmişini sıfırdan biriktiriyor (ilk gün 15 canlı anchor, A'da 18); bu fark bir hafta içinde kapanır.
- **0.3:** Tamam. 4 issuer hesabı merge edildi ve Django anahtarı yenilendi. Ek olarak `deploy-to-server.sh` artık `.env.*` ve `secrets.env` dosyalarını sunuculara kopyalamıyor.
- **0.4:** Tamam (18 Ekim). Apex artık yönlendirmiyor: `https://monarank.xyz/.well-known/stellar.toml` 200 dönüyor ve `access-control-allow-origin: *` başlığını gönderiyor. Dosyanın içeriği (`ORG_URL`, reporter anahtarları, kontrat ID'leri) 1.8'de güncellenecek. A'daki eski `dashboard/.env.local` kopyası silindi.
- **0.5:** Tamam.

---

## Hafta 1 (19–25 Ekim): D2 registry, B sunucusu, stellar.toml, arşiv

| # | İş | Teslimat | Kim | Saat |
|---|---|---|---|---|
| 1.1 | `stellar contract fetch --id <AnchorRegistry>` ve `--id <PerformanceOracle>` ile canlıdaki wasm dosyaları `contracts/fixtures/` altına alınıp commit'lenir | D2 | Beyza | 1 |
| 1.2 | **Upgrade testi:** `contractimport!` ile eski wasm yüklenir, 120 anchor kaydedilir, yeni koda upgrade edilir, `migrate_anchor_index` ve `finalize_migration` çalıştırılır, ardından her şeyin doğru okunduğu kontrol edilir | D2 | Beyza | 4 |
| 1.3 | **Registry, paged index:** `AnchorCount`, `AnchorAt`, `AnchorPos`, `list_anchors_page`, `anchor_count`, migration fonksiyonları. Migration sürerken `register_anchor` `MigrationInProgress` hatası verir | D2 | Beyza | 5 |
| 1.4 | **Registry, yaşam döngüsü:** `Status(Symbol)`, `deactivate_anchor`, `remove_anchor` (yalnızca stake 0 ve bekleyen withdrawal yokken), `get_anchor_status`. `client.rs`'e de eklenir | D2 | Beyza | 3 |
| 1.5 | **Governance modülü:** `propose_admin`/`accept_admin`, `propose_upgrade`/`execute_upgrade`/`cancel_upgrade`/`set_upgrade_delay`/`get_pending_upgrade`. Önce registry'ye eklenir; aynı kod oracle'a 2. haftada kopyalanır (workspace olmadığı için) | D2 | Beyza | 4 |
| 1.6 | Registry event'leri: register, deactivate, remove, admin, upgrade | D2 | Beyza | 1 |
| 1.7 | **Dashboard iki düzeni de okur.** `dashboard/lib/contract-state.ts` önce `AnchorCount`'u okur; yoksa eski `AnchorIds` yoluna düşer. Testi yazılıp **`main`'e merge edilir** | D2 | Önder | 3 |
| 1.8 | **stellar.toml:** `ORG_URL` `https://monarank.xyz` olur. `ACCOUNTS` alanında A ve B'nin reporter G-adresleri ve ileride multisig admin hesabı yer alır. Kontrat ID'leri için `MONA_ANCHOR_REGISTRY` ve `MONA_PERFORMANCE_ORACLE` alanları eklenir. SEP-1 bilinmeyen alanları yok sayar, bu yüzden alanlar dosyada yorumla açıklanır | D1 | Önder | 1 |
| 1.9 | **User-Agent:** SOW 3.1 "requests carry an identifying User-Agent with a contact address" diyor, ama bugün yalnızca `discover.ts` bir UA gönderiyor. Bütün probe istekleri `MonaRank-probe/1.0 (+https://monarank.xyz; <e-posta>)` UA'sını gönderecek | D1 | Beyza | 1 |
| 1.10 | **Arşiv:** `history-archiver` bugün `score_card_published` event'ini arşivlemiyor; yalnızca report, risk ve slash event'lerini alıyor. Bu event eklenir ve 19 Eylül'den bu yana olanlar `backfill` ile Alchemy'den çekilir. Arşivin bir kopyası sunucu dışına alınır | Ortak | Beyza | 0 (faturalanmaz) |
| 1.11 | **Upgrade script'leri:** `scripts/upgrade-contracts.sh` `propose` ve `execute` olarak ikiye ayrılır; multisig ile imzalama adımı da eklenir | D2 | Önder | 2 |
| 1.12 | **Referans anchor'ın yayına alınması** (aşağıdaki "Açık tasarım kararları" 4. maddeye bakın): `ref1.monarank.xyz` stellar.toml'ü ve SIGNING_KEY'iyle yayına alınır | D3 | Önder | 3 |

**Bu haftanın saati:** 28.

**Hafta sonunda gösterilecekler:**
- upgrade testi geçiyor
- `monarank.xyz` stellar.toml'ü sunuyor
- B probe'ları çalışıyor
- dashboard'un iki düzeni de okuyan sürümü canlıda

**Cuma:** Stellar Türkiye kanalına 1. hafta güncellemesi.

---

## Hafta 2 (26 Ekim – 1 Kasım): D1 kontratı, prova, canlı upgrade, shadow mod

| # | İş | Teslimat | Kim | Saat |
|---|---|---|---|---|
| 2.1 | **Oracle, quorum:** `QuorumCfg`, `Reporters`, `Round` (temporary storage), `Quorum` (persistent storage). Kartlar toplanır, quorum dolunca alan bazında medyan alınır. Bayraklar çoğunluk oyuyla belirlenir; `inputs_hash`, skoru medyana eşit olan gönderimden alınır | D1 | Beyza | 8 |
| 2.2 | **Quorum kuralları:** aynı raporlayıcı bir turda bir kez gönderebilir, tur içinde tek methodology sürümü olur, tur sınırına hizalanmamış, süresi geçmiş veya geç gelen kartlar ele alınır, outlier event'i ve `FLAG_REPORTER_DISAGREEMENT` üretilir, `record_report` artık risk durumunu değiştiremez, `revoke_reporter` eklenir. En az 20 yeni test | D1 | Beyza | 6 |
| 2.3 | Governance modülünün oracle'a eklenmesi; threshold'u **düşürmek** zaman kilidinden geçer | D2 | Beyza | 2 |
| 2.4 | **Aggregator:** `REPORTER_HOST_ID` eklenir. Kartlar 6 saatlik tur sınırında yayınlanır. B'de `CARDS_ONLY=true`, yani B tek tek rapor (`submit_report`) göndermez, yalnızca kart yayınlar. `DuplicateSubmission` ve `Stale` hataları sorun sayılmaz, atlanır | D1 | Beyza | 4 |
| 2.5 | **Prova (28 Ekim):** eski wasm yeni ID'lerle deploy edilir ve 109 anchor kopyalanır. Ardından registry upgrade, 3 kez `migrate`, `finalize`, oracle upgrade ve `authorize` B adımları çalıştırılır. Her adımın `--sim` maliyeti not edilir | Ortak | Önder | 2 |
| 2.6 | **Canlı upgrade (29 Ekim):** sıra provayla aynı. Bu, eski anlık `upgrade()` fonksiyonunun son kullanımı. Her adımın tx hash'i EVIDENCE'a yazılır | D2 | Önder | 2 |
| 2.7 | B'nin reporter anahtarları yetkilendirilir ve B kart yayınlamaya başlar (threshold 1). **Shadow mod başlar (en geç 30 Ekim)** | D1 | Önder | 1 |
| 2.8 | İrem ile mid-sprint check-in: yükseltilmiş kontratların canlı demosu | — | İkisi | (faturalanmaz) |

**Bu haftanın saati:** 25.

**Hafta sonunda gösterilecekler:**
- iki kontrat da kendi ID'leriyle yerinde yükseltildi
- `anchor_count()` eski listedeki sayıya eşit (aşağıdaki "Açık tasarım kararları" 5. maddeye bakın)
- shadow mod 2 raporlayıcıyla çalışıyor

---

## Hafta 3 (2–8 Kasım): D3, fuzz, multisig, zaman kilidi demosu

| # | İş | Teslimat | Kim | Saat |
|---|---|---|---|---|
| 3.1 | **Claim:** `attest_signing_key` (aynı quorum'la) ve `claim_anchor`. İmzalanan mesaj şunları içerir: anchor_id, operatör adresi, nonce, network passphrase hash'i ve kontrat ID. `ed25519_verify` ile doğrulanır. Testler: yanlış anahtar, tekrar kullanılan nonce, başka ağ | D3 | Beyza | 6 |
| 3.2 | **Disputes:** `open_dispute`, `vote_dispute` ve `get_verdict` bayrakları; cooldown, minimum stake, superseded durumu. Testler | D3 | Beyza | 6 |
| 3.3 | **Proptest:** medyan, bayrak çoğunluğu, spread ve indeks (boşluk veya tekrar olmaması), en az 10.000 vaka. **cargo-fuzz:** `publish_score_card` dizileri, 1 saat koşu. Çıktılar kaydedilir | D1/D2 | Beyza | 4 |
| 3.4 | **2-of-3 multisig:** Beyza, Önder ve çevrimdışı bir yedek anahtar. Hesap eşikleri: low 1, med 2, high 2, master weight 0 | D2 | Önder | 2 |
| 3.5 | Her iki kontratta `propose_admin` ve multisig ile `accept_admin` | D2 | Önder | 1 |
| 3.6 | **Zaman kilidi demosu:** D3 wasm'ı upload edilir ve `propose_upgrade` çağrılır. Hemen `execute_upgrade` denenir ve `TimelockActive` hatası alınır (tx hash veya `--sim` çıktısı). 24 saat sonra aynı çağrı başarılı olur. **Bu adım aynı zamanda D3'ün canlıya çıkışıdır** | D2/D3 | Önder | 2 |
| 3.7 | Bir anchor'ın zincirde devre dışı bırakılması (örneğin `tr_mock_anchor_fly_dev`) ve `dashboard/lib/delisted.ts` dosyasının silinmesi | D2 | Önder | 1 |
| 3.8 | Shadow verisinden A ile B arasındaki spread dağılımının çıkarılması; `max_spread` değerinin ölçüme dayanarak seçilmesi | D1 | Beyza | 2 |
| 3.9 | **Mainnet hazırlığı:** runbook, mainnet config profili (7 gün zaman kilidi) ve Soroban güvenlik kontrol listesine göre öz-değerlendirme belgesinin taslağı | D2 | Beyza | 3 |

**Bu haftanın saati:** 27.

**Hafta sonunda gösterilecekler:**
- D2 kanıtları tamam
- D3 kodu zaman kilidinden geçerek canlıya çıktı

---

## Hafta 4 (9–17 Kasım): quorum açılır, D3 demosu, teslim

| # | İş | Teslimat | Kim | Saat |
|---|---|---|---|---|
| 4.1 | `set_quorum_config(threshold=2, max_spread=<ölçülen>, round=21600)` çağrısı (9 Kasım). Threshold'u yükseltmek anında geçerli olur | D1 | Önder | 0,5 |
| 4.2 | **Quorum kanıtları:** en az 3 `QuorumReached` event'i (her biri 2 adresten), `get_pending_round` çıktısı, `FLAG_REPORTER_DISAGREEMENT` ve `ReporterOutlier`, bir quorum kartında verify-score'un "match" sonucu | D1 | Beyza | 2 |
| 4.3 | verify-score'a quorum desteği: `Quorum(id)` kaydındaki her gönderim kendi bundle'ıyla doğrulanır ve medyan yeniden hesaplanır | D1 | Beyza | 3 |
| 4.4 | **Dashboard:** quorum paneli (raporlayıcılar, skorları, spread) ve "Pending k/K" rozeti; dispute rozeti | D1/D3 | Önder | 4 |
| 4.5 | **D3 demosu (referans anchor üzerinde):** attest, claim, kabul edilen ve reddedilen birer itiraz. `npm run dispute -- open|vote` CLI'ı | D3 | Beyza (CLI), Önder (demo) | 5 |
| 4.6 | stellar.toml'ün son hali (bütün reporter anahtarları ve multisig hesabı) | D1 | Önder | 0,5 |
| 4.7 | Runbook ve öz-değerlendirmenin son hali; `docs/SCORING.md`, `README` ve `ROADMAP` güncellemeleri | Ortak | Beyza | 2 |
| 4.8 | Bütün test suite'lerinin çalıştırılması (kontratlar, servisler, dashboard) ve çıktıların EVIDENCE'a eklenmesi | D2 | İkisi | 1 |
| 4.9 | Git tag'leri `instaward-d1`, `instaward-d2`, `instaward-d3`; yaklaşık 5 dakikalık demo videosu; sprint raporu (6.1 tablosunun doldurulmuş hali) İrem'e gönderilir | — | İkisi | 2 |

**Bu haftanın saati:** 20. Dört haftanın toplamı 100 saat.

**Son gün:** 17 Kasım. Hedef, işi **15 Kasım**'da bitirip iki gün tampon bırakmak.

---

## Açık tasarım kararları

SOW'un ruhuna uygun, ama metnin ayrıntıda netleştirmediği noktalar:

1. **QuorumCfg kaynak türüne göre tutulmalı: `QuorumCfg(SourceType)`.**
   - **Neden:** referans mock anchor'lar EMA ile çalışıyor ve tek raporlayıcıları var. Tek bir global threshold 2 olursa mock'ların raporları kilitlenir.
   - **Uygulama:** `RealMainnet` ve `RealTestnet` için threshold 2, `SimulatedMock` için 1.
   - **Uyum:** SOW'daki `QuorumCfg {threshold, max_spread, round_seconds}` tanımıyla çelişmiyor.

2. **B yalnızca kart yayınlar, tek tek rapor göndermez.**
   - **Neden:** B de `submit_report` gönderirse EMA ve health sayaçları iki kez sayılır.
   - **Uyum:** SOW kart quorum'unu taahhüt ediyor, rapor quorum'unu değil.

3. **B'nin 30 günlük geçmişi yok.**
   - B'nin skor kartı ilk haftalarda düşük güvenle ve geniş bir spread'le çıkacak. Bu yüzden B'nin 17 Ekim'de başlaması kritik: 8 Kasım'da yaklaşık 22 günlük geçmişi olur.
   - `max_spread` bu farkı tolere edecek şekilde ölçüme göre seçilecek.
   - Gerekirse quorum'u yalnızca iki tarafın da en az 14 günlük geçmişi olan kartlara uygulamak tartışılabilir. Bu bir kontrat kuralı değil, aggregator kuralı olur.

4. **Referans anchor sorunu.**
   - SOW, D3 demosunun "stellar.toml'ünü ve SIGNING_KEY'ini kontrol ettiğimiz referans anchor'larımız" üzerinde yapılacağını söylüyor.
   - Bugünkü 4 referans anchor `mock-anchor-N.local` adreslerinde, `SimulatedMock` tipinde. Herkese açık bir stellar.toml'leri yok ve **skor kartları yok**. Dispute bir kart penceresine bağlı olduğu için bunlarla çalışmaz.
   - **Çözüm (1.12):** `services/mock-anchors` içinden bir django-polaris anchor `ref1.monarank.xyz` adresinde yayına alınır (örneğin fly.io'da). Kendi stellar.toml'ü ve SIGNING_KEY'i olur ve **RealTestnet** olarak kaydedilir. Böylece testnet-probe onu ölçer, kartı oluşur, sonra claim ve dispute yapılabilir.
   - Saati D3'ün 24 saatinden gelir.

5. **"anchor_count() returns 109" kriteri.**
   - Discovery her gün yeni anchor ekleyebilir, yani migration günü sayı 109'dan farklı olabilir.
   - Kanıtta şu yazılacak: "anchor_count() = eski `AnchorIds` uzunluğu (SOW tarihinde 109; migration günü N)". İki sayı da aynı ekran görüntüsünde gösterilecek.
   - Alternatif: migration günü discovery'yi durdurmak. Önerilen yol bu ve `collect.sh` buna göre ayarlanacak.

6. **FLAG_REPORTER_DISAGREEMENT kanıtı.**
   - Önce gerçek bir anlaşmazlık beklenir; 109 anchor'da bir tane çıkması çok olası.
   - Çıkmazsa, testnet'te üçüncü bir **test** anahtarıyla bilerek sapmış bir kart gönderilir ve kanıtta "kasıtlı test" olarak açıkça etiketlenir.
   - Uydurma veriyi gerçekmiş gibi sunmak yok (bkz. proje kuralı "no fabricated data").

---

## Riskler ve önlemler

| Risk | Olasılık / etki | Önlem |
|---|---|---|
| **Kapsam 100 saate veya 30 güne sığmaz** | Orta / yüksek | Kesinti sırası SOW'da yazılı: geç gelen kartın tura yeniden katılması, dispute zaman çizelgesi, üçüncü sunucu. Her Cuma saatler gözden geçirilir; 2. hafta sonunda %50'nin altında kalınırsa kesintiye geçilir. |
| **Canlı upgrade storage'ı bozar** | Düşük / çok yüksek | Mevcut struct'lara alan eklenmiyor, yalnızca yeni anahtarlar ekleniyor. Eski wasm üzerinde upgrade testi, yeni ID'lerle prova ve dashboard'un iki düzeni de okuması korunuyor. Önceki wasm hash'i not edilir; zaman kilidi açılmadan önceki son kurtarma yolu eski `upgrade()`. |
| **execute_upgrade hatası kodu dondurur** | Düşük / çok yüksek | Testte zaman kilidiyle **üçüncü bir sürüme** de upgrade edilir. Provada aynı akış denenir. Canlıda ilk timelock'lu upgrade (D3) küçük bir değişiklikle yapılır. |
| **Stellar testnet sıfırlanır** (SDF periyodik olarak yapıyor) | Düşük-orta / yüksek | SDF duyuruları takip edilir. Deploy, migration ve kayıt script'leri tek komutla yeniden çalışabilir halde tutulur. **Her kanıt elde edildiği gün** tx JSON'u (`stellar tx fetch`) ve stellar.expert ekran görüntüsü olarak `docs/instaward/evidence/` altına kaydedilir. |
| **Multisig imzalama akışı takılır** | Orta / orta | 3.4 adımından önce, 2. haftada provada multisig ile `accept_admin` bir kez denenir. Yedek anahtar çevrimdışı saklanır. İmzalama adımları `scripts/` altında belgelenir. |
| **B sunucusu düşer, quorum kilitlenir** | Orta / orta | Bekleyen turlar zincirde görünür. Threshold zaman kilidiyle düşürülebilir. B'ye uptime izleme eklenir. Saat kalırsa üçüncü sunucu kurulur. |
| **A ile B arasındaki spread büyük çıkar** | Yüksek (ilk günlerde) / orta | B'nin erken başlaması, `max_spread`'in ölçüme göre seçilmesi, metodolojinin her iki sunucuda aynı commit ve aynı sabitlerle çalışması. |
| **Kaynak limitleri** (quorum ile kontratlar arası çağrının birleşimi) | Orta / orta | M en fazla 7. Provada her yeni fonksiyonun `--sim` ile maliyeti ölçülür. Medyan, sıralama yapılmadan küçük bir Vec üzerinde hesaplanır. |
| **Aynı anahtarlarla imza ve sıra (nonce) çakışması** (A ve B aynı anda yayın yapar) | Orta / düşük | Her sunucunun kendi reporter anahtarı var, bu yüzden sequence çakışması olmaz. Cron saatleri birbirinden kaydırılır. |
| **Alchemy'nin 70 günlük penceresi kapanır** (yaklaşık 28 Kasım) | Kesin / yüksek | 1.10 adımı 1. haftada yapılır; arşiv sunucu dışına yedeklenir. |
| **Vercel `main`'den otomatik deploy ediyor**, yarım iş canlıya çıkabilir | Orta / orta | Sprint işi `instaward` branch'inde yapılır. `main`'e yalnızca hazır olan, iki düzeni de okuyabilen kod girer. |
| **Ekipten biri bir hafta yok** | Orta / yüksek | Haftalık işler iki kişiye bölünmüş. Kontrat dışı işlerin her biri tek başına yapılabilir. Kritik yol (kontratlar) Beyza'da, bu yüzden Önder 2. haftadan itibaren testleri okuyup gözden geçirir. |
| **Bir başarı kriteri yanlış yorumlanır** | Orta / yüksek | Her Cuma aşağıdaki izleme tablosu güncellenir; belirsiz bir kriter çıkarsa İrem'e erkenden sorulur. |

---

## SOW kriteri → iş → kanıt izleme tablosu

| SOW kriteri | İş | Kanıt (EVIDENCE.md bölümü) |
|---|---|---|
| D1: en az 20 yeni test, proptest (10k+ vaka), cargo-fuzz invariantları | 2.2, 3.3 | D1-1 |
| D1: threshold 2 tx'i | 4.1 | D1-2 |
| D1: 2 sunucudaki 2 farklı adresle kesinleşmiş en az 3 kart | 4.2 | D1-3 |
| D1: `get_pending_round` | 4.2 | D1-4 |
| D1: `FLAG_REPORTER_DISAGREEMENT` | 4.2 | D1-5 |
| D1: verify-score bir quorum kartında "match" | 4.3 | D1-6 |
| D1: monarank.xyz stellar.toml'ü | 0.4, 1.8, 4.6 | D1-7 |
| D1: quorum panelinin ekran görüntüsü | 4.4 | D1-8 |
| D2: eski wasm'dan upgrade testi (120 anchor) | 1.2 | D2-1 |
| D2: indeks property testi | 3.3 | D2-2 |
| D2: `anchor_count()`, eski anahtarın silinmesi, migration tx'leri | 2.6 | D2-3 |
| D2: `TimelockActive` hatası, 24 saat sonra başarılı upgrade | 3.6 | D2-4 |
| D2: multisig'e iki adımlı admin devri | 3.5 | D2-5 |
| D2: zincirde devre dışı bırakılmış anchor | 3.7 | D2-6 |
| D2: runbook, config profili, öz-değerlendirme | 3.9, 4.7 | D2-7 |
| D2: bütün test suite'leri geçiyor | 4.8 | D2-8 |
| D3: claim ve dispute testleri | 3.1, 3.2 | D3-1 |
| D3: attest ve claim tx'leri | 4.5 | D3-2 |
| D3: kabul edilen ve reddedilen birer itiraz | 4.5 | D3-3 |
| D3: dashboard ekran görüntüsü | 4.4 | D3-4 |
| Genel: demo videosu, git tag'leri, sprint raporu | 4.9 | Final |

---

## Chapter takvimi (faturalanmaz, ama SOW'da yazılı)

- **Haftalık güncelleme (Stellar Türkiye kanalı):** 23 Ekim, 30 Ekim, 6 Kasım, 13 Kasım.
  - Şablon: bu hafta neler bitti (EVIDENCE linkleriyle), gelecek hafta neler yapılacak, riskler.
- **Mid-sprint check-in:** 30 Ekim – 2 Kasım arası, canlı demoyla.
- **Sprint sonu:** başarı kriterlerine karşı gözden geçirme, ve chapter builder'larına Soroban upgrade, zaman kilidi ve quorum desenleri üzerine kısa bir oturum.

---

## Follow-on Instaward için şimdiden toplanacaklar

Fikirler `~/Desktop/instawards/2026_10_10 Follow-on Instaward notlari.md` dosyasında. Sprint boyunca şunlar not edilir:

- **Dış raporlayıcı adayları:** kendi raporlayıcısını çalıştırmaya ilgi gösteren her kişi veya kurum.
- **Gerçek anchor operatörlerinin ilgisi:** claim akışına katılmak isteyenler.
- **Saatlerin gerçekte nereye gittiği:** sonraki SOW'un bütçesi daha gerçekçi olsun diye.
- **Sprint sonu raporunun "next step" bölümü:** follow-on başvurusuna doğrudan bağlanacak.

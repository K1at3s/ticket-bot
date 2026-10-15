# Discord Ticket Bot

Discord.js ve MongoDB ile çok sunuculu ticket botu.

Depo: https://github.com/K1at3s/ticket-bot
Kaynak ticket akışı: https://github.com/K1at3s/XelosV14

XelosV14 ticket sistemi bağımsız bota aktarıldı. Yerel kaynak klasör değiştirilmez. Ticket verileri MongoDB'de Mongoose üzerinden, sunucu ID'sine göre ayrı saklanır.

## Çalıştırma

Bun kurulu olmalı. `.env` dosyasında DISCORD_TOKEN, MONGODB_URI ve isteğe bağlı MONGODB_DATABASE yer alır (varsayılan: ticket_bot).

```powershell
bun install
bun run start
```

Ayrı deploy yoktur. XelosV14 commandHandler, Commands klasörünü tarayıp komutları açılışta global kaydeder. Yeni komutlar için botu yeniden başlat.
Discord Developer Portal'da Message Content Intent açık olmalıdır. Botu bot ve applications.commands kapsamlarıyla sunucuya ekle.
Ticket kanalları için Kanalı Görüntüle, Kanalları Yönet, Mesaj Gönder, Mesaj Geçmişini Oku, Bağlantı Yerleştir ve Dosya Ekle yetkileri gerekir. Panel içeriklerini webhook ile yayınlamak için Webhookları Yönet de gerekir.

## İlk kurulum

`/biletsistemi kurulum` (İngilizce `/ticketsystem setup`) ile ticket kategorisini, panel kanalını, liste/buton yöntemini ve destek rollerini seç.
Liste seçeneklerinde her satır `İsim|Emoji`, `İsim||Emoji`, yalnızca `İsim` veya `İsim|Açıklama|Emoji` olabilir. Açıklama zorunlu değildir.
Kurulum sonunda **Panel oluşturucuyu aç** düğmesi çıkar; hiçbir hazır embed otomatik gönderilmez.

## Çoklu mesaj / embed oluşturucu

`/biletpaneli` (İngilizce `/ticketpanel`) komutunda kanal ve liste/buton seç. Aynı kanalda kayıtlı panel varsa mevcut parçaları yükler.

- **Metin ekle:** bağımsız düz metin mesajı (Markdown desteklenir).
- **Embed ekle:** başlık, açıklama, görsel URL ve özel HEX renk. Başlık/açıklama zorunlu değildir; en az bir içerik gerekir.
- **Görsel embed ekle:** sadece setImage görseli, isteğe bağlı renk; otomatik başlık/açıklama eklenmez.
- Listeden parçayı seç; **Seçili parçayı düzenle**, **Sil**, **Yukarı taşı**, **Aşağı taşı** ile yönet.
- **Parçayı önizle:** yalnızca sana görünen önizleme.
- **Webhook / Menü yazısı:** webhook adı, avatarı ve kapalı menü/buton yazısını düzenle.
- **Gönder / Güncelle:** bütün parçaları listedeki sırayla ayrı webhook mesajları olarak gönderir; en altta yalnızca botun listesi/butonu olur.

Bir panelde en fazla 15 parça bulunabilir. Metin mesajı 2000, embed açıklaması 4000 karakterle sınırlıdır. Oluşturucu her seçili parçayı ayrı önizler, bu yüzden Discord'un tek mesajdaki embed sınırına takılmaz.
Hiç parça eklemezsen yalnızca botun menüsü/butonu gönderilir. Gönderilene kadar kanalda mesaj oluşmaz.

Webhook adı: `{sunucuadı}`, `{sunucuismi}` veya `{sunucuadi}`.
Webhook avatarı: `{sunucuikonu}`, `{sunucuavatarı}` veya doğrudan URL. Sunucunun ikonu yoksa özel avatar gönderilmez.
Webhook token/URL'sini sen girmezsin ve token veritabanına yazılmaz.

Yayınlanan parçalar ve sıraları kaydedilir. Aynı kanaldaki kayıtlı panel tekrar düzenlenebilir. Parça sırası/adedi veya webhook kimliği değişirse bot kendi kayıtlı webhook mesajlarını yeniden oluşturarak sıralamayı korur; menü yine en alta gelir. Başka kanaldaki eski panel otomatik kaldırılmaz.
Taslaklar 30 dakika veya bot yeniden başlayana kadar geçerlidir. Komutları Kanalları Yönet yetkisi olanlar kullanabilir; taslak sadece sahibince düzenlenebilir.

Gönderilmiş menünün yazısını tek başına değiştirmek için `/panel-yazısı yazı: 🎫 Ticket aç` (İngilizce `/panel-label`) kullan. Kategori seçenekleri ve webhook içeriği korunur.

## Ticket kullanımı

Üyeler menü/butondan ticket açıp konu formunu doldurur. Destek ekibi üstlenir; kapatma, yeniden açma, silme ve HTML dökümü mevcuttur. Kapalı kanal silinene kadar kullanıcı başına tek kanal sınırına dahildir.
Config komutuyla log kanalı ve hareketsizlik süresi (24h, 3d; disable ile kapatma) ayarlanır. Kontrol saatliktir. Search log kanalındaki son 100 mesajı arar.
Kaynak auto-response davranışı korunur: kayıtlı yanıtlar ticket açılışında gönderilir, anahtar kelime mesaj dinleyicisi yoktur.

## Doğrulama

Çoklu parça ekleme/düzenleme/silme, sıralama, ayrı webhook mesajları, sadece bileşenden oluşan bot mesajı, eski paneli yükleme ve yetki/sahip kontrolleri taklit Discord/MongoDB çağrılarıyla test edilmiştir. Canlı Discord testi yapılmamıştır.

Paneli doğrudan yeniden açmak için `/ticketsystem edit` (Türkçe `/biletsistemi düzenle`) kullan. Kanal/yöntem seçmeden kayıtlı panel ve parçaları yüklenir. Kanalları Yönet yetkisi gerekir. Komutlar bot açılışında global güncellenir.

## Testler ve sürüm geçmişi

`bun run test` ile ağ bağlantısı kurmadan panel oluşturucu, sıralama, webhook yayınlama ve düzenleme kontrollerini çalıştır. Değişiklikler [CHANGELOG.md](CHANGELOG.md) içinde yer alır. `.env` ve `node_modules` Git tarafından hariç tutulur; yalnızca boş şablon `.env.example` paylaşılır.

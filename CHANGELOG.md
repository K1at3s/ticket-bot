# Changelog

## 1.0.0 — 2026-10-15

### Eklenenler

- Discord.js ve MongoDB/Mongoose tabanlı bağımsız ticket botu.
- XelosV14 yapısından uyarlanan komut handler'ı; açılışta otomatik global komut kaydı.
- Sunucuya özel kurulum, destek rolleri, kategori ve panel kanalı seçimi.
- Açıklaması isteğe bağlı, isim ve emoji destekli kategori menüleri ve buton yöntemi.
- Ticket konusu formu, üstlenme, gerekçeli kapatma, yeniden açma ve silme.
- HTML mesaj dökümü, log kanalı, geçmiş ticket arama ve hareketsizlikte kapatma.
- Birbirinden bağımsız metin, embed ve görsel embed parçalarından panel oluşturma.
- Parçaları ekleme, düzenleme, silme, önizleme ve sıralama; panel başına 15 parça.
- Her embed için özel HEX renk ve setImage görseli; sadece görsel içeren embed desteği.
- İçerikleri sırayla webhook'tan, menü/butonu ayrı bot mesajından gönderme.
- Webhook adı ve avatarında sunucu değişkenleri.
- Panel ayarlarını, parçaları ve mesaj kimliklerini MongoDB'de saklama.
- `/ticketsystem edit` ve `/ticketpanel` ile kayıtlı paneli düzenleme.
- `/panel-label` ile yayınlanmış menü/buton yazısını değiştirme.
- Kanalları Yönet yetkisi, taslak sahibi ve süre kontrolleri.

### Düzeltilenler

- İlk kurulumun otomatik hazır embed göndermesi kaldırıldı.
- Eksik komut import'u ve bazı ticket işlemlerindeki yetki kontrolleri düzeltildi.
- Transcript dosyasının gönderildikten sonra silinmesi düzeltildi.
- Kapalı ticket'ların hareketsizlik denetiminde tekrar işlenmesi engellendi.

### Bilinen sınırlar

- Kullanıcı başına tek ticket kanalı; kapalı kanal silinene kadar sınıra dahildir.
- Geçmiş arama log kanalındaki son 100 mesajı tarar.
- Kaynak auto-response davranışı yanıtları ticket açılışında gönderir.
- Oluşturucu taslakları bellekte 30 dakika tutulur; yeniden başlatmada kaybolur.
- Farklı kanala panel gönderilince eski kanaldaki panel otomatik kaldırılmaz.

const {
  Collection, Events, InteractionType, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, EmbedBuilder, Colors, RoleSelectMenuBuilder,
  MessageFlags // MessageFlags eklendi
} = require("discord.js");

const cooldown = new Collection();
const serverDB = require("../../Structures/Schemas/Server"); // Yol düzeltildi

module.exports = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    const client = interaction.client;

    // Kullanıcı kategori ekleme yöntemini seçtiyse
    const isTurkish = interaction.locale.startsWith("tr"); // isTurkish tanımlandı
    if (interaction.isButton() && interaction.customId === "yontem_kategori") {
      const modal = new ModalBuilder()
        .setCustomId("kategori_modal")
        .setTitle(isTurkish ? "Birden Fazla Kategori Ekle" : "Add Multiple Categories");

      const kategoriListesi = new TextInputBuilder()
        .setCustomId("kat_listesi")
        .setLabel(isTurkish ? "Kategori listesi (birden fazla satır)" : "Category list (multiple lines)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder(isTurkish ? "Genel Destek|🎫\nŞikayet|🚨\nİsim|Açıklama (isteğe bağlı)|Emoji" : "General Support|🎫\nReport|🚨\nName|Optional description|Emoji");

      modal.addComponents(
        new ActionRowBuilder().addComponents(kategoriListesi)
      );

      await interaction.showModal(modal);
    }

    // Modal gönderildiğinde
    if (interaction.isModalSubmit() && interaction.customId === "kategori_modal") {
      const rawInput = interaction.fields.getTextInputValue("kat_listesi");

      const kategoriler = rawInput
        .split(/\r?\n/)
        .map(satir => {
          const parts = satir.split("|").map(x => x?.trim());
          let [label, description, emojiRaw] = parts;
          if (!label) return null;
          // Short form: Name|emoji. Name||emoji and Name|description|emoji also work.
          if (parts.length === 2 && /^(?:<a?:\w+:\d+>|[^\p{L}\p{N}]*[\p{Extended_Pictographic}\p{Regional_Indicator}][^\p{L}\p{N}]*|[0-9#*]\uFE0F?\u20E3)$/u.test(description)) {
            emojiRaw = description;
            description = '';
          }

          let emoji;
          if (emojiRaw?.startsWith("<")) { // Özel emoji
            const match = emojiRaw.match(/^<a?:(\w+):(\d+)>$/);
            if (match) {
              emoji = {
                name: match[1],
                id: match[2],
                animated: emojiRaw.startsWith("<a:") // Animasyonlu emoji kontrolü
              };
            }
          } else if (emojiRaw) { // Unicode emoji
            emoji = { name: emojiRaw }; // Unicode emojiler için sadece 'name' yeterli
          }

          return {
            label: label.slice(0, 100),
            value: label.toLowerCase().replace(/ /g, "-").slice(0, 100),
            ...(description ? { description: description.slice(0, 100) } : {}),
            ...(emoji ? { emoji } : {})
          };
        })
        .filter(Boolean);

      if (kategoriler.length === 0 || kategoriler.length > 25 || new Set(kategoriler.map(k => k.value)).size !== kategoriler.length) {
        return interaction.reply({
          content: "❌ Geçerli kategori bulunamadı.",
          flags: [MessageFlags.Ephemeral] // ephemeral: true yerine flags kullanıldı
        });
      }

      await serverDB.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { $set: { destekkategoriListesi: kategoriler } },
        { upsert: true }
      );

      const destekKanalId = (await serverDB.findOne({ guildId: interaction.guild.id }))?.destekMesajKanal;
      const destekKanal = interaction.guild.channels.cache.get(destekKanalId);
      // Mesaj kanalına ulaşılamadı hatası, yetkili rol seçimi sonrası gönderilecek
      // Bu kısım aşağıya, roller seçildikten sonraki bloğa taşındı.
      // Eğer destekKanal yoksa, ticket mesajı gönderilmeyecek.

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("kategori_secim")
        .setPlaceholder(isTurkish ? "📂 Kategori seçerek talep oluştur" : "📂 Create a ticket by selecting a category")
        .addOptions(kategoriler);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: isTurkish ? `${interaction.guild.name} | Destek Sistemi` : `${interaction.guild.name} | Support System`, iconURL: interaction.guild.iconURL() })
        .setDescription(isTurkish ? "Aşağıdaki menüden kategori seçerek destek talebi oluşturabilirsiniz." : "You can create a support ticket by selecting a category from the menu below.")
        .setFooter({ text: isTurkish ? `${client.user.username} destek sistemi` : `${client.user.username} support system`, iconURL: client.user.avatarURL() });

      // Kategoriler kaydedildikten sonra, rol seçimi adımına geç
      const roleRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("role_category_setup") // Çakışmayı önlemek için yeni customId
          .setPlaceholder(isTurkish ? "Destek Ekibi Rolleri" : "Support Team Roles")
          .setMinValues(1)
          .setMaxValues(5)
      );

      const roleEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setDescription(isTurkish ? "Lütfen destek ekibi rollerini seçin." : "Please select the support team roles.");

      await interaction.reply({ // Modal gönderimine yanıt olarak rol menüsünü gönder
        embeds: [roleEmbed],
        components: [roleRow],
        flags: [MessageFlags.Ephemeral], // ephemeral: true yerine flags kullanıldı
      });
    }

    // Roller seçildiğinde
    if (interaction.customId === "role_category_setup") { // Yeni customId kullanıldı
      await interaction.deferUpdate().catch(() => {});
      const roleIds = interaction.values;

      await serverDB.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { $set: { destekRole: roleIds } }
      );

      const serverData = await serverDB.findOne({ guildId: interaction.guild.id });
      const { panelSetup } = require('../../Structures/Handlers/panelSetup');
      await interaction.editReply(panelSetup(interaction.user.id, serverData.destekMesajKanal, 'select'));

    }
  }
};

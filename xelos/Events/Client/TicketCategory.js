const {
  Collection, Events, InteractionType, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, EmbedBuilder, Colors, RoleSelectMenuBuilder,
  MessageFlags // MessageFlags eklendi
} = require("discord.js");

const cooldown = new Collection();
const serverDB = require("../../Structures/Schemas/Server");
const { isManager, activeSetup, supportRoles } = require('../../Structures/Handlers/security');

module.exports = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!(await isManager(interaction)) || !(await activeSetup(interaction))) {
      return interaction.reply({ content: 'This setup has expired, belongs to another user, or you lack permission.', flags: MessageFlags.Ephemeral });
    }
    const client = interaction.client;



    if (interaction.isButton() && interaction.customId === "yontem_kategori") {
      const modal = new ModalBuilder()
        .setCustomId("kategori_modal")
        .setTitle("Add Multiple Categories");

      const kategoriListesi = new TextInputBuilder()
        .setCustomId("kat_listesi")
        .setLabel("Category list (multiple lines)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder("General Support|🎫\nReport|🚨\nName|Optional description|Emoji");

      modal.addComponents(
        new ActionRowBuilder().addComponents(kategoriListesi)
      );

      await interaction.showModal(modal);
    }


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
          if (emojiRaw?.startsWith("<")) {
            const match = emojiRaw.match(/^<a?:(\w+):(\d+)>$/);
            if (match) {
              emoji = {
                name: match[1],
                id: match[2],
                animated: emojiRaw.startsWith("<a:")
              };
            }
          } else if (emojiRaw) { // Unicode emoji
            emoji = { name: emojiRaw };
          }

          return {
            label: label.slice(0, 100),
            value: label.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 50),
            ...(description ? { description: description.slice(0, 100) } : {}),
            ...(emoji ? { emoji } : {})
          };
        })
        .filter(Boolean);

      if (kategoriler.length === 0 || kategoriler.length > 25 || new Set(kategoriler.map(k => k.value)).size !== kategoriler.length) {
        return interaction.reply({
          content: "❌ No valid categories found.",
          flags: [MessageFlags.Ephemeral]
        });
      }

      await serverDB.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { $set: { destekkategoriListesi: kategoriler } },
        { upsert: true }
      );

      const destekKanalId = (await serverDB.findOne({ guildId: interaction.guild.id }))?.destekMesajKanal;
      const destekKanal = interaction.guild.channels.cache.get(destekKanalId);




      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("kategori_secim")
        .setPlaceholder("📂 Create a ticket by selecting a category")
        .addOptions(kategoriler);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: `${interaction.guild.name} | Support System`, iconURL: interaction.guild.iconURL() })
        .setDescription("You can create a support ticket by selecting a category from the menu below.")
        .setFooter({ text: `${client.user.username} support system`, iconURL: client.user.avatarURL() });


      const roleRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("role_category_setup")
          .setPlaceholder("Support Team Roles")
          .setMinValues(1)
          .setMaxValues(5)
      );

      const roleEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setDescription("Please select the support team roles.");

      await interaction.reply({
        embeds: [roleEmbed],
        components: [roleRow],
        flags: [MessageFlags.Ephemeral],
      });
    }


    if (interaction.customId === "role_category_setup") {
      await interaction.deferUpdate().catch(() => {});
      const roleIds = await supportRoles(interaction.guild, interaction.values);

      await serverDB.findOneAndUpdate(
        { guildId: interaction.guild.id },
        { $set: { destekRole: roleIds }, $unset: { setupOwner: '', setupExpires: '' } }
      );

      const serverData = await serverDB.findOne({ guildId: interaction.guild.id });
      const { panelSetup } = require('../../Structures/Handlers/panelSetup');
      await interaction.editReply(panelSetup(interaction.user.id, serverData.destekMesajKanal, 'select'));

    }
  }
};

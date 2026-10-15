const serverDB = require("../Schemas/Server");
const { createTranscript } = require("discord-html-transcripts");
const { EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const ms = require('ms');
const logger = require('../Handlers/logger');

const CHECK_INTERVAL = 3600000; // 1 saat

/**
 * Closes an inactive ticket channel.
 * @param {import('discord.js').Client} client The Discord client.
 * @param {import('discord.js').TextChannel} channel The ticket channel to close.
 * @param {object} ticketInfo The ticket information from the database.
 * @param {object} serverData The server's data from the database.
 */
async function closeInactiveTicket(client, channel, ticketInfo, serverData) {
    const isTurkish = channel.guild.preferredLocale === 'tr';
    const reason = isTurkish ? 'Hareketsizlik nedeniyle otomatik olarak kapatıldı.' : 'Automatically closed due to inactivity.';

    logger.info(`[TicketInactivity] Kapatılıyor: ${channel.name} (${channel.id}) - Sebep: Hareketsizlik`);

    // --- Transcript Logging ---
    if (serverData.destekLogChannel) {
        const logChannel = await channel.guild.channels.fetch(serverData.destekLogChannel).catch(() => null);
        if (logChannel) {
            try {
                // Fetch first message to get subject and category
                const firstMessage = await channel.messages.fetch({ after: 0, limit: 1 }).then(messages => messages.first());
                const firstEmbed = firstMessage?.embeds?.[0];
                
                const subject = firstEmbed?.title?.replace('Konu: ', '') || (isTurkish ? 'Bilinmiyor' : 'Unknown');
                const categoryField = firstEmbed?.fields?.find(f => f.name === (isTurkish ? 'Kategori' : 'Category'));
                const category = categoryField?.value || `\`${isTurkish ? "Genel" : "General"}\``;
                const creationTimestamp = Math.floor(channel.createdTimestamp / 1000);

                const attachment = await createTranscript(channel, {
                    limit: -1,
                    returnType: 'attachment',
                    filename: `${channel.name}.html`,
                    poweredBy: false,
                });

                const logEmbed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle(isTurkish ? 'Talep Otomatik Kapatıldı' : 'Ticket Auto-Closed')
                    .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() })
                    .addFields(
                        { name: isTurkish ? 'Talep ID' : 'Ticket ID', value: `\`${ticketInfo.ticketName || channel.name}\``, inline: false },
                        { name: isTurkish ? 'Konu' : 'Subject', value: subject, inline: false },
                        { name: isTurkish ? 'Talebi Açan' : 'Opened By', value: `<@${ticketInfo.userId}>`, inline: true },
                        { name: isTurkish ? 'Talebi Kapatan' : 'Closed By', value: `${client.user.username} (Auto)`, inline: true },
                        { name: isTurkish ? 'Üstlenen Yetkili' : 'Claimed By', value: ticketInfo.claimedBy ? `<@${ticketInfo.claimedBy}>` : (isTurkish ? 'Yok' : 'None'), inline: true },
                        { name: isTurkish ? 'Kategori' : 'Category', value: category, inline: true },
                        { name: isTurkish ? 'Açılış Zamanı' : 'Opened At', value: `<t:${creationTimestamp}:F>`, inline: true },
                        { name: isTurkish ? 'Kapanış Zamanı' : 'Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                        { name: isTurkish ? 'Kapatma Nedeni' : 'Close Reason', value: reason },
                    )
                    .setTimestamp();
                
                await logChannel.send({ embeds: [logEmbed], files: [attachment] });
            } catch (err) {
                logger.error(`[TicketInactivity] Bilet log'u gönderilemedi (${channel.id}):`, err);
            }
        }
    }

    // --- Channel Closing Logic ---
    try {
        await serverDB.updateOne({ guildId: channel.guild.id, "destekUser.channelId": channel.id }, { $set: { "destekUser.$.claimedBy": null, "destekUser.$.closed": true } });
        const userID = ticketInfo.userId;
        await channel.permissionOverwrites.edit(userID, { ViewChannel: false });
        
        let mevcutKanalAdi = channel.name;
        let eskiIsim = isTurkish ? "destek-" : "ticket-";
        let yeniIsim = isTurkish ? "kapalı-" : "closed-";
        let yeniKanalAdi = mevcutKanalAdi.includes(eskiIsim) ? mevcutKanalAdi.replace(eskiIsim, yeniIsim) : `${yeniIsim}${mevcutKanalAdi}`;
        await channel.setName(yeniKanalAdi);

        const delRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("del").setLabel(isTurkish ? "🗑️ Talebi Sil" : "🗑️ Delete Ticket").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("transcript").setLabel(isTurkish ? "📄 Mesaj Geçmişi" : "📄 Transcript").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("open").setLabel(isTurkish ? "🔓 Talebi Aç" : "🔓 Reopen Ticket").setStyle(ButtonStyle.Success)
        );

        const closeEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle(isTurkish ? 'Talep Otomatik Olarak Kapatıldı' : 'Ticket Automatically Closed')
            .setDescription(`${isTurkish ? "Bu talep, uzun süre işlem görmediği için kapatılmıştır." : "This ticket was closed due to a long period of inactivity."}`)
            .addFields({ name: isTurkish ? 'Neden' : 'Reason', value: reason });

        await channel.send({ embeds: [closeEmbed], components: [delRow] });
    } catch (err) {
        logger.error(`[TicketInactivity] Bilet kanalı kapatılamadı (${channel.id}):`, err);
    }
}


async function checkInactiveTickets(client) {
    logger.info('[TicketInactivity] Hareketsiz biletler kontrol ediliyor...');
    try {
        const servers = await serverDB.find({ "destekAutoClose.enabled": true });
        if (servers.length === 0) return;

        for (const server of servers) {
            const guild = client.guilds.cache.get(server.guildId);
            if (!guild) continue;

            const autoCloseDurationMs = ms(server.destekAutoClose.duration);
            if (!Number.isFinite(autoCloseDurationMs)) continue;

            const activeTickets = server.destekUser.filter(t => t.channelId && !t.closed); // Sadece channelId'si olanları al
            if (activeTickets.length === 0) continue;

            for (const ticket of activeTickets) {
                const channel = guild.channels.cache.get(ticket.channelId);
                if (!channel) {
                    await serverDB.updateOne({ guildId: guild.id }, { $pull: { destekUser: { channelId: ticket.channelId } } });
                    continue;
                }

                try {
                    const lastMessage = await channel.messages.fetch({ limit: 1 }).then(messages => messages.first());
                    const lastActivityTimestamp = lastMessage ? lastMessage.createdTimestamp : channel.createdTimestamp;

                    if (Date.now() - lastActivityTimestamp > autoCloseDurationMs) {
                        await closeInactiveTicket(client, channel, ticket, server);
                    }
                } catch (err) {
                    if (err.code !== 10003) { // Unknown Channel hatasını yoksay
                       logger.error(`[TicketInactivity] Bilet kanalı (${channel.id}) için son mesaj alınamadı:`, err);
                    }
                }
            }
        }
    } catch (error) {
        logger.error('[TicketInactivity] Genel kontrol hatası:', error);
    }
}

function initializeTicketInactivityChecker(client) {
    logger.info("[TicketInactivity] Otomatik bilet kapatma denetleyicisi başlatıldı.");
    setTimeout(() => checkInactiveTickets(client), 60000).unref(); // İlk kontrol 1 dk sonra
    setInterval(() => checkInactiveTickets(client), CHECK_INTERVAL).unref();
}

module.exports = initializeTicketInactivityChecker;
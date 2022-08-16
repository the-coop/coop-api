import { MessageActionRow, MessageButton } from "discord.js";

export default class InteractionHelper {

    static confirm(interaction, texts) {
        return new Promise((resolve, reject) => {
            // Show confirmation and prompt.
            const ConfirmationActions = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId('confirm')
                        .setLabel('Confirm')
                        .setStyle('SUCCESS'),
                    new MessageButton()
                        .setCustomId('cancel')
                        .setLabel('Cancel')
                        .setStyle('DANGER'),
                );

            interaction.reply({ content: texts.preconfirmationText, components: [ConfirmationActions], ephemeral: true });

            const collector = interaction.channel.createMessageComponentCollector(
                { filter: i => !!i, time: 15000 }
            );
            collector.on('collect', i => {
                i.update({ content: i.customId === 'confirm' ? 
                        texts.confirmText : texts.cancelText, 
                    components: [], 
                    ephemeral: true 
                });

                resolve(i.customId === 'confirm');
            });

            // Handle timeout (no selection).
            collector.on('end', () => resolve(false));
        });
    }

}
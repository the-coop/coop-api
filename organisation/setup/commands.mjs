import fs from 'fs';
import path from 'path';
import { Collection } from "discord.js";

// https://discordjs.guide/creating-your-bot/command-handling.html#reading-command-files
export default async function setupCommands(client) {    
    // Start locally loading the commands.
    client.commands = new Collection();

    // Seems like Sapphire is trying to load from commands folder (?)
    
    // Parse throuh the command files
    const commandsDir = path.resolve('./commands/');
    const commandFolders = fs.readdirSync(commandsDir,  { withFileTypes: true }).filter(de => de.isDirectory());
    commandFolders.map(async f => {
        const cmdFolderPath = commandsDir + '/' + f.name + '/';
        const commandFiles = fs.readdirSync(cmdFolderPath).filter(file => file.endsWith('.mjs'));

        for (const file of commandFiles) {
            // Dynamically import the command via path.
            const command = await import(`../../commands/${f.name}/${file}`);
    
            // Register the command locally.
            client.commands.set(command.name, command);
        }
    });

    // Dynamically load and execute the command based on the interaction command name/key.
    client.on('interactionCreate', async interaction => {
        if (!interaction.isCommand()) return;

        const command = client.commands.get(interaction.commandName);
    
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    });
}

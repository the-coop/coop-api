import { EMOJIS } from '../../../organisation/config.mjs';
import { CHANNELS, MESSAGES, USERS } from '../../../organisation/coop.mjs';

export default async function memberJoined(member) {

  try {
    // Send direct message and channel message about next steps.
    const dmWelcomeMessage = await USERS._dm(
      member.user.id,
      `Welcome to **The Coop!** Please introduce yourself in ${CHANNELS.textRef('INTRO')} so the community can fully approve you into the server :smile:!\n\n` +
      `_You may find the "!help" command informative, it offers some useful hints. To use it send Cooper (me) or in the server a message saying "!help" - all of our commands follow this format._\n\n` +
      'Find our social media accounts here if you\'d like to support us there!\n' +
      'https://discord.com/channels/723660447508725802/841126959298773052/864617510624428033'
    );

    // Add some nice emojis to dm welcome message.
    MESSAGES.delayReact(dmWelcomeMessage, EMOJIS.COOP, 333);
    MESSAGES.delayReact(dmWelcomeMessage, '👋', 666);

    // Notify community:
    const joinAnnouncementText = `**Someone new joined "${member.user.username}": ${CHANNELS.textRef('TALK')}!**`;
    CHANNELS._codes(['TALK'], joinAnnouncementText);

    // Send the welcome message.
    const welcomeMessage = await CHANNELS._postToChannelCode('TALK', 
      `Hey <@${member.user.id}>! Please introduce yourself in ${CHANNELS.textRef('INTRO')} so the community can fully approve you into the server :smile:!\n\n` +
      `_Be aware that you can only send one ${CHANNELS.textRef('INTRO')} message, make it good!_\n\n` +
      `Here in ${CHANNELS.textRef('TALK')} you get the chance to talk to the community while waiting to get accepted :D! `
    );
    
    // React with coop emoji... because.
    MESSAGES.delayReact(welcomeMessage, EMOJIS.COOP, 333);
    MESSAGES.delayReact(welcomeMessage, '👋', 666);

  } catch(e) {
    console.error(e)
  }
}
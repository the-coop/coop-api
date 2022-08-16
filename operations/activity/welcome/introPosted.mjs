import { Permissions } from 'discord.js';

import { USERS, MESSAGES, ROLES, CHANNELS, TIME } from '../../../organisation/coop.mjs';
import { RAW_EMOJIS, ROLES as ROLES_CONFIG, CHANNELS as CHANNEL_CONFIG } from '../../../organisation/config.mjs';

export default async (msg) => {
    try {
      if (msg.channel.id !== CHANNEL_CONFIG.INTRO.id) return false;

      // Ignore Cooper's messages.
      if (msg.author.bot) return false;

      // Access the full featured member object for the user.
      const memberSubject = USERS._getMemberByID(msg.author.id);

      // Check they haven't already posted an intro
      const savedUser = await USERS.loadSingle(memberSubject.user.id);

      // Add intro message link and time to intro if in the database.
      const introLink = MESSAGES.link(msg);
      
      // Add an intro link for a member without an existing intro.
      if (savedUser && !savedUser.intro_link)
        return await USERS.setIntro(memberSubject.user.id, msg.content, introLink, TIME._secs());

      // Prevent users from adding two intro_links.
      if (savedUser && savedUser.intro_link) {

        const warningText = `**You have already posted an intro**, only one introduction message allowed. \n\n` +
        `Deleting your message in 6 seconds, copy it if you want to preserve it.`;

        // Send warning.
        MESSAGES.silentSelfDestruct(msg, warningText, 0, 5000);

        // Delete the intro.
        MESSAGES.delayDelete(msg, 3333 * 2);

        return null;
      }

      // Send avatar + header embed (due to loading jitter issue)
      const username = memberSubject.user.username;

      // Send embed to approval channel for redeeming non-members via introduction.
      if (!USERS.hasRoleID(memberSubject, ROLES_CONFIG.MEMBER.id)) {
        // Inform the server and general chat (ping intro posted subscribers.
        const introText = `${ROLES._textRef('INTRO_POSTED_PING')}, ${username} posted an introduction in ${CHANNELS.textRef('INTRO')}! 👋`;
        await CHANNELS._send('TALK', introText, {});
      
        await CHANNELS._postToChannelCode('TALK', MESSAGES.embed({
          url: MESSAGES.link(msg),
          title: `${username}'s entry is being voted upon!`,
          description: `Please read ${CHANNELS.textRef('INTRO')} and submit your vote! \n` +
            `_In ${CHANNELS.textRef('TALK')} you get the chance to talk to ${username} and get to know them more before voting._`,
          thumbnail: USERS.avatar(memberSubject.user)
        }));

        MESSAGES.delayReact(msg, RAW_EMOJIS.VOTE_FOR, 666);
        MESSAGES.delayReact(msg, RAW_EMOJIS.VOTE_AGAINST, 999);

        // Remove SEND_MESSAGE permission from the user (only 1 intro message supported).
        msg.channel.permissionOverwrites.create(msg.author.id, { [Permissions.FLAGS.SEND_MESSAGES]: false });
      }

  } catch(e) {
    console.error(e)
  }
}

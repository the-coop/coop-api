import { USERS, CHANNELS, SERVER, STATE } from '../../../organisation/coop.mjs';


export default async function memberLeft(member) {

  try {
    const server = SERVER._coop();

    // Post in leaders channel.
    await CHANNELS
      .getByCode(server, 'LEADERS')
      .send(`${member.user.username} has flown the coop. F for ${member.user.username}`); 

    // Remove from database and cascade all other entries (optimisation)
    await USERS.removeFromDatabase(member);

  } catch(e) {
    console.error(e)
  }
}
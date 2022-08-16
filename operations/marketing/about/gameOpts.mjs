// import { ROLES } from '../../../organisation/config';
import COOP from '../../../organisation/coop.mjs';

export default class GameOpts {

    static logsToggle(reaction, user) {
        COOP.ROLES.toggle(user.id, 'LOGS');
    }

    static conquestToggle(reaction, user) {
        COOP.ROLES.toggle(user.id, 'CONQUEST');
    }

}
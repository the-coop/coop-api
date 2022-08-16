import COOP, { SERVER, USERS } from '../../../../organisation/coop.mjs';
import { ROLES as ROLES_CONFIG } from '../../../../organisation/config.mjs';

export default class RolesHelper {

    static _textRef(code) {
        return `<@&${ROLES_CONFIG[code].id}>`;
    }

    static _allWith(roleCode) {
        const role = ROLES_CONFIG[roleCode].id || null;
        if (!role) return [];
        return COOP.USERS._cache()
            .filter(member => member.roles.cache.has(role));
    }

    static _allWithout(roleCode) {
        const role = ROLES_CONFIG[roleCode].id || null;
        if (!role) return [];
        return COOP.USERS._cache()
            .filter(member => !member.roles.cache.has(role));
    }

    static getRoles(guild, rolesSelection) {
        return guild.roles.cache.filter(r => rolesSelection.includes(r.name));
    }
    static getRolesByID(guild, rolesSelection) {
        return guild.roles.cache.filter(r => rolesSelection.includes(r.id));
    }
    static getRoleByID(guild, roleID) {
        return guild.roles.cache.get(roleID);
    }

    static _get(roleID) {
        return this.getRoleByID(SERVER._coop(), roleID);
    }

    static _getByCode(roleCode) {
        return this.getRoleByID(SERVER._coop(), ROLES_CONFIG[roleCode].id);
    }

    static _idsByCodes(codes = []) {
        return codes.map(code => ROLES_CONFIG[code].id);
    }

    static _getCoopRoleCodeByID(roleID) {
        let defaultCode = 'UNKNOWN_COOP_ROLE_CODE';
        let code = defaultCode;
        Object.keys(ROLES_CONFIG).map(roleKey => {
            const coopRoleID = ROLES_CONFIG[roleKey].id || null;
            if (coopRoleID === roleID) code = roleKey;
        });
        if (code === defaultCode)
            throw new Error(roleID + ' ' + defaultCode);

        return code;
    }

    static _getCodes(roleCodes = []) {
        let roles = [];
        const guild = SERVER._coop();

        roleCodes.map(code => {
            const roleConfig = ROLES_CONFIG[code] || null;
            if (roleConfig) {
                const roleID = roleConfig.id || null;
                if (!roleID) {
                    const role = this.getRoleByID(guild, roleID);
                    if (role) roles.push(role);
                }
            }

        });
        return roles;
    }

    static add(member, roleCode) {
        const guild = SERVER._coop();
        const role = this.getRoleByID(guild, ROLES_CONFIG[roleCode].id);
        return member.roles.add(role);
    }

    static _add(userID, roleCode) {
        try {
            const guild = SERVER._coop();
            const role = this.getRoleByID(guild, ROLES_CONFIG[roleCode].id);
            const member = COOP.USERS._getMemberByID(userID);

            if (role && member) return member.roles.add(role);
            else {
                // Should throw error?
                return false;
            }
        } catch(e) {
            console.log('Error adding role');
            console.error(e);
        }
    }

    static _addCodes(userID, roleCodes) {
        const member = COOP.USERS._getMemberByID(userID);
        const roleIDs = RolesHelper._idsByCodes(roleCodes);
        return member.roles.add(roleIDs);
    }

    static async toggle(userID, roleCode) {
        try {
            if (!Object.keys(ROLES_CONFIG).includes(roleCode)) return false;

            const member = COOP.USERS._getMemberByID(userID);

            // TODO: Track roles self-changed as statistic.
            if (!member) return false;

            if (!this._idHasCode(userID, 'MEMBER')) {
                // TODO: Remove non-members reactions.
                // TODO: Try to send a message stating they need to be approved?
                return false;
            }
    
            // Check if user has it or not.
            const hasRoleAlready = COOP.USERS.hasRoleID(member, ROLES_CONFIG[roleCode].id);
            if (!hasRoleAlready) await this._add(userID, roleCode);
            else await this._remove(userID, roleCode);
            return true;

        } catch(e) {
            console.log('Error with toggle role ' + roleCode);
            console.error(e);
        }
    }

    static async _remove(userID, roleCode) {
        try {
            const guild = SERVER._coop();
            const role = this.getRoleByID(guild, ROLES_CONFIG[roleCode].id);
            const user = COOP.USERS._getMemberByID(userID);
            if (role && user) return await user.roles.remove(role);
        } catch(e) {
            console.log('Error removing role');
            console.error(e);
        }
    }

    static _idHasCode(userID, roleCode) {
        const member = USERS._getMemberByID(userID);
        return this._has(member, roleCode);
    }

    static _has(member, roleCode) {
        try {
            const roleID = ROLES_CONFIG[roleCode].id;
            return member.roles.cache.has(roleID);
        } catch(e) {
            console.log('Error reading code from member', member, roleCode);
            console.error(e);
            return false;
        }
    }

    static _getUsersWithRoleCodes(roleCodes) {
        const guild = SERVER._coop();
        return guild.members.cache.filter(member => {
            let match = false;

            // Test if they have any role codes.
            roleCodes.forEach(roleCode => {
                const roleID = ROLES_CONFIG[roleCode].id;
                if (member.roles.cache.has(roleID)) match = true;
            });

            return match;
        });
    }

    static _getUserWithCode(code) {
        let user = null;

        const guild = SERVER._coop();
        const roleID = ROLES_CONFIG[code].id || null;

        const filterUsers = guild.members.cache.filter(member => member.roles.cache.has(roleID));
        if (filterUsers.size > 0) user = filterUsers.first();

        return user;
    }
}
import DatabaseHelper from '../../..//databaseHelper.mjs';

export default class UserRoles {

    static all() {
        return DatabaseHelper.manyQuery({
            text: 'SELECT * FROM user_roles'
        })
    }

    static get(id) {
        return DatabaseHelper.manyQuery({
            text: 'SELECT * FROM user_roles WHERE discord_id = $1',
            values: [id]
        });
    }

    static add(id, roleCode, roleID) {
        return DatabaseHelper.manyQuery({
            text: 'INSERT INTO user_roles(discord_id, role_code, role_id) VALUES($1, $2, $3)',
            values: [id, roleCode, roleID]
        });
    }

    static remove(userID, roleID) {
        return DatabaseHelper.manyQuery({
            text: 'DELETE FROM user_roles WHERE discord_id = $1 AND role_id = $2',
            values: [userID, roleID]
        });
    }

}
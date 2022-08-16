import { TIME } from "../../../../organisation/coop.mjs";
import Database from "../../../../organisation/setup/database.mjs";
import DatabaseHelper from "../../../databaseHelper.mjs";

export default class BaseHelper {

    static async all() {
        const query = {
            name: "get-all-bases",
            text: `SELECT * FROM bases
                INNER JOIN users 
                ON bases.owner_id = discord_id`
        };
        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }

    static async get(faceID) {
        const query = {
            name: "get-specific-base",
            text: `SELECT * FROM bases WHERE face_id = $1
                INNER JOIN users 
                ON bases.owner_id = discord_id`,
            values: [faceID]
        };
        const result = await Database.query(query);
        return DatabaseHelper.single(result);
    }

    static async add(faceID, userID) {
        const query = {
            name: "add-specific-base",
            text: `INSERT INTO bases (face_id, owner_id, created_at)
                VALUES($1, $2, $3)`,
            values: [faceID, userID, TIME._secs()]
        };
        const result = await Database.query(query);
        return DatabaseHelper.single(result);
    }

}
import Database from "../organisation/setup/database.mjs";

export default class DatabaseHelper {

	static singleField(queryResult, field, defaultVal = null) {
        const fieldVal = (queryResult.rows[0] || { [field]: defaultVal })[field];
		return fieldVal;
	}

	static single(queryResult) {
		let singleResult = null;
		if (queryResult.rowCount > 0) singleResult = queryResult.rows[0];
		return singleResult;
	}

	static many(queryResult) {
		let manyResult = [];
		if (queryResult.rowCount > 0) manyResult = queryResult.rows;
		return manyResult;
	}

	static async singleQuery(query) {
		const queryResult = await Database.query(query);
		return this.single(queryResult);
	}

	static async manyQuery(query) {
		const queryResult = await Database.query(query);
		return this.many(queryResult);
	}

}
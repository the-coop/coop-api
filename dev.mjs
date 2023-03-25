import Database from 'coop-shared/setup/database.mjs';

export default async function dev() {

    // Connect to PostGres Database and attach event/error handlers.
    await Database.connect();

    // 
};

dev();

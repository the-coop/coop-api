import Database from 'coop-shared/setup/database.mjs';
import secrets from 'coop-shared/setup/secrets.mjs';

export default async function dev() {
    // Load secrets.
    await secrets();

    // Connect to PostGres Database and attach event/error handlers.
    await Database.connect();

    // 
};

dev();

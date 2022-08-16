import Client from 'pg/lib/client.js';
import { CHANNELS } from '../coop.mjs';

export default class Database {

    static connection = null;

    static async connect() {
        if (!this.connection) {
            const client = new Client({
                database: 'postgres',
                user: process.env.DB_USERNAME,
                password: process.env.DB_PASSWORD,
                host: process.env.DB_HOST,
                port: process.env.DB_PORT
            });
              
            await client.connect();
    
            client.on('error', e => {
                console.error(e);
    
                // Detect connection severed and restart.
                console.log(e.message, e.reason);
                if (e.message.includes('is not queryable')) {
                    console.log('Lost database connection');
                    CHANNELS._tempSend('TALK', 'Seppuku?');
                    // process.exit()
                }
            });
    
            this.connection = client;
        }
    }

    static query(query) {
        return this.connection.query(query);
    }
}
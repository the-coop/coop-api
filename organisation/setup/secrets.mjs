import AWS from 'aws-sdk';

export default async function secrets() {
    const client = new AWS.SecretsManager({ region: 'us-east-2' })

    const getSecret = async SecretId => JSON.parse((await client.getSecretValue({ SecretId }).promise()).SecretString);

    const { username: DB_USERNAME, password: DB_PASSWORD, host: DB_HOST, port: DB_PORT } = await getSecret('DATABASE');
    process.env.DB_USERNAME = DB_USERNAME;
    process.env.DB_PASSWORD = DB_PASSWORD;
    process.env.DB_HOST = DB_HOST;
    process.env.DB_PORT = DB_PORT;

    const { DISCORD_TOKEN, GUILD_ID, DISCORD_APPID, DISCORD_CLIENT_SECRET } =  await getSecret('DISCORD');
    process.env.DISCORD_TOKEN = DISCORD_TOKEN;
    process.env.GUILD_ID = GUILD_ID;
    process.env.DISCORD_APPID = DISCORD_APPID;
    process.env.DISCORD_CLIENT_SECRET = DISCORD_CLIENT_SECRET;

    const { RAISELY_ENCRYPTION_KEY } = await getSecret('RAISELY');
    process.env.RAISELY_ENCRYPTION_KEY = RAISELY_ENCRYPTION_KEY;

    const { PURESTAKE_KEY, ALGORAND_KEY } = await getSecret('ALGORAND');
    process.env.PURESTAKE_KEY = PURESTAKE_KEY;
    process.env.ALGORAND_KEY = ALGORAND_KEY;
}
import http from 'http';
import cors from 'cors';
import express from 'express';
import passport from 'passport';
import BodyParser from 'body-parser';
import * as Sentry from '@sentry/node';

import Database from 'coop-shared/setup/database.mjs';
import secrets from 'coop-shared/setup/secrets.mjs';

import APIRouter from './router.mjs';
import Auth from './auth/_auth.mjs';

// TODO: GAME SERVER HOOK (#2/?)
import configureWS from './services/socket/configure.mjs';


Sentry.init({
    dsn: "https://3182a42df90c41cfb2b6c483c1933668@o1362263.ingest.sentry.io/6653572",

    // Set tracesSampleRate to 1.0 to capture 100%
    tracesSampleRate: 1.0,
});


export default async function api() {
    // Load secrets.
    await secrets();

    // Connect to PostGres Database and attach event/error handlers.
    await Database.connect();

    // Instantiate the app.
    const app = express();

    // Enable incoming data parsing.
    app.use(BodyParser.urlencoded({ extended: false }));
    app.use(BodyParser.json());

    // Disable security, tighten "later".
    app.use(cors({ origin: '*' }));

    // Add authentication strategy for protected routes/data.
    passport.use(Auth.strategy());

    // Ensure passport is initialised on app.
    app.use(passport.initialize());

    // Create a separate http server for socket-io attach and regular services.
    const server = http.createServer(app);

    // Attach all the routes to the API.
    app.use('/', APIRouter);


    // TODO: GAME SERVER HOOK (#2/?)
    // Start listening with the websocket handler.
    configureWS(server);

    // Start listening on the app.
    server.listen(process.env.PORT);
    console.log('API listening, port: ' + process.env.PORT);
};

api();

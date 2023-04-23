import * as dotenv from 'dotenv';
dotenv.config();

import PlayerManager from './game/players/playerManager.mjs';

import http from 'http';
import cors from 'cors';
import express from 'express';
import passport from 'passport';
import BodyParser from 'body-parser';
import { Server } from "socket.io";

import Database from 'coop-shared/setup/database.mjs';
import Auth from 'coop-shared/helper/authHelper.mjs';

import APIRouter from './router.mjs';

// TODO:
// Make the client/game assume the first world/instance
// Improve world switching/region detection later on!

export class GameSocket {
    static conn = null;
    static players = {};
    static socket_map = {};
};

export class GameConfig {
    static region = null;
    static world = null;
};

export default async function api() {
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

    GameConfig.region = 'test-region';
    GameConfig.world = 'test-world';

    // Create an instance with reference to socket io server.
    GameSocket.conn = new Server(server, {
        serveClient: false,
        cors: { origin: '*' }
    });

    // Handle incoming connections, mainly here for debugging.
    GameSocket.conn.on('connection', PlayerManager.connect);

    // Start listening on the app.
    server.listen(process.env.PORT);
    console.log('API listening, port: ' + process.env.PORT);
};

api();

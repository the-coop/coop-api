import { TIME } from "../../../../organisation/coop.mjs";
import Socket from "../../../../organisation//api/services/socket/socket.mjs";
import Auth from '../../../../organisation/api/auth/_auth.mjs';

import UsersHelper from "../../../members/usersHelper.mjs";

import Ground from "./ground.mjs";

export default class GroundHelper {

    static playerConnected = async socket => {
        // Disallow guest spawning/player recognition.
        const token = Auth.decode(socket.handshake.auth.token);

        // Close the connection if no token.
        if (!token) return;

        // Check if player has spawned yet, otherwise ignore (allow observation).
        const playerSaved = await UsersHelper.loadSingleConquest(token.id);
        const hasSpawned = (
            playerSaved.x !== null && 
            playerSaved.y !== null && 
            playerSaved.z !== null
        );

        // Spawn in previous/last location.
        if (hasSpawned) {            
            const position = { x, y, z } = playerSaved;
            const rotation = { x: 0, y: 0, z: 0, w: 0 };
            const velocity = { x: 0, y: 0, z: 0 };
            this.spawn(token, socket, position, rotation, velocity);
        }
      
        // Inform all users player disconnected if they were spawned.
        socket.on('disconnect', () => {
            if (Ground.socket_map?.[socket.id]) {
                Socket.conn.emit('player_disconnected', Ground.socket_map[socket.id]);
                this.removeByPlayerID(Ground.socket_map[socket.id]);
            }
        });

        // Add an event listener for moving which broadcasts to all other users.
        socket.on('player_moved', this.playerMoved);

        // Broadcast and process player damage state.
        socket.on('player_damaged', this.playerDamaged);

        // Add an event listenerO for spawning.
        socket.on('player_spawned', spawn => this.playerSpawned(token, socket, spawn));
    }

    // TODO: Simply reflect for now
    static playerMoved(move) {
        Socket.conn.emit('player_moved', move);
    }

    // TODO: Simply reflect for now
    static playerDamaged(damage) {
        Socket.conn.emit('player_damaged', damage);
    }

    // Just accept the coordinates for now lmao, better than nothing.
    // Do not spawn if already spawned.
    static playerSpawned(token, socket, ev) {
        // Set the spawn position and rotation.
        const spawnPosVector = ev.spawn_location;
        const spawnRotationVector = { x: 0, y: 0, z: 0, w: 0 };
        this.spawn(token, socket, spawnPosVector, spawnRotationVector);
    }

    static removeByPlayerID(playerID) {
        delete Ground.socket_map[Ground.players[playerID].socket_id];
        delete Ground.players[playerID];
    }

    static spawn(token, socket, position, rotation, velocity) {
        // Check player hasn't already spawned.
        if (Ground.players[token.id]) return;

        // Initialise player data object.
        const player = {
            socket_id: socket.id,
            connected_at: TIME._secs(),
            last_activity: TIME._secs(),

            player_id: token.id,
            username: token.username,
            
            // Give a random colour
            color: 'red',

            // Positioning, angle, and velocity.
            position,
            rotation,
            velocity
        };

        // Start tracking new player.
        Ground.socket_map[socket.id] = token.id;
        Ground.players[token.id] = player;
    
        // Inform all users someone connected.
        Socket.conn.emit('player_recognised', player);
    }
}
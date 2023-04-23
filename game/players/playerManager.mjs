import Auth from 'coop-shared/helper/authHelper.mjs';
import Users from 'coop-shared/services/users.mjs';

import { GameSocket } from '../../index.mjs';

export default class PlayerManager {

    static async connect(socket) {
        // Disallow guest spawning/player recognition.
        const token = Auth.decode(socket.handshake.auth.token);

        // Close the connection if no token.
        if (!token) return;

        // Check if player has spawned yet, otherwise ignore (allow observation).
        const playerSaved = await Users.loadSingleConquest(token.id);
        const hasSpawned = (
            playerSaved.x !== null && 
            playerSaved.y !== null && 
            playerSaved.z !== null
        );

        // Spawn in previous/last location.
        if (hasSpawned) {
            // const position = { x, y, z } = playerSaved;
            const position = { x: 0, y: 0, z: 0, w: 0 };
            const rotation = { x: 0, y: 0, z: 0, w: 0 };
            const velocity = { x: 0, y: 0, z: 0 };
            PlayerManager.spawn(token, socket, position, rotation, velocity);
        }

        // TODO: If already loaded, create a new event or use player_recognised to distinguish loading/spawning.

        // Inform all users player disconnected if they were spawned.
        socket.on('disconnect', () => {
            if (GameSocket.socket_map?.[socket.id]) {
                GameSocket.conn.emit('player_disconnected', GameSocket.socket_map[socket.id]);
                PlayerManager.remove(GameSocket.socket_map[socket.id]);
            }
        });

        // Add an event listener for moving which broadcasts to all other users.
        socket.on('player_moved', PlayerManager.move);

        // Broadcast and process player damage state.
        socket.on('player_damaged', PlayerManager.damaged);

        // Add an event listenerO for spawning.
        socket.on('player_spawned', spawn => PlayerManager.spawned(token, socket, spawn));
    }

    // TODO: Simply reflect for now
    static move(move) {
        GameSocket.conn.emit('player_moved', move);
    }

    // TODO: Simply reflect for now
    static damaged(damage) {
        GameSocket.conn.emit('player_damaged', damage);
    }

    // Just accept the coordinates for now lmao, better than nothing.
    // Do not spawn if already spawned.
    static spawned(token, socket, ev) {
        console.log('Spawning');

        // Set the spawn position and rotation.
        const spawnPosVector = ev.spawn_location;
        const spawnRotationVector = { x: 0, y: 0, z: 0, w: 0 };
        this.spawn(token, socket, spawnPosVector, spawnRotationVector);
    }

    static remove(playerID) {
        delete GameSocket.socket_map[
            GameSocket.players[playerID].socket_id
        ];
        delete GameSocket.players[playerID];
    }

    static spawn(token, socket, position, rotation, velocity) {
        // Check player hasn't already spawned.
        if (GameSocket.players[token.id]) return;

        // Initialise player data object.
        const player = {
            socket_id: socket.id,
            connected_at: Math.round(Date.now() / 1000),
            last_activity: Math.round(Date.now() / 1000),

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
        GameSocket.socket_map[socket.id] = token.id;
        GameSocket.players[token.id] = player;

        // Inform all users someone connected.
        GameSocket.conn.emit('player_recognised', player);
  }
}
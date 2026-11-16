import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import catalog from './catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const LOCAL_VIDEO_DIR = path.join(PUBLIC_DIR, 'videos');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.static(PUBLIC_DIR));
// Serve player + CSS libraries locally so the app still works on a slow network
app.use('/vendor/videojs', express.static(path.join(ROOT_DIR, 'node_modules/video.js/dist')));
app.use('/vendor/bootstrap', express.static(path.join(ROOT_DIR, 'node_modules/bootstrap/dist')));

/* ---------------------------- video sources ---------------------------- */

function prettifyFileName(file) {
    return path.parse(file).name
        .replace(/[-_.]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// Any .mp4 / .webm / .m3u8 file dropped in public/videos shows up automatically
function getLocalVideos() {
    try {
        return fs.readdirSync(LOCAL_VIDEO_DIR)
            .filter(file => /\.(mp4|webm|m3u8)$/i.test(file))
            .map(file => ({
                id: 'local-' + file,
                title: prettifyFileName(file),
                description: 'Local file - plays even without internet.',
                thumb: null,
                src: '/videos/' + encodeURIComponent(file),
                credit: ''
            }));
    } catch {
        return [];
    }
}

function getAllVideos() {
    return [...getLocalVideos(), ...catalog];
}

function mimeTypeFor(src) {
    if (/\.m3u8(\?|#|$)/i.test(src)) return 'application/x-mpegURL';
    if (/\.webm(\?|#|$)/i.test(src)) return 'video/webm';
    return 'video/mp4';
}

function isHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// Accepts full http(s) links and local paths like /videos/movie.mp4
function isPlayableSrc(value) {
    try {
        return isHttpUrl(new URL(value, 'http://localhost').href);
    } catch {
        return false;
    }
}

// Safe way to hand data to inline <script> tags
function toScriptJson(data) {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

function getLanUrls() {
    const urls = [];
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses || []) {
            if (address.family === 'IPv4' && !address.internal) {
                urls.push(`http://${address.address}:${config.http.port}`);
            }
        }
    }
    return urls;
}

/* -------------------------------- routes ------------------------------- */

const rooms = new Map();

app.get('/', (req, res) => {
    res.render('home', {
        videos: getAllVideos(),
        q: typeof req.query.q === 'string' ? req.query.q : ''
    });
});

app.get('/watch', (req, res) => {
    let video;

    if (req.query.room) {
        const room = rooms.get(String(req.query.room));
        if (!room) {
            return res.status(404).render('message', {
                title: 'Room not found',
                text: 'This watch party has ended or the link is wrong. Ask the host for a new link.'
            });
        }
        video = { title: room.title, src: room.src };
    } else if (req.query.v) {
        video = getAllVideos().find(v => v.id === req.query.v);
    } else if (req.query.url && isHttpUrl(String(req.query.url))) {
        video = { title: 'Custom video', src: String(req.query.url) };
    }

    if (!video) {
        return res.status(404).render('message', {
            title: 'Video not found',
            text: 'Pick a movie from the home page, or paste a direct .mp4 / .m3u8 link.'
        });
    }

    res.render('video', {
        title: video.title,
        pageData: toScriptJson({
            src: video.src,
            type: mimeTypeFor(video.src),
            title: video.title,
            room: req.query.room ? String(req.query.room) : null
        })
    });
});

/* ------------------------------ websockets ----------------------------- */

const server = http.createServer(app);
const WSS = new WebSocketServer({ server });

/*
message format : JSON data
{ type: 'host' | 'join' | 'controls' | 'chat', ... }
*/

function send(socket, message) {
    if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function broadcast(room, message, exceptUuid = null) {
    for (const client of room.clients.values()) {
        if (client.uuid !== exceptUuid) send(client, message);
    }
}

function sendViewerCount(room) {
    broadcast(room, { type: 'connection', clients: { length: room.clients.size } });
}

// Where the host's video is *right now*, so late joiners start at the same spot
function currentRoomState(room) {
    if (!room.state) return null;
    const elapsed = room.state.paused ? 0 : (Date.now() - room.state.at) / 1000;
    return { currentTime: room.state.currentTime + elapsed, paused: room.state.paused };
}

WSS.on('connection', (socket) => {
    socket.uuid = crypto.randomUUID();

    socket.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            return; // ignore invalid JSON
        }

        switch (message.type) {
            case 'host': {
                if (socket.room) break; // already hosting
                if (!message.room || !isPlayableSrc(String(message.room.src || ''))) break;

                const roomName = 'wisdom_' + crypto.randomBytes(4).toString('hex');
                const room = {
                    owner: socket.uuid,
                    clients: new Map([[socket.uuid, socket]]),
                    src: String(message.room.src),
                    title: String(message.room.title || 'Watch party').slice(0, 120),
                    state: null
                };
                rooms.set(roomName, room);
                socket.room = roomName;

                send(socket, { type: 'room', room: { name: roomName, lanUrls: getLanUrls() } });
                sendViewerCount(room);
                break;
            }

            case 'join': {
                const roomName = message.room && String(message.room.name);
                const room = rooms.get(roomName);
                if (!room) {
                    send(socket, { type: 'error', message: 'Room does not exist!' });
                    break;
                }
                socket.room = roomName;
                room.clients.set(socket.uuid, socket);
                sendViewerCount(room);

                const state = currentRoomState(room);
                if (state) send(socket, { type: 'controls', control: 'sync', ...state });
                break;
            }

            case 'controls': {
                const room = rooms.get(socket.room);
                if (!room || room.owner !== socket.uuid) break; // only the host controls playback

                const currentTime = Number(message.currentTime) || 0;
                const paused = Boolean(message.paused);
                room.state = { currentTime, paused, at: Date.now() };

                broadcast(room, { type: 'controls', control: message.control, currentTime, paused }, socket.uuid);
                break;
            }

            case 'chat': {
                const room = rooms.get(socket.room);
                if (!room) break;
                const text = String(message.text || '').trim().slice(0, 500);
                if (!text) break;
                const name = String(message.name || 'Guest').trim().slice(0, 30) || 'Guest';

                broadcast(room, {
                    type: 'chat',
                    name,
                    text,
                    isHost: room.owner === socket.uuid,
                    self: false
                }, socket.uuid);
                send(socket, { type: 'chat', name, text, isHost: room.owner === socket.uuid, self: true });
                break;
            }
        }
    });

    socket.on('close', () => {
        const room = rooms.get(socket.room);
        if (!room) return;

        if (room.owner === socket.uuid) {
            broadcast(room, { type: 'host-left' }, socket.uuid);
            rooms.delete(socket.room);
        } else {
            room.clients.delete(socket.uuid);
            sendViewerCount(room);
        }
    });
});

server.listen(config.http.port, config.http.host, () => {
    console.log(`\nWisdom Stream is running:`);
    console.log(`  On this computer:  http://localhost:${config.http.port}`);
    for (const url of getLanUrls()) {
        console.log(`  On the same Wi-Fi: ${url}`);
    }
    console.log('');
});

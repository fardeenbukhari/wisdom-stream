import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import config from '../config.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const views_path = path.join(__dirname, 'views');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('views', views_path);
app.set('view engine', 'ejs');

const rooms = new Map();

// Function to extract title from a given URL
function extractTitle(url) {
    // Remove the common prefix
    url = url.replace('https://www.mxplayer.in/movie/watch', '');

    // Remove everything from "online" onward
    url = url.replace(/online.*$/, '');

    // Replace hyphens with spaces and capitalize the words
    const title = url.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    return title;
}

// Function to get URLs for a specific page
async function getUrlsForPage(pageNumber) {
    // Example URL with page parameter
    const url = `https://www.mxplayer.in/movie-videos/hindi-movies?page=${pageNumber}`;

    try {
        // Make a GET request using axios
        const response = await axios.get(url);

        // Extracted HTML content
        const html = response.data;

        // Define the regex pattern to match URLs
        const urlPattern = /,"url":"(https:\/\/www\.mxplayer\.in\/movie\/[^"]+)","name"/;

        // Perform the regex match for URLs
        const urlMatches = html.match(new RegExp(urlPattern, 'g'));

        if (urlMatches) {
            // Extracted URLs
            return urlMatches.map(match => match.match(urlPattern)[1]);
        } else {
            return [];
        }
    } catch (error) {
        console.error('Axios error:', error.message);
        return [];
    }
};

//urls for each user
const global_urls = {};

// Serve HTML and handle requests
app.get('/', async (req, res) => {
    // Get the current page number from the query string, default to 1 if not set
    const pageNumber = parseInt(req.query.page) || 1;

    let indexes = [];
    let final_urls = [];

    if (global_urls[pageNumber]) {
        global_urls[pageNumber].forEach((url, i) => {
            indexes.push({
                title: url.title,
                url: i
            });
        });
        return res.render('home', {
            urls: indexes,
            pageNumber,
        });
    } else {
        let urls = await getUrlsForPage(pageNumber);
        // Get URLs for the current page

        for (const url of urls) {
            const title = extractTitle(url);
            final_urls.push({
                url: url,
                title: title
            });
        };

        global_urls[pageNumber] = {};
        global_urls[pageNumber] = final_urls;
    }

    global_urls[pageNumber].forEach((url, i) => {
        indexes.push({
            title: url.title,
            url: i
        });
    });


    // Render HTML
    res.render('home', {
        urls: indexes,
        pageNumber,
    });
});

app.get('/watch', async (req, res) => {

    try {
        if (req.query.room) {
            // Render HTML
            const current_room = rooms.get(req.query.room);

            return res.render('video', {
                contentUrl: current_room.movie_url
            });
        }
        // URL of the page to scrape
        const url_index = req.query.u;
        const pageNumber = req.query.p;

        const final_url_obj = global_urls[pageNumber][url_index];

        // Make a GET request using axios
        const response = await axios.get(final_url_obj.url);

        // Extracted HTML content
        const html = response.data;

        // Use regular expressions to extract the contentUrl value
        const pattern = /"contentUrl":"(https:\/\/[^"]+)"/;
        const matches = html.match(pattern);

        // Check if the contentUrl is found
        if (matches && matches[1]) {
            const contentUrl = matches[1];

            // Render HTML
            res.render('video', {
                contentUrl
            });
        } else {
            res.send('Content URL not found.');
        }
    } catch (error) {
        console.error('Axios error:', error);
        res.send('Error fetching content.');
    }
});


// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, '../index.html'));
// });

const server = http.createServer(app);

const WSS = new WebSocketServer({ server: server });


/*
message format : JSON data;

{
    type : '',
    payload : '',
}

*/

WSS.on('connection', (socket) => {
    socket.uuid = crypto.randomUUID();


    socket.on('message', (msg) => {
        try {
            const message = JSON.parse(msg);
            switch (message.type) {
                case 'host': {
                    const random_room_name = 'wisdom_' + (Math.random()).toString().split('.')[1];
                    const clients = {};

                    clients[socket.uuid] = socket;

                    rooms.set(random_room_name, {
                        owner: socket.uuid,
                        clients: clients,
                        movie_url: message.room.movie_url
                    });

                    const constructed_url = 'https://127.0.0.1:9090/watch?room=' + random_room_name;

                    socket.room = random_room_name;
                    Object.values((rooms.get(socket.room)).clients).forEach(client => {
                        client.send(JSON.stringify({
                            type: 'connection',
                            clients: {
                                length: Object.keys((rooms.get(socket.room)).clients).length
                            }
                        }));
                    });

                    socket.send(JSON.stringify({
                        type: 'url',
                        room: {
                            url: constructed_url
                        }
                    }));
                    break;
                };
                case 'join': {
                    if (!rooms.has(message.room.name)) {
                        socket.send(JSON.stringify({
                            type: 'error',
                            message: 'room does not exist!'
                        }));
                        break;
                    };
                    let old_room_data = rooms.get(message.room.name);
                    socket.room = message.room.name;

                    old_room_data.clients[socket.uuid] = socket;

                    Object.values((rooms.get(socket.room)).clients).forEach(client => {
                        client.send(JSON.stringify({
                            type: 'connection',
                            clients: {
                                length: Object.keys((rooms.get(socket.room)).clients).length
                            }
                        }));
                    });

                    rooms.set(message.room.name, old_room_data);

                    break;
                };
                case 'controls': {
                    if (!rooms.has(socket.room)) {
                        socket.send(JSON.stringify({
                            type: 'error',
                            message: 'room does not exist!'
                        }));
                        break;
                    };

                    const current_room = rooms.get(socket.room);

                    const room_clients = (rooms.get(socket.room)).clients;

                    Object.values(room_clients).forEach(client => {
                        if (current_room.owner === socket.uuid && client.uuid !== socket.uuid) {
                            client.send(JSON.stringify(message));
                        }
                    });

                    break;
                }
            }
        }
        catch (err) {
            //invalid json
            console.log('an error occured with client message', err);
        };
    });

    socket.on('close', () => {
        try {
            if (socket.room) {
                const room_data = rooms.get(socket.room);
                if (room_data.owner === socket.uuid) {
                    rooms.delete(socket.room);
                } else if (room_data.clients[socket.uuid]) {
                    delete room_data.clients[socket.uuid];
                }
                Object.values((rooms.get(socket.room)).clients).forEach(client => {
                    if (socket.uuid !== client.uuid) {
                        client.send(JSON.stringify({
                            type: 'connection',
                            clients: {
                                length: Object.keys((rooms.get(socket.room)).clients).length
                            }
                        }));
                    }
                });
            };
        } catch (error) {
            console.log('AN ERROR occured when a client closed connection!', error);
        };
    });
});

server.listen(9090, () => {
    console.log('[LISTENING] HTTP and WEBSOCKET ON ', config.http, config.gateway);
});
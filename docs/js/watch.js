// Wisdom Stream - GitHub Pages version.
// No server: browsers connect directly to each other with WebRTC (PeerJS).
// The host's browser is the "server" of the room: it relays sync and chat to every guest.
(() => {
    const $ = (selector) => document.querySelector(selector);
    const params = new URLSearchParams(location.search);

    const ROOM_PREFIX = 'wisdomstream-v1-';
    const roomCode = (params.get('room') || '').trim().toUpperCase();
    const isGuest = Boolean(roomCode);

    // Optional overrides (used for local testing with your own PeerJS server)
    const peerOptions = { debug: 1 };
    if (params.get('peerhost')) {
        peerOptions.host = params.get('peerhost');
        peerOptions.port = Number(params.get('peerport')) || 9000;
        peerOptions.path = params.get('peerpath') || '/';
        peerOptions.secure = params.get('peersecure') === '1';
    }

    /* ------------------------------ helpers ------------------------------ */

    let toastTimer;
    function toast(text) {
        const el = $('#toast');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
    }

    function setStatus(state, text) {
        $('#connStatus').className = 'status-dot ' + state;
        $('#connText').textContent = text;
    }

    function getSavedName() {
        try { return localStorage.getItem('ws_name') || ''; } catch { return ''; }
    }
    function saveName(name) {
        try { localStorage.setItem('ws_name', name); } catch { /* storage unavailable */ }
    }

    function makeRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        return Array.from(bytes, (b) => chars[b % chars.length]).join('');
    }

    function mimeTypeFor(src) {
        if (/\.m3u8(\?|#|$)/i.test(src)) return 'application/x-mpegURL';
        if (/\.webm(\?|#|$)/i.test(src)) return 'video/webm';
        return 'video/mp4';
    }

    function isHttpsUrl(value) {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' || (url.protocol === 'http:' && location.protocol === 'http:');
        } catch {
            return false;
        }
    }

    function setTitle(title) {
        $('#videoTitle').textContent = title;
        document.title = title + ' - Wisdom Stream';
    }

    /* ------------------------------- player ------------------------------ */

    const player = videojs('video-content', { fluid: true, playbackRates: [0.5, 1, 1.25, 1.5, 2] });
    window.player = player;

    let video = null; // { src, title }

    function loadVideo(v) {
        video = v;
        setTitle(v.title);
        player.src({ src: v.src, type: mimeTypeFor(v.src) });
    }

    player.on('error', () => {
        const err = player.error();
        toast('Could not load this video' + (err && err.message ? ': ' + err.message : '') + '. Try another one.');
    });

    if (!isGuest) {
        if (params.get('v')) {
            const found = (window.WS_CATALOG || []).find((item) => item.id === params.get('v'));
            if (found) loadVideo({ src: found.src, title: found.title });
        } else if (params.get('url') && isHttpsUrl(params.get('url'))) {
            loadVideo({ src: params.get('url'), title: 'Custom video' });
        }
        if (!video) {
            setTitle('Video not found');
            $('#hostPanel').innerHTML = '<div class="card-body">This link has no valid video. <a href="./" class="text-info">Pick a movie</a>, or paste a direct https:// .mp4 / .m3u8 link on the home page.</div>';
        }
    } else {
        document.body.classList.add('guest');
        setTitle('Watch party ' + roomCode);
        $('#hostPanel').style.display = 'none';
        $('#guestNote').style.display = '';
        $('#joinOverlay').style.display = '';
        $('#overlayRoom').textContent = roomCode;
        $('#guestName').value = getSavedName();
        setStatus('', 'Not connected');
    }

    /* -------------------------------- chat ------------------------------- */

    let myName = getSavedName() || (isGuest ? 'Guest-' + Math.floor(Math.random() * 1000) : 'Host');
    let chatEnabled = false;

    function enableChat(enabled) {
        chatEnabled = enabled;
        $('#chatInput').disabled = !enabled;
        $('#chatSend').disabled = !enabled;
        const empty = $('.chat-empty');
        if (enabled && empty) empty.remove();
    }

    function addChatLine(element) {
        const box = $('#chatMessages');
        box.appendChild(element);
        box.scrollTop = box.scrollHeight;
    }

    function addSystemMessage(text) {
        const line = document.createElement('div');
        line.className = 'chat-system';
        line.textContent = text;
        addChatLine(line);
    }

    function addChatMessage(msg, self) {
        const line = document.createElement('div');
        line.className = 'chat-line' + (self ? ' self' : '');
        const name = document.createElement('span');
        name.className = 'chat-name' + (msg.isHost ? ' host' : '');
        name.textContent = msg.name + (msg.isHost ? ' (host)' : '');
        const text = document.createElement('span');
        text.className = 'chat-text';
        text.textContent = msg.text;
        line.append(name, text);
        addChatLine(line);
    }

    function cleanChat(name, text) {
        return {
            name: String(name || 'Guest').trim().slice(0, 30) || 'Guest',
            text: String(text || '').trim().slice(0, 500)
        };
    }

    $('#chatForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = $('#chatInput');
        const { name, text } = cleanChat(myName, input.value);
        if (!text || !chatEnabled) return;
        input.value = '';
        if (isGuest) guestSend({ type: 'chat', name, text });
        else hostChat(name, text, null);
    });

    /* -------------------------------- host ------------------------------- */

    let peer = null;
    const guests = new Map(); // peerId -> { conn, name }

    function hostState() {
        return { currentTime: player.currentTime(), paused: player.paused() };
    }

    function broadcast(message, exceptPeerId = null) {
        for (const [peerId, guest] of guests) {
            if (peerId !== exceptPeerId && guest.conn.open) guest.conn.send(message);
        }
    }

    function updateCount() {
        const count = guests.size + 1;
        $('.clients_length').textContent = count;
        broadcast({ type: 'count', count });
    }

    function sendControl(control) {
        if (!peer || isGuest) return;
        broadcast({ type: 'controls', control, ...hostState() });
    }

    function hostChat(name, text, fromPeerId) {
        const isHostMessage = fromPeerId === null;
        const message = { type: 'chat', name, text, isHost: isHostMessage };
        addChatMessage(message, isHostMessage);
        for (const [peerId, guest] of guests) {
            if (guest.conn.open) guest.conn.send({ ...message, self: peerId === fromPeerId });
        }
    }

    function startHosting(attempt = 0) {
        const code = makeRoomCode();
        setStatus('', 'Starting party...');
        peer = new Peer(ROOM_PREFIX + code, peerOptions);

        peer.on('open', () => {
            setStatus('online', 'Party live');
            const link = location.origin + location.pathname + '?room=' + code;
            $('#hostIntro').style.display = 'none';
            $('#roomInfo').style.display = '';
            $('#roomUrl').value = link;
            $('#roomCode').textContent = code;
            enableChat(true);
            addSystemMessage('Watch party started. Share the link!');
        });

        peer.on('connection', (conn) => {
            conn.on('open', () => {
                const name = cleanChat(conn.metadata && conn.metadata.name, 'x').name;
                guests.set(conn.peer, { conn, name });
                conn.send({ type: 'welcome', video, state: hostState(), count: guests.size + 1 });
                updateCount();
                addSystemMessage(name + ' joined the party.');
            });
            conn.on('data', (data) => {
                if (data && data.type === 'sync-request') {
                    conn.send({ type: 'controls', control: 'join-sync', ...hostState() });
                    return;
                }
                if (!data || data.type !== 'chat') return;
                const { name, text } = cleanChat(data.name, data.text);
                if (text) hostChat(name, text, conn.peer);
            });
            const onLeave = () => {
                const guest = guests.get(conn.peer);
                if (!guest) return;
                guests.delete(conn.peer);
                updateCount();
                addSystemMessage(guest.name + ' left the party.');
            };
            conn.on('close', onLeave);
            conn.on('error', onLeave);
        });

        peer.on('disconnected', () => {
            // Lost the signalling server; existing guests stay connected, but new ones can't join
            setStatus('', 'Reconnecting...');
            setTimeout(() => { if (peer && !peer.destroyed) peer.reconnect(); }, 1500);
        });

        peer.on('error', (err) => {
            if (err.type === 'unavailable-id' && attempt < 3) {
                peer.destroy();
                startHosting(attempt + 1);
                return;
            }
            if (err.type === 'peer-unavailable') return;
            console.error(err);
            setStatus('offline', 'Connection problem');
            toast('Could not start the party (' + err.type + '). Check your internet and try again.');
            $('#create-room').disabled = false;
            $('#create-room').textContent = 'Start watch party';
        });
    }

    if (!isGuest && video) {
        $('#create-room').addEventListener('click', () => {
            $('#create-room').disabled = true;
            $('#create-room').textContent = 'Starting...';
            startHosting();
        });

        player.on('play', () => sendControl('resume'));
        player.on('pause', () => sendControl('pause'));
        player.on('seeked', () => sendControl('timestamp'));
        player.on('ratechange', () => broadcast({ type: 'rate', rate: player.playbackRate() }));
        // Heartbeat keeps everyone within ~1 second of the host
        setInterval(() => sendControl('sync'), 3000);

        $('#copyBtn').addEventListener('click', async () => {
            const input = $('#roomUrl');
            try {
                await navigator.clipboard.writeText(input.value);
            } catch {
                input.select();
                document.execCommand('copy');
            }
            toast('Link copied!');
        });

        const closeParty = () => { if (peer) peer.destroy(); };
        window.addEventListener('beforeunload', closeParty);
        window.addEventListener('pagehide', closeParty);
    }

    /* -------------------------------- guest ------------------------------ */

    let hostConn = null;
    let joined = false;

    function guestSend(message) {
        if (hostConn && hostConn.open) hostConn.send(message);
    }

    function showJoinError(text) {
        $('#joinOverlay').style.display = '';
        $('#joinBtn').disabled = false;
        $('#joinBtn').textContent = 'Try again';
        $('#joinError').textContent = text;
        setStatus('offline', 'Not connected');
    }

    function applyState(currentTime, paused, tolerance) {
        const run = () => {
            if (Math.abs(player.currentTime() - currentTime) > tolerance) {
                player.currentTime(currentTime);
            }
            if (paused && !player.paused()) {
                player.pause();
            } else if (!paused && player.paused()) {
                const result = player.play();
                if (result && result.catch) result.catch(() => toast('Tap the video to start playback'));
            }
        };
        // Seeking before the video has loaded is ignored by the browser, so wait for metadata
        if (player.readyState() < 1) player.one('loadedmetadata', run);
        else run();
    }

    let lastHostMessage = 0;

    function partyEnded(text) {
        if (!joined) return;
        joined = false;
        enableChat(false);
        player.pause();
        setStatus('offline', 'Party ended');
        addSystemMessage(text);
        toast(text);
    }

    // The host sends a sync every 3 seconds; silence for 12 seconds means the host is gone
    setInterval(() => {
        if (joined && Date.now() - lastHostMessage > 12000) {
            partyEnded('Lost connection to the host. The party may have ended.');
        }
    }, 2000);

    function handleHostMessage(msg) {
        lastHostMessage = Date.now();
        switch (msg.type) {
            case 'welcome':
                joined = true;
                clearTimeout(joinTimer);
                $('#joinOverlay').style.display = 'none';
                setStatus('online', 'Connected');
                enableChat(true);
                addSystemMessage('You joined the watch party.');
                if (msg.video) {
                    loadVideo(msg.video);
                    applyState(msg.state.currentTime, msg.state.paused, 0.5);
                    // Loading takes a moment, so ask for the host's exact position once ready
                    player.one('canplay', () => guestSend({ type: 'sync-request' }));
                }
                $('.clients_length').textContent = msg.count;
                break;
            case 'controls': {
                const tolerance = msg.control === 'sync' ? 1.5 : msg.control === 'resume' ? 0.5 : 0.3;
                applyState(msg.currentTime, msg.paused, tolerance);
                break;
            }
            case 'rate':
                player.playbackRate(msg.rate);
                break;
            case 'count':
                $('.clients_length').textContent = msg.count;
                break;
            case 'chat':
                addChatMessage(msg, Boolean(msg.self));
                break;
        }
    }

    let joinTimer;

    function joinParty() {
        const name = $('#guestName').value.trim();
        if (name) {
            myName = name;
            saveName(name);
        }
        $('#joinBtn').disabled = true;
        $('#joinBtn').textContent = 'Connecting...';
        $('#joinError').textContent = '';
        setStatus('', 'Connecting...');

        // A user click also unlocks autoplay for later play() calls from the host
        if (peer) peer.destroy();
        peer = new Peer(peerOptions);

        joinTimer = setTimeout(() => {
            if (!joined) showJoinError('Could not reach the room. Check the code and make sure the host still has the party tab open.');
        }, 15000);

        peer.on('open', () => {
            hostConn = peer.connect(ROOM_PREFIX + roomCode, { reliable: true, metadata: { name: myName } });
            hostConn.on('data', handleHostMessage);
            hostConn.on('close', () => partyEnded('The host ended the watch party.'));
        });

        peer.on('error', (err) => {
            clearTimeout(joinTimer);
            if (err.type === 'peer-unavailable') {
                showJoinError('Room ' + roomCode + ' was not found. The party may have ended, or the code is wrong.');
            } else {
                console.error(err);
                showJoinError('Connection problem (' + err.type + '). Check your internet and try again.');
            }
        });
    }

    if (isGuest) {
        $('#joinBtn').addEventListener('click', joinParty);
        $('#guestName').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinParty(); });
        window.addEventListener('beforeunload', () => { if (peer) peer.destroy(); });
    }
})();

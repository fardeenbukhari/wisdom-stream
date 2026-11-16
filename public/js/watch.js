(() => {
    const data = window.PAGE_DATA;
    const isGuest = Boolean(data.room);
    const $ = (selector) => document.querySelector(selector);

    /* ------------------------------ helpers ------------------------------ */

    let toastTimer;
    function toast(text) {
        const el = $('#toast');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
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

    /* ------------------------------- player ------------------------------ */

    const player = videojs('video-content', { fluid: true, playbackRates: [0.5, 1, 1.25, 1.5, 2] });
    player.src({ src: data.src, type: data.type });
    window.player = player;

    player.on('error', () => {
        const err = player.error();
        toast('Could not load this video' + (err && err.message ? ': ' + err.message : '') + '. Try another one.');
    });

    if (isGuest) {
        document.body.classList.add('guest');
        $('#hostPanel').style.display = 'none';
        $('#guestNote').style.display = '';
        $('#joinOverlay').style.display = '';
        $('#guestName').value = getSavedName();
    }

    /* ----------------------------- websocket ----------------------------- */

    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    const pending = [];
    let inRoom = false;
    let myName = getSavedName() || (isGuest ? 'Guest-' + Math.floor(Math.random() * 1000) : 'Host');

    function wsSend(message) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        else pending.push(message);
    }

    ws.onopen = () => {
        setStatus('online', 'Connected');
        while (pending.length) ws.send(JSON.stringify(pending.shift()));
    };
    ws.onclose = () => {
        setStatus('offline', 'Disconnected - refresh the page');
        enableChat(false);
    };

    /* -------------------------------- host ------------------------------- */

    function sendControl(control) {
        if (!inRoom || isGuest) return;
        wsSend({
            type: 'controls',
            control,
            currentTime: player.currentTime(),
            paused: player.paused()
        });
    }

    if (!isGuest) {
        $('#create-room').addEventListener('click', () => {
            $('#create-room').disabled = true;
            $('#create-room').textContent = 'Creating...';
            wsSend({ type: 'host', room: { src: data.src, title: data.title } });
        });

        player.on('play', () => sendControl('resume'));
        player.on('pause', () => sendControl('pause'));
        player.on('seeked', () => sendControl('timestamp'));
        player.on('ratechange', () => sendControl('sync'));
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
    }

    function showRoom(room) {
        inRoom = true;
        const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
        const origin = isLocalhost && room.lanUrls.length ? room.lanUrls[0] : location.origin;

        $('#hostIntro').style.display = 'none';
        $('#roomInfo').style.display = '';
        $('#roomUrl').value = origin + '/watch?room=' + encodeURIComponent(room.name);
        $('#roomCode').textContent = room.name;
        enableChat(true);
        addSystemMessage('Watch party started. Share the link!');
        sendControl('sync');
    }

    /* -------------------------------- guest ------------------------------ */

    function joinParty() {
        const name = $('#guestName').value.trim();
        if (name) {
            myName = name;
            saveName(name);
        }
        $('#joinOverlay').style.display = 'none';
        wsSend({ type: 'join', room: { name: data.room } });
    }

    if (isGuest) {
        $('#joinBtn').addEventListener('click', joinParty);
        $('#guestName').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinParty(); });
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
                if (result && result.catch) {
                    result.catch(() => toast('Tap the video to start playback'));
                }
            }
        };
        // Seeking before the video has loaded is ignored by the browser, so wait for metadata
        if (player.readyState() < 1) player.one('loadedmetadata', run);
        else run();
    }

    function handleControls(msg) {
        if (!isGuest) return;
        switch (msg.control) {
            case 'pause':
                applyState(msg.currentTime, true, 0.3);
                break;
            case 'resume':
                applyState(msg.currentTime, false, 0.5);
                break;
            case 'timestamp':
                applyState(msg.currentTime, msg.paused, 0.3);
                break;
            case 'sync':
            default:
                applyState(msg.currentTime, msg.paused, 1.5);
        }
    }

    /* -------------------------------- chat ------------------------------- */

    function enableChat(enabled) {
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

    function addChatMessage(msg) {
        const line = document.createElement('div');
        line.className = 'chat-line' + (msg.self ? ' self' : '');
        const name = document.createElement('span');
        name.className = 'chat-name' + (msg.isHost ? ' host' : '');
        name.textContent = msg.name + (msg.isHost ? ' (host)' : '');
        const text = document.createElement('span');
        text.className = 'chat-text';
        text.textContent = msg.text;
        line.append(name, text);
        addChatLine(line);
    }

    $('#chatForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = $('#chatInput');
        const text = input.value.trim();
        if (!text || !inRoom) return;
        wsSend({ type: 'chat', name: myName, text });
        input.value = '';
    });

    /* ---------------------------- server messages ------------------------ */

    let lastCount = 0;

    ws.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return;
        }

        switch (msg.type) {
            case 'room':
                showRoom(msg.room);
                break;
            case 'connection': {
                const count = msg.clients.length;
                $('.clients_length').textContent = count;
                if (isGuest && !inRoom) {
                    inRoom = true;
                    enableChat(true);
                    addSystemMessage('You joined the watch party.');
                } else if (lastCount && count > lastCount) {
                    addSystemMessage('Someone joined the party.');
                } else if (lastCount && count < lastCount) {
                    addSystemMessage('Someone left the party.');
                }
                lastCount = count;
                break;
            }
            case 'controls':
                handleControls(msg);
                break;
            case 'chat':
                addChatMessage(msg);
                break;
            case 'host-left':
                inRoom = false;
                enableChat(false);
                player.pause();
                addSystemMessage('The host ended the watch party.');
                toast('The host ended the watch party');
                break;
            case 'error':
                toast(msg.message);
                addSystemMessage(msg.message);
                break;
        }
    };
})();

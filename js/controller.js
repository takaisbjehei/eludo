// Mobile Companion Controller Logic for eLudo with Live Auto-Discovery Lobby

class ControllerClient {
    constructor() {
        this.roomCode = null;
        this.peer = null;
        this.conn = null;
        this.channel = null;
        this.lobbyChannel = null;
        this.mqttClient = null;
        this.activeForcedValue = null;
        this.targetColor = 'any';
        this.isStealthDisguise = false;
        this.discoveredMatches = new Map();

        this.initDOM();
        this.initLobbyDiscovery();
        this.parseURLRoomCode();
    }

    initDOM() {
        this.matchesList = document.getElementById('matches-list');
        this.btnScanMatches = document.getElementById('btn-scan-matches');
        this.manualToggleBtn = document.getElementById('manual-toggle-btn');
        this.connectCard = document.getElementById('connect-card');
        this.inputRoomCode = document.getElementById('input-room-code');
        this.btnConnect = document.getElementById('btn-connect');
        this.connText = document.getElementById('conn-text');
        this.statusDot = document.querySelector('.status-dot');
        this.ctrlTurnOwner = document.getElementById('ctrl-turn-owner');
        this.ctrlLastRoll = document.getElementById('ctrl-last-roll');
        this.ctrlModeTag = document.getElementById('ctrl-mode-tag');
        this.livePawnSummary = document.getElementById('live-pawn-summary');
        this.miniPawnsLayer = document.getElementById('mini-pawns-layer');
        this.activeModeLabel = document.getElementById('active-mode-label');
        this.btnRollRemote = document.getElementById('btn-roll-remote');
        this.btnClearForce = document.getElementById('btn-clear-force');
        this.toggleAutoSix = document.getElementById('toggle-auto-six');
        this.btnStealthToggle = document.getElementById('btn-stealth-toggle');
        this.ctrlHeaderBar = document.getElementById('ctrl-header-bar');
        this.remoteMain = document.getElementById('remote-main');
        this.disguiseView = document.getElementById('disguise-view');
        this.footerRoomCode = document.getElementById('footer-room-code');
        this.footerTarget = document.getElementById('footer-target');
        this.calcDisplay = document.getElementById('calc-display');

        // Bind events
        this.btnConnect.addEventListener('click', () => {
            const val = this.inputRoomCode.value.trim();
            if (val) this.connectToRoom(val);
        });

        this.inputRoomCode.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = this.inputRoomCode.value.trim();
                if (val) this.connectToRoom(val);
            }
        });

        this.btnScanMatches.addEventListener('click', () => {
            this.scanForMatches();
        });

        this.manualToggleBtn.addEventListener('click', () => {
            this.connectCard.classList.toggle('hidden');
        });

        // 5-Tap Gesture on Header Bar
        let headerTapCount = 0;
        let headerTapTimer = null;
        this.ctrlHeaderBar.addEventListener('click', () => {
            headerTapCount++;
            clearTimeout(headerTapTimer);
            headerTapTimer = setTimeout(() => { headerTapCount = 0; }, 2200);

            if (headerTapCount >= 5) {
                headerTapCount = 0;
                this.toggleStealthMode();
            }
        });

        // Color Target buttons
        document.querySelectorAll('.target-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('target-locked')) return;
                document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.targetColor = btn.getAttribute('data-color');
                this.footerTarget.textContent = this.targetColor.toUpperCase();
                this.updateModeLabel();
                this.sendForcePayload();
            });
        });

        // Number buttons (1-6)
        document.querySelectorAll('.num-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = parseInt(btn.getAttribute('data-val'), 10);
                this.setForcedDice(val);
            });
        });

        // Clear button
        this.btnClearForce.addEventListener('click', () => {
            this.setForcedDice(null);
        });

        // Roll Remote button
        this.btnRollRemote.addEventListener('click', () => {
            this.triggerRemoteRoll();
        });

        // Auto Six switch
        this.toggleAutoSix.addEventListener('change', (e) => {
            this.sendMessage({
                type: 'TOGGLE_AUTO_SIX',
                enabled: e.target.checked,
                targetColor: this.targetColor
            });
        });

        // Stealth Disguise toggle
        this.btnStealthToggle.addEventListener('click', () => {
            this.toggleStealthMode();
        });

        // Calculator buttons
        document.querySelectorAll('.calc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.handleCalcInput(btn.getAttribute('data-calc'));
            });
        });
    }

    initLobbyDiscovery() {
        if (typeof mqtt !== 'undefined') {
            try {
                this.mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
                    clientId: 'eludo_discovery_' + Math.random().toString(16).substr(2, 8),
                    keepalive: 30
                });

                this.mqttClient.on('connect', () => {
                    this.mqttClient.subscribe('eludo/lobby/presence', { qos: 1 });
                    this.scanForMatches();
                });

                this.mqttClient.on('message', (topic, message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        if (topic === 'eludo/lobby/presence' && data.type === 'MATCH_PRESENCE') {
                            this.handleDiscoveredMatch(data);
                        } else if (data.type === 'STATE_UPDATE' || data.type === 'CONFIRM_FORCE') {
                            this.handleIncomingMessage(data);
                        }
                    } catch (e) {
                        console.warn(e);
                    }
                });
            } catch (e) {
                console.warn('MQTT init:', e);
            }
        }

        if ('BroadcastChannel' in window) {
            this.lobbyChannel = new BroadcastChannel('eludo_lobby_discovery');
            this.lobbyChannel.onmessage = (event) => {
                if (event.data && event.data.type === 'MATCH_PRESENCE') {
                    this.handleDiscoveredMatch(event.data);
                }
            };
            this.scanForMatches();
        }
    }

    scanForMatches() {
        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish('eludo/lobby/ping', JSON.stringify({ type: 'PING_LOBBY' }), { qos: 1 });
        }
        if (this.lobbyChannel) {
            this.lobbyChannel.postMessage({ type: 'PING_LOBBY' });
        }
    }

    handleDiscoveredMatch(match) {
        if (!match || !match.roomCode) return;

        this.discoveredMatches.set(match.roomCode, {
            ...match,
            lastSeen: Date.now()
        });

        this.renderMatchesList();
    }

    renderMatchesList() {
        const now = Date.now();
        const activeList = Array.from(this.discoveredMatches.values()).filter(m => now - m.lastSeen < 12000);

        if (activeList.length === 0) {
            this.matchesList.innerHTML = `
                <div class="scanning-placeholder">
                    <span class="spin-icon">📡</span> Scanning for active games...
                </div>
            `;
            return;
        }

        this.matchesList.innerHTML = '';
        activeList.forEach(m => {
            const card = document.createElement('div');
            card.className = 'match-item-card';
            card.innerHTML = `
                <div class="match-info-group">
                    <div class="match-room-tag">👑 Room #${m.roomCode}</div>
                    <div class="match-meta-tag">${m.playerCount} Players • Turn: <strong style="color: ${m.turnColor === 'yellow' ? '#fde047' : m.turnColor}">${m.currentTurn}</strong></div>
                </div>
                <div class="match-connect-badge">⚡ Tap to Connect</div>
            `;

            card.addEventListener('click', () => {
                this.connectToRoom(m.roomCode);
            });

            this.matchesList.appendChild(card);
        });
    }

    parseURLRoomCode() {
        const hash = window.location.hash;
        const params = new URLSearchParams(window.location.search);
        let code = params.get('room');

        if (!code && hash) {
            const match = hash.match(/room=([0-9a-zA-Z]+)/);
            if (match) code = match[1];
        }

        if (code) {
            this.inputRoomCode.value = code;
            this.connectToRoom(code);
        }
    }

    connectToRoom(code) {
        this.roomCode = code.toUpperCase();
        localStorage.setItem('eludo_client_room', this.roomCode);
        this.footerRoomCode.textContent = this.roomCode;
        this.updateStatus('yellow', `Connecting to #${this.roomCode}...`);

        // Subscribe to this room's MQTT state
        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.subscribe(`eludo/room/${this.roomCode}/state`, { qos: 1 });
            this.sendMessage({ type: 'REQUEST_STATE' });
            this.updateStatus('green', `Connected to Match #${this.roomCode}`);
        }

        // BroadcastChannel
        if ('BroadcastChannel' in window) {
            if (this.channel) this.channel.close();
            this.channel = new BroadcastChannel('eludo_remote_' + this.roomCode);
            this.channel.onmessage = (event) => this.handleIncomingMessage(event.data);
            this.channel.postMessage({ type: 'REQUEST_STATE' });
        }

        // WebRTC (PeerJS)
        if (typeof Peer !== 'undefined') {
            try {
                if (this.peer) this.peer.destroy();
                this.peer = new Peer({
                    debug: 1,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:global.stun.twilio.com:3478' }
                        ]
                    }
                });

                this.peer.on('open', () => {
                    const hostPeerId = 'eludo-host-' + this.roomCode;
                    this.conn = this.peer.connect(hostPeerId, { reliable: true });

                    this.conn.on('open', () => {
                        this.updateStatus('green', `Connected to Match #${this.roomCode}`);
                        this.sendMessage({ type: 'REQUEST_STATE' });
                    });

                    this.conn.on('data', (data) => {
                        this.handleIncomingMessage(data);
                    });
                });
            } catch (e) {
                console.warn(e);
            }
        }
    }

    updateStatus(dotClass, text) {
        this.statusDot.className = 'status-dot dot-' + dotClass;
        this.connText.textContent = text;
    }

    sendMessage(payload) {
        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish(`eludo/room/${this.roomCode}/host`, JSON.stringify(payload), { qos: 1 });
        }
        if (this.channel) {
            this.channel.postMessage(payload);
        }
        if (this.conn && this.conn.open) {
            this.conn.send(payload);
        }
    }

    setForcedDice(val) {
        this.activeForcedValue = val;

        document.querySelectorAll('.num-btn').forEach(btn => {
            const btnVal = parseInt(btn.getAttribute('data-val'), 10);
            if (btnVal === val) {
                btn.classList.add('active-forced');
            } else {
                btn.classList.remove('active-forced');
            }
        });

        this.updateModeLabel();
        this.sendForcePayload();
    }

    updateModeLabel() {
        const targetStr = this.targetColor === 'any' ? 'Any Player' : this.targetColor.toUpperCase();
        if (this.activeForcedValue === null) {
            this.activeModeLabel.textContent = `🎲 Fair Random (${targetStr})`;
            this.activeModeLabel.style.color = '#38bdf8';
        } else {
            this.activeModeLabel.textContent = `🎯 Forced [ ${this.activeForcedValue} ] for ${targetStr}`;
            this.activeModeLabel.style.color = '#4ade80';
        }
    }

    sendForcePayload() {
        this.sendMessage({
            type: 'FORCE_DICE',
            value: this.activeForcedValue,
            targetColor: this.targetColor
        });
    }

    triggerRemoteRoll() {
        this.sendMessage({
            type: 'TRIGGER_ROLL',
            value: this.activeForcedValue,
            targetColor: this.targetColor
        });
    }

    handleIncomingMessage(data) {
        if (!data || typeof data !== 'object') return;

        if (data.type === 'STATE_UPDATE' && data.state) {
            const s = data.state;
            
            if (s.currentPlayer) {
                this.ctrlTurnOwner.textContent = `${s.currentPlayer.name}'s Turn`;
                this.ctrlTurnOwner.style.color = s.currentPlayer.color === 'yellow' ? '#facc15' : (s.currentPlayer.color === 'blue' ? '#38bdf8' : (s.currentPlayer.color === 'green' ? '#4ade80' : '#f87171'));
            }
            if (s.diceValue) {
                this.ctrlLastRoll.textContent = s.diceValue;
            }

            if (s.playerCount) {
                this.ctrlModeTag.textContent = `${s.playerCount} Players`;
            }

            const activeColors = s.players ? s.players.map(p => p.color) : ['red', 'yellow'];
            const btnGreen = document.getElementById('target-btn-green');
            const btnBlue = document.getElementById('target-btn-blue');
            const myGreen = document.getElementById('my-green');
            const myBlue = document.getElementById('my-blue');

            if (!activeColors.includes('green')) {
                btnGreen.classList.add('target-locked');
                if (myGreen) myGreen.classList.add('yard-inactive');
                if (this.targetColor === 'green') this.resetTargetToAny();
            } else {
                btnGreen.classList.remove('target-locked');
                if (myGreen) myGreen.classList.remove('yard-inactive');
            }

            if (!activeColors.includes('blue')) {
                btnBlue.classList.add('target-locked');
                if (myBlue) myBlue.classList.add('yard-inactive');
                if (this.targetColor === 'blue') this.resetTargetToAny();
            } else {
                btnBlue.classList.remove('target-locked');
                if (myBlue) myBlue.classList.remove('yard-inactive');
            }

            // Render live pawns status summary
            if (s.players && this.livePawnSummary) {
                this.livePawnSummary.innerHTML = '';
                s.players.forEach(p => {
                    const yardCount = p.pawns.filter(pw => pw.state === 'yard').length;
                    const homeCount = p.pawns.filter(pw => pw.state === 'home').length;

                    const pill = document.createElement('div');
                    pill.className = 'pawn-stat-pill';
                    const colHex = p.color === 'yellow' ? '#fde047' : (p.color === 'blue' ? '#60a5fa' : (p.color === 'green' ? '#4ade80' : '#f87171'));
                    pill.innerHTML = `
                        <span class="pawn-stat-name" style="color: ${colHex}">${p.name}</span>
                        <span>🏠 ${yardCount} Base</span>
                        <span>👑 ${homeCount} Home</span>
                    `;
                    this.livePawnSummary.appendChild(pill);
                });
            }

            // Render Live Mini-Board
            if (s.players && this.miniPawnsLayer) {
                this.renderMiniBoard(s.players);
            }
        }

        if (data.type === 'CONFIRM_FORCE') {
            if (data.value === null && this.activeForcedValue !== null) {
                this.setForcedDice(null);
            }
        }
    }

    renderMiniBoard(players) {
        this.miniPawnsLayer.innerHTML = '';

        const yardBases = {
            red: { x: 20, y: 20 },
            green: { x: 80, y: 20 },
            blue: { x: 20, y: 80 },
            yellow: { x: 80, y: 80 }
        };

        players.forEach(player => {
            player.pawns.forEach((pawn, idx) => {
                const dot = document.createElement('div');
                dot.className = `mini-pawn ${player.color}`;

                let posX = 50;
                let posY = 50;

                if (pawn.state === 'yard') {
                    const base = yardBases[player.color];
                    const offX = (idx % 2 === 0 ? -7 : 7);
                    const offY = (idx < 2 ? -7 : 7);
                    posX = base.x + offX;
                    posY = base.y + offY;
                } else if (pawn.state === 'home') {
                    posX = 50 + (player.color === 'red' ? -6 : (player.color === 'yellow' ? 6 : 0));
                    posY = 50 + (player.color === 'green' ? -6 : (player.color === 'blue' ? 6 : 0));
                } else {
                    const angle = (pawn.step / 56) * (2 * Math.PI) - Math.PI / 2;
                    const radius = pawn.state === 'homeStretch' ? 18 : 36;
                    posX = 50 + Math.cos(angle) * radius;
                    posY = 50 + Math.sin(angle) * radius;
                }

                dot.style.left = `${posX}%`;
                dot.style.top = `${posY}%`;
                this.miniPawnsLayer.appendChild(dot);
            });
        });
    }

    resetTargetToAny() {
        this.targetColor = 'any';
        document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
        const btnAny = document.getElementById('target-btn-any');
        if (btnAny) btnAny.classList.add('active');
        this.footerTarget.textContent = 'ANY';
        this.updateModeLabel();
        this.sendForcePayload();
    }

    toggleStealthMode() {
        this.isStealthDisguise = !this.isStealthDisguise;
        if (this.isStealthDisguise) {
            this.remoteMain.classList.add('hidden');
            this.disguiseView.classList.remove('hidden');
            this.btnStealthToggle.textContent = '🎮 Game Pad';
        } else {
            this.remoteMain.classList.remove('hidden');
            this.disguiseView.classList.add('hidden');
            this.btnStealthToggle.textContent = '🕶️ Stealth';
        }
    }

    handleCalcInput(val) {
        let cur = this.calcDisplay.textContent;
        if (val === 'C') {
            this.calcDisplay.textContent = '0';
            return;
        }

        if (['1', '2', '3', '4', '5', '6'].includes(val)) {
            const num = parseInt(val, 10);
            this.setForcedDice(num);
        }

        if (cur === '0' && !isNaN(val)) {
            this.calcDisplay.textContent = val;
        } else {
            this.calcDisplay.textContent = (cur + val).slice(-10);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.controllerClient = new ControllerClient();
});

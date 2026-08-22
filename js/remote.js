// Secret Remote Controller & Sync Engine for eLudo
// Works via WebRTC (PeerJS) & BroadcastChannel for local/cross-device stealth control.

class RemoteSync {
    constructor() {
        this.roomCode = this.generateRoomCode();
        this.peer = null;
        this.connections = [];
        this.channel = null;
        this.forcedDiceValue = null;
        this.autoSixForHuman = false;
        this.onDiceCommand = null;
        this.onStateRequested = null;
        this.isConnected = false;

        this.initBroadcastChannel();
        this.initKeyboardStealth();
    }

    generateRoomCode() {
        // Generate clean 4-digit code e.g. 4829
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    initBroadcastChannel() {
        if ('BroadcastChannel' in window) {
            this.channel = new BroadcastChannel('eludo_remote_' + this.roomCode);
            this.channel.onmessage = (event) => {
                this.handleIncomingMessage(event.data);
            };
        }
    }

    initPeerServer() {
        if (typeof Peer === 'undefined') {
            console.log('PeerJS library not loaded, relying on local BroadcastChannel & stealth keys.');
            return;
        }

        try {
            const peerId = 'eludo-host-' + this.roomCode;
            this.peer = new Peer(peerId, {
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            this.peer.on('open', (id) => {
                this.isConnected = true;
                console.log('Remote host active with Room ID:', this.roomCode);
            });

            this.peer.on('connection', (conn) => {
                this.connections.push(conn);
                conn.on('data', (data) => {
                    this.handleIncomingMessage(data);
                });
                conn.on('open', () => {
                    // Send initial state to newly connected controller
                    if (this.onStateRequested) {
                        conn.send({ type: 'STATE_UPDATE', state: this.onStateRequested() });
                    }
                });
                conn.on('close', () => {
                    this.connections = this.connections.filter(c => c !== conn);
                });
            });

            this.peer.on('error', (err) => {
                console.warn('PeerJS notice:', err);
            });
        } catch (e) {
            console.warn('PeerJS initialization error:', e);
        }
    }

    initKeyboardStealth() {
        // Invisible keyboard shortcuts on the host screen
        window.addEventListener('keydown', (e) => {
            // If user presses keys 1-6 on host keyboard, secretly set next dice roll
            if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
                this.forcedDiceValue = parseInt(e.key, 10);
                console.log('🤫 Stealth Roll Queued:', this.forcedDiceValue);
            } else if (e.key === '0' || e.key === 'r' || e.key === 'R') {
                this.forcedDiceValue = null;
                console.log('🎲 Pure Random Restored');
            }
        });
    }

    handleIncomingMessage(data) {
        if (!data || typeof data !== 'object') return;

        switch (data.type) {
            case 'FORCE_DICE':
                this.forcedDiceValue = data.value ? parseInt(data.value, 10) : null;
                this.broadcastToControllers({ type: 'CONFIRM_FORCE', value: this.forcedDiceValue });
                break;
            case 'TRIGGER_ROLL':
                if (data.value) {
                    this.forcedDiceValue = parseInt(data.value, 10);
                }
                if (this.onDiceCommand) {
                    this.onDiceCommand();
                }
                break;
            case 'TOGGLE_AUTO_SIX':
                this.autoSixForHuman = !!data.enabled;
                break;
            case 'REQUEST_STATE':
                if (this.onStateRequested) {
                    this.broadcastState(this.onStateRequested());
                }
                break;
        }
    }

    broadcastState(state) {
        const payload = { type: 'STATE_UPDATE', state };
        if (this.channel) {
            this.channel.postMessage(payload);
        }
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(payload);
            }
        });
    }

    broadcastToControllers(payload) {
        if (this.channel) {
            this.channel.postMessage(payload);
        }
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(payload);
            }
        });
    }

    consumeForcedDice(currentPlayer) {
        // If autoSixForHuman is on and player has pawns in yard, give a 6 with high probability
        if (this.autoSixForHuman && !currentPlayer.isBot && currentPlayer.hasPawnsInYard && Math.random() < 0.8) {
            return 6;
        }

        if (this.forcedDiceValue !== null) {
            const val = this.forcedDiceValue;
            this.forcedDiceValue = null; // Consume one-time force
            this.broadcastToControllers({ type: 'CONFIRM_FORCE', value: null });
            return val;
        }
        return null; // Return null so game rolls pure random 1..6
    }
}

window.remoteSync = new RemoteSync();

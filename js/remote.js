// Ultra-Reliable Remote Sync Engine for eLudo (WebRTC + Public MQTT Relay + BroadcastChannel + Discovery Beacon)

class RemoteSync {
    constructor() {
        this.roomCode = this.getStoredOrNewRoomCode();
        this.peer = null;
        this.connections = [];
        this.channel = null;
        this.lobbyChannel = null;
        this.mqttClient = null;
        this.forcedDiceValue = null;
        this.forcedTargetColor = 'any';
        this.autoSixEnabled = false;
        this.autoSixTargetColor = 'any';
        this.onDiceCommand = null;
        this.onStateRequested = null;
        this.isConnected = false;

        this.initBroadcastChannel();
        this.initKeyboardStealth();
        this.initMQTT();
        this.startPresenceBeacon();
    }

    getStoredOrNewRoomCode() {
        let code = localStorage.getItem('eludo_host_room');
        if (!code) {
            code = Math.floor(1000 + Math.random() * 9000).toString();
            localStorage.setItem('eludo_host_room', code);
        }
        return code;
    }

    initBroadcastChannel() {
        if ('BroadcastChannel' in window) {
            this.channel = new BroadcastChannel('eludo_remote_' + this.roomCode);
            this.channel.onmessage = (event) => {
                this.handleIncomingMessage(event.data);
            };

            this.lobbyChannel = new BroadcastChannel('eludo_lobby_discovery');
            this.lobbyChannel.onmessage = (event) => {
                if (event.data && event.data.type === 'PING_LOBBY') {
                    this.broadcastPresence();
                }
            };
        }
    }

    initMQTT() {
        if (typeof mqtt === 'undefined') return;

        try {
            this.mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
                clientId: 'eludo_host_' + this.roomCode + '_' + Math.random().toString(16).substr(2, 6),
                keepalive: 30
            });

            this.mqttClient.on('connect', () => {
                this.isConnected = true;
                this.mqttClient.subscribe(`eludo/room/${this.roomCode}/host`, { qos: 1 });
                this.mqttClient.subscribe(`eludo/lobby/ping`, { qos: 1 });
                this.broadcastPresence();
            });

            this.mqttClient.on('message', (topic, message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (topic === 'eludo/lobby/ping') {
                        this.broadcastPresence();
                    } else {
                        this.handleIncomingMessage(data);
                    }
                } catch (e) {
                    console.warn(e);
                }
            });
        } catch (e) {
            console.warn('MQTT init notice:', e);
        }
    }

    startPresenceBeacon() {
        // Broadcast presence every 4 seconds to the discovery lobby
        setInterval(() => {
            this.broadcastPresence();
        }, 4000);
    }

    broadcastPresence() {
        const state = this.onStateRequested ? this.onStateRequested() : null;
        const beacon = {
            type: 'MATCH_PRESENCE',
            roomCode: this.roomCode,
            playerCount: state ? state.playerCount : 2,
            currentTurn: state && state.currentPlayer ? state.currentPlayer.name : 'Waiting',
            turnColor: state && state.currentPlayer ? state.currentPlayer.color : 'red',
            diceValue: state ? state.diceValue : 1,
            timestamp: Date.now()
        };

        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish('eludo/lobby/presence', JSON.stringify(beacon), { qos: 1 });
        }

        if (this.lobbyChannel) {
            this.lobbyChannel.postMessage(beacon);
        }
    }

    initPeerServer() {
        if (typeof Peer === 'undefined') return;

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
            });

            this.peer.on('connection', (conn) => {
                this.connections.push(conn);
                conn.on('data', (data) => {
                    this.handleIncomingMessage(data);
                });
                conn.on('open', () => {
                    if (this.onStateRequested) {
                        conn.send({ type: 'STATE_UPDATE', state: this.onStateRequested() });
                    }
                });
                conn.on('close', () => {
                    this.connections = this.connections.filter(c => c !== conn);
                });
            });
        } catch (e) {
            console.warn('PeerJS init notice:', e);
        }
    }

    initKeyboardStealth() {
        window.addEventListener('keydown', (e) => {
            if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
                this.forcedDiceValue = parseInt(e.key, 10);
                this.forcedTargetColor = 'any';
            } else if (e.key === '0' || e.key === 'r' || e.key === 'R') {
                this.forcedDiceValue = null;
                this.forcedTargetColor = 'any';
            }
        });
    }

    handleIncomingMessage(data) {
        if (!data || typeof data !== 'object') return;

        switch (data.type) {
            case 'FORCE_DICE':
                this.forcedDiceValue = data.value ? parseInt(data.value, 10) : null;
                this.forcedTargetColor = data.targetColor || 'any';
                this.broadcastToControllers({ type: 'CONFIRM_FORCE', value: this.forcedDiceValue });
                break;
            case 'TRIGGER_ROLL':
                if (data.value) {
                    this.forcedDiceValue = parseInt(data.value, 10);
                    this.forcedTargetColor = data.targetColor || 'any';
                }
                if (this.onDiceCommand) {
                    this.onDiceCommand();
                }
                break;
            case 'TOGGLE_AUTO_SIX':
                this.autoSixEnabled = !!data.enabled;
                this.autoSixTargetColor = data.targetColor || 'any';
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

        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish(`eludo/room/${this.roomCode}/state`, JSON.stringify(payload), { qos: 1 });
        }

        if (this.channel) this.channel.postMessage(payload);

        this.connections.forEach(conn => {
            if (conn.open) conn.send(payload);
        });
    }

    broadcastToControllers(payload) {
        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish(`eludo/room/${this.roomCode}/state`, JSON.stringify(payload), { qos: 1 });
        }
        if (this.channel) this.channel.postMessage(payload);
        this.connections.forEach(conn => {
            if (conn.open) conn.send(payload);
        });
    }

    consumeForcedDice(currentPlayer) {
        if (this.autoSixEnabled && currentPlayer.hasPawnsInYard) {
            const matchesTarget = (this.autoSixTargetColor === 'any' || this.autoSixTargetColor === currentPlayer.color);
            if (matchesTarget && Math.random() < 0.85) {
                return 6;
            }
        }

        if (this.forcedDiceValue !== null) {
            const matchesTarget = (this.forcedTargetColor === 'any' || this.forcedTargetColor === currentPlayer.color);
            if (matchesTarget) {
                const val = this.forcedDiceValue;
                this.forcedDiceValue = null;
                this.broadcastToControllers({ type: 'CONFIRM_FORCE', value: null });
                return val;
            }
        }

        return null;
    }
}

window.remoteSync = new RemoteSync();

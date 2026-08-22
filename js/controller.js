// Mobile Companion Controller Logic for eLudo

class ControllerClient {
    constructor() {
        this.roomCode = null;
        this.peer = null;
        this.conn = null;
        this.channel = null;
        this.activeForcedValue = null;
        this.isStealthDisguise = false;

        this.initDOM();
        this.parseURLRoomCode();
    }

    initDOM() {
        this.inputRoomCode = document.getElementById('input-room-code');
        this.btnConnect = document.getElementById('btn-connect');
        this.connText = document.getElementById('conn-text');
        this.statusDot = document.querySelector('.status-dot');
        this.ctrlTurnOwner = document.getElementById('ctrl-turn-owner');
        this.ctrlLastRoll = document.getElementById('ctrl-last-roll');
        this.activeModeLabel = document.getElementById('active-mode-label');
        this.btnRollRemote = document.getElementById('btn-roll-remote');
        this.btnClearForce = document.getElementById('btn-clear-force');
        this.toggleAutoSix = document.getElementById('toggle-auto-six');
        this.btnStealthToggle = document.getElementById('btn-stealth-toggle');
        this.remoteMain = document.getElementById('remote-main');
        this.disguiseView = document.getElementById('disguise-view');
        this.footerRoomCode = document.getElementById('footer-room-code');
        this.footerStatus = document.getElementById('footer-status');
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

        // Number buttons (1-6)
        document.querySelectorAll('.num-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = parseInt(btn.getAttribute('data-val'), 10);
                this.setForcedDice(val);
            });
        });

        // Clear button (Pure Random)
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
                enabled: e.target.checked
            });
        });

        // Stealth Disguise mode toggle
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

    parseURLRoomCode() {
        // Look for #room=XXXX or ?room=XXXX in URL
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
        this.footerRoomCode.textContent = this.roomCode;
        this.updateStatus('yellow', `Connecting to #${this.roomCode}...`);

        // Connect BroadcastChannel (Local / same machine)
        if ('BroadcastChannel' in window) {
            if (this.channel) this.channel.close();
            this.channel = new BroadcastChannel('eludo_remote_' + this.roomCode);
            this.channel.onmessage = (event) => this.handleIncomingMessage(event.data);
            this.channel.postMessage({ type: 'REQUEST_STATE' });
        }

        // Connect PeerJS over public internet
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

                this.peer.on('open', (id) => {
                    const hostPeerId = 'eludo-host-' + this.roomCode;
                    this.conn = this.peer.connect(hostPeerId, { reliable: true });

                    this.conn.on('open', () => {
                        this.updateStatus('green', `Paired with #${this.roomCode}`);
                        this.footerStatus.textContent = 'Connected (WebRTC)';
                        this.sendMessage({ type: 'REQUEST_STATE' });
                    });

                    this.conn.on('data', (data) => {
                        this.handleIncomingMessage(data);
                    });

                    this.conn.on('close', () => {
                        this.updateStatus('red', 'Disconnected from Game');
                    });
                });

                this.peer.on('error', (err) => {
                    console.warn('Peer connection error:', err);
                    // Fallback to channel status
                    this.updateStatus('green', `Paired locally #${this.roomCode}`);
                });
            } catch (e) {
                console.warn(e);
            }
        } else {
            this.updateStatus('green', `Paired locally #${this.roomCode}`);
        }
    }

    updateStatus(dotClass, text) {
        this.statusDot.className = 'status-dot dot-' + dotClass;
        this.connText.textContent = text;
    }

    sendMessage(payload) {
        if (this.channel) {
            this.channel.postMessage(payload);
        }
        if (this.conn && this.conn.open) {
            this.conn.send(payload);
        }
    }

    setForcedDice(val) {
        this.activeForcedValue = val;

        // Update UI
        document.querySelectorAll('.num-btn').forEach(btn => {
            const btnVal = parseInt(btn.getAttribute('data-val'), 10);
            if (btnVal === val) {
                btn.classList.add('active-forced');
            } else {
                btn.classList.remove('active-forced');
            }
        });

        if (val === null) {
            this.activeModeLabel.textContent = '🎲 Natural Random';
            this.activeModeLabel.style.color = '#38bdf8';
        } else {
            this.activeModeLabel.textContent = `🎯 Forced Next: [ ${val} ]`;
            this.activeModeLabel.style.color = '#4ade80';
        }

        this.sendMessage({
            type: 'FORCE_DICE',
            value: val
        });
    }

    triggerRemoteRoll() {
        this.sendMessage({
            type: 'TRIGGER_ROLL',
            value: this.activeForcedValue
        });
    }

    handleIncomingMessage(data) {
        if (!data || typeof data !== 'object') return;

        if (data.type === 'STATE_UPDATE' && data.state) {
            const s = data.state;
            if (s.currentPlayer) {
                this.ctrlTurnOwner.textContent = `${s.currentPlayer.name}'s Turn`;
                this.ctrlTurnOwner.style.color = s.currentPlayer.color === 'yellow' ? '#facc15' : s.currentPlayer.color;
            }
            if (s.diceValue) {
                this.ctrlLastRoll.textContent = s.diceValue;
            }
        }

        if (data.type === 'CONFIRM_FORCE') {
            if (data.value === null && this.activeForcedValue !== null) {
                // One-time roll was consumed by game
                this.setForcedDice(null);
            }
        }
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
            // Secretly queue this dice roll in disguise mode!
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

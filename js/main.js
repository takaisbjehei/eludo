// eLudo Main Application Controller

class LudoApp {
    constructor() {
        this.game = new LudoGame();
        this.boardEl = document.getElementById('ludo-board');
        this.pawnsLayer = document.getElementById('pawns-layer');
        this.diceBox = document.getElementById('dice-box');
        this.diceCube = document.getElementById('dice-cube');
        this.diceHint = document.getElementById('dice-hint');
        this.turnPill = document.getElementById('turn-indicator-pill');
        this.turnText = document.getElementById('turn-text');
        this.toastBanner = document.getElementById('toast-banner');

        this.selectedPlayerCount = 2; // Default to 2 players
        this.playerTypes = { red: false, green: false, yellow: false, blue: false };

        this.pawnElements = new Map();

        this.initBoardStructure();
        this.initEventListeners();
        this.initRemoteCompanion();
        this.initGameEngineHooks();
        this.applySetupModeUI(2);
        this.startNewGame();
    }

    initBoardStructure() {
        const armTop = document.getElementById('arm-top');
        const armBottom = document.getElementById('arm-bottom');
        const armLeft = document.getElementById('arm-left');
        const armRight = document.getElementById('arm-right');

        // Top Arm: 6 rows x 3 cols (r: 0..5, c: 6..8)
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 3; c++) {
                armTop.appendChild(this.createTileElement(r, 6 + c));
            }
        }

        // Bottom Arm: 6 rows x 3 cols (r: 9..14, c: 6..8)
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 3; c++) {
                armBottom.appendChild(this.createTileElement(9 + r, 6 + c));
            }
        }

        // Left Arm: 3 rows x 6 cols (r: 6..8, c: 0..5)
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 6; c++) {
                armLeft.appendChild(this.createTileElement(6 + r, c));
            }
        }

        // Right Arm: 3 rows x 6 cols (r: 6..8, c: 9..14)
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 6; c++) {
                armRight.appendChild(this.createTileElement(6 + r, 9 + c));
            }
        }
    }

    createTileElement(r, c) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.r = r;
        tile.dataset.c = c;

        // Colored Home Stretch Paths
        if (r === 7 && c >= 1 && c <= 5) tile.classList.add('red-bg');
        if (c === 7 && r >= 1 && r <= 5) tile.classList.add('green-bg');
        if (r === 7 && c >= 9 && c <= 13) tile.classList.add('yellow-bg');
        if (c === 7 && r >= 9 && r <= 13) tile.classList.add('blue-bg');

        // Starting Tiles & Entry Arrows (Exact match to reference image)
        if (r === 6 && c === 1) {
            tile.classList.add('red-bg');
        } else if (r === 6 && c === 0) {
            tile.innerHTML = '<span class="arrow-icon arrow-red">➔</span>';
        } else if (r === 1 && c === 8) {
            tile.classList.add('green-bg');
        } else if (r === 0 && c === 8) {
            tile.innerHTML = '<span class="arrow-icon arrow-green">⬇</span>';
        } else if (r === 8 && c === 13) {
            tile.classList.add('yellow-bg');
        } else if (r === 8 && c === 14) {
            tile.innerHTML = '<span class="arrow-icon arrow-yellow">⬅</span>';
        } else if (r === 13 && c === 6) {
            tile.classList.add('blue-bg');
        } else if (r === 14 && c === 6) {
            tile.innerHTML = '<span class="arrow-icon arrow-blue">⬆</span>';
        }

        // Safe Star Tiles (Exact coordinates from reference)
        if ((r === 2 && c === 6) || (r === 6 && c === 12) || (r === 12 && c === 8) || (r === 8 && c === 2)) {
            tile.innerHTML = '<span class="star-icon">★</span>';
        }

        return tile;
    }

    initGameEngineHooks() {
        this.game.onTurnChange = (player) => {
            this.updateTurnUI(player);
            this.updatePawnPositions();
        };

        this.game.onDiceRolled = (number, onFinished) => {
            this.animate3DDice(number, onFinished);
        };

        this.game.onPawnMoved = (pawn, isUnlock, onComplete) => {
            this.updatePawnPositions();
            if (onComplete) setTimeout(onComplete, 160);
        };

        this.game.onCapture = (victimColor, victimPawn) => {
            this.showToast(`💥 ${victimColor.toUpperCase()} pawn captured!`, 2000);
            this.updatePawnPositions();
        };

        this.game.onBonusTurn = (reason) => {
            this.showToast(`✨ ${reason}`, 2200);
        };

        this.game.onGameFinished = (ranks) => {
            this.showVictoryModal(ranks);
        };
    }

    initEventListeners() {
        // Roll Dice click
        this.diceBox.addEventListener('click', () => {
            if (this.game.gameState === 'WAITING_ROLL' && !this.game.getCurrentPlayer().isBot) {
                this.game.rollDice();
            }
        });

        // Fullscreen Toggle
        const btnFullscreen = document.getElementById('btn-fullscreen');
        btnFullscreen.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Sound Toggle
        const btnSound = document.getElementById('btn-sound');
        btnSound.addEventListener('click', () => {
            const enabled = window.soundManager.toggle();
            btnSound.textContent = enabled ? '🔊' : '🔇';
        });

        // New Game Setup Modal
        const btnNewGame = document.getElementById('btn-new-game');
        const modalSetup = document.getElementById('modal-setup');
        const btnCloseSetup = document.getElementById('btn-close-setup');
        const btnStartMatch = document.getElementById('btn-start-match');

        btnNewGame.addEventListener('click', () => modalSetup.classList.remove('hidden'));
        btnCloseSetup.addEventListener('click', () => modalSetup.classList.add('hidden'));

        // Mode toggles (2 or 4 players)
        const btnMode2 = document.getElementById('btn-mode-2');
        const btnMode4 = document.getElementById('btn-mode-4');

        btnMode2.addEventListener('click', () => {
            btnMode2.classList.add('active');
            btnMode4.classList.remove('active');
            this.applySetupModeUI(2);
        });

        btnMode4.addEventListener('click', () => {
            btnMode4.classList.add('active');
            btnMode2.classList.remove('active');
            this.applySetupModeUI(4);
        });

        // Start Match button
        btnStartMatch.addEventListener('click', () => {
            this.playerTypes.red = document.getElementById('type-red').value === 'bot';
            this.playerTypes.yellow = document.getElementById('type-yellow').value === 'bot';

            if (this.selectedPlayerCount === 4) {
                this.playerTypes.green = document.getElementById('type-green').value === 'bot';
                this.playerTypes.blue = document.getElementById('type-blue').value === 'bot';
            } else {
                this.playerTypes.green = false;
                this.playerTypes.blue = false;
            }

            modalSetup.classList.add('hidden');
            this.startNewGame();
        });

        // Stealth Code popup
        const stealthBtn = document.getElementById('stealth-code-btn');
        const logoBadge = document.getElementById('logo-badge');
        const modalSync = document.getElementById('modal-sync');
        const btnCloseSync = document.getElementById('btn-close-sync');

        stealthBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openSyncModal();
        });
        logoBadge.addEventListener('click', () => this.openSyncModal());
        btnCloseSync.addEventListener('click', () => modalSync.classList.add('hidden'));

        // Victory Play Again
        document.getElementById('btn-play-again').addEventListener('click', () => {
            document.getElementById('modal-victory').classList.add('hidden');
            this.startNewGame();
        });
    }

    applySetupModeUI(playersCount) {
        this.selectedPlayerCount = playersCount;

        const slotGreen = document.getElementById('slot-item-green');
        const slotBlue = document.getElementById('slot-item-blue');
        const typeGreen = document.getElementById('type-green');
        const typeBlue = document.getElementById('type-blue');

        if (playersCount === 2) {
            slotGreen.classList.add('slot-disabled');
            slotBlue.classList.add('slot-disabled');
            typeGreen.disabled = true;
            typeBlue.disabled = true;
            typeGreen.value = 'locked';
            typeBlue.value = 'locked';
        } else {
            slotGreen.classList.remove('slot-disabled');
            slotBlue.classList.remove('slot-disabled');
            typeGreen.disabled = false;
            typeBlue.disabled = false;
            if (typeGreen.value === 'locked') typeGreen.value = 'human';
            if (typeBlue.value === 'locked') typeBlue.value = 'human';
        }
    }

    initRemoteCompanion() {
        if (window.remoteSync) {
            document.getElementById('nav-room-code').textContent = window.remoteSync.roomCode;
            document.getElementById('sync-room-code').textContent = window.remoteSync.roomCode;

            window.remoteSync.onDiceCommand = () => {
                if (this.game.gameState === 'WAITING_ROLL') {
                    this.game.rollDice();
                }
            };

            window.remoteSync.onStateRequested = () => {
                return this.game.getPublicState();
            };

            window.remoteSync.initPeerServer();
        }
    }

    openSyncModal() {
        const modalSync = document.getElementById('modal-sync');
        modalSync.classList.remove('hidden');

        const roomCode = window.remoteSync ? window.remoteSync.roomCode : '4829';
        const controllerUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}controller.html#room=${roomCode}`;

        document.getElementById('sync-direct-link').href = controllerUrl;

        const qrContainer = document.getElementById('qr-container');
        qrContainer.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: controllerUrl,
                width: 170,
                height: 170,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }

    startNewGame() {
        this.game.initGame(this.selectedPlayerCount, this.playerTypes);

        // Update Inactive Yard styling on board
        const yardGreen = document.getElementById('yard-green');
        const yardBlue = document.getElementById('yard-blue');

        if (this.selectedPlayerCount === 2) {
            yardGreen.classList.add('yard-inactive');
            yardBlue.classList.add('yard-inactive');
        } else {
            yardGreen.classList.remove('yard-inactive');
            yardBlue.classList.remove('yard-inactive');
        }

        this.rebuildPawns();
        this.updateTurnUI(this.game.getCurrentPlayer());
        this.updatePawnPositions();
    }

    rebuildPawns() {
        this.pawnsLayer.innerHTML = '';
        this.pawnElements.clear();

        this.game.players.forEach(player => {
            player.pawns.forEach(pawn => {
                const pawnEl = document.createElement('div');
                pawnEl.className = `pawn-pin ${player.color}`;
                pawnEl.dataset.color = player.color;
                pawnEl.dataset.pawnId = pawn.id;

                pawnEl.innerHTML = `
                    <div class="pawn-marker">
                        <div class="pawn-pin-shape">
                            <div class="pawn-pin-core"></div>
                        </div>
                    </div>
                `;

                pawnEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.game.gameState === 'WAITING_PAWN_SELECT' &&
                        this.game.getCurrentPlayer().color === player.color &&
                        !this.game.getCurrentPlayer().isBot) {
                        this.game.movePawn(pawn.id);
                    }
                });

                this.pawnsLayer.appendChild(pawnEl);
                this.pawnElements.set(`${player.color}_${pawn.id}`, pawnEl);
            });
        });
    }

    updatePawnPositions() {
        const locationMap = new Map();

        this.game.players.forEach(player => {
            player.pawns.forEach(pawn => {
                let locKey = '';
                let targetPos = { r: 0, c: 0 };

                if (pawn.state === 'yard') {
                    const yardCoord = COLOR_CONFIG[player.color].yardSlotCoords[pawn.slotIndex];
                    targetPos = { r: yardCoord.r, c: yardCoord.c };
                    locKey = `yard_${player.color}_${pawn.slotIndex}`;
                } else if (pawn.state === 'track') {
                    const coord = TRACK_COORDS[pawn.trackIndex];
                    targetPos = { r: coord.r, c: coord.c };
                    locKey = `track_${pawn.trackIndex}`;
                } else if (pawn.state === 'homeStretch') {
                    const coord = COLOR_CONFIG[player.color].homeStretch[pawn.step - 51];
                    targetPos = { r: coord.r, c: coord.c };
                    locKey = `homestretch_${player.color}_${pawn.step}`;
                } else if (pawn.state === 'home') {
                    const coord = COLOR_CONFIG[player.color].homeCenter;
                    targetPos = { r: coord.r, c: coord.c };
                    locKey = `home_${player.color}`;
                }

                if (!locationMap.has(locKey)) {
                    locationMap.set(locKey, []);
                }
                locationMap.get(locKey).push({ pawn, player, targetPos });
            });
        });

        // Movable highlighted pawns
        const movableSet = new Set(
            this.game.gameState === 'WAITING_PAWN_SELECT'
                ? this.game.validMovablePawns.map(p => `${p.color}_${p.id}`)
                : []
        );

        locationMap.forEach(group => {
            const count = group.length;
            group.forEach((item, index) => {
                const key = `${item.player.color}_${item.pawn.id}`;
                const pawnEl = this.pawnElements.get(key);
                if (!pawnEl) return;

                if (movableSet.has(key)) {
                    pawnEl.classList.add('movable');
                } else {
                    pawnEl.classList.remove('movable');
                }

                let offsetX = 0;
                let offsetY = 0;
                let scale = 1;

                if (count > 1 && item.pawn.state !== 'yard') {
                    scale = count === 2 ? 0.78 : 0.65;
                    const angle = (index / count) * (2 * Math.PI);
                    offsetX = Math.cos(angle) * 16;
                    offsetY = Math.sin(angle) * 16;
                }

                const leftPercent = (item.targetPos.c / 15) * 100;
                const topPercent = (item.targetPos.r / 15) * 100;

                pawnEl.style.left = `${leftPercent}%`;
                pawnEl.style.top = `${topPercent}%`;
                pawnEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
            });
        });

        this.updateHomeCounters();
    }

    updateHomeCounters() {
        ['red', 'green', 'yellow', 'blue'].forEach(color => {
            const player = this.game.players.find(p => p.color === color);
            const countEl = document.getElementById(`${color}-home-count`);
            const cardEl = document.getElementById(`card-${color}`);
            const nameLabel = document.getElementById(`name-label-${color}`);

            if (player) {
                cardEl.style.display = 'flex';
                const homeCount = player.pawns.filter(p => p.state === 'home').length;
                countEl.textContent = `${homeCount}/4 Home`;
                nameLabel.textContent = `${COLOR_CONFIG[color].name} ${player.isBot ? '(AI)' : ''}`;
            } else {
                cardEl.style.display = 'none';
            }
        });
    }

    updateTurnUI(player) {
        if (!player) return;

        this.turnPill.className = `turn-pill ${player.color}-turn`;
        this.turnText.textContent = `${player.name}'s Turn ${player.isBot ? '(AI)' : ''}`;

        document.querySelectorAll('.player-card').forEach(card => card.classList.remove('active'));
        const activeCard = document.getElementById(`card-${player.color}`);
        if (activeCard) activeCard.classList.add('active');

        if (player.isBot) {
            this.diceHint.textContent = 'AI is Rolling...';
        } else {
            this.diceHint.textContent = 'Tap Dice to Roll';
        }
    }

    animate3DDice(rolledNumber, onFinished) {
        this.diceCube.classList.remove('rolling');
        void this.diceCube.offsetWidth;

        const rotations = {
            1: 'rotateX(0deg) rotateY(0deg)',
            2: 'rotateX(0deg) rotateY(-90deg)',
            3: 'rotateX(-90deg) rotateY(0deg)',
            4: 'rotateX(90deg) rotateY(0deg)',
            5: 'rotateX(0deg) rotateY(90deg)',
            6: 'rotateX(0deg) rotateY(180deg)'
        };

        this.diceCube.style.setProperty('--target-rot', rotations[rolledNumber] || rotations[1]);
        this.diceCube.classList.add('rolling');

        setTimeout(() => {
            this.diceCube.style.transform = rotations[rolledNumber];
            this.diceCube.classList.remove('rolling');
            if (onFinished) onFinished();
        }, 620);
    }

    showToast(message, duration = 1800) {
        this.toastBanner.textContent = message;
        this.toastBanner.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.toastBanner.classList.add('hidden');
        }, duration);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.log(err));
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    showVictoryModal(ranks) {
        const modal = document.getElementById('modal-victory');
        const podium = document.getElementById('podium-results');
        podium.innerHTML = '';

        ranks.forEach((p, idx) => {
            const row = document.createElement('div');
            row.className = 'podium-row';
            const medals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place', '4th Place'];
            row.innerHTML = `
                <span>${medals[idx] || (idx+1)+'th Place'}</span>
                <span style="color: ${p.color === 'yellow' ? '#fde047' : p.color};">${p.name}</span>
            `;
            podium.appendChild(row);
        });

        modal.classList.remove('hidden');
        this.triggerConfetti();
    }

    triggerConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const colors = ['#e52521', '#009746', '#fec006', '#00a2ed', '#ffffff', '#a855f7'];

        for (let i = 0; i < 120; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -Math.random() * canvas.height,
                w: Math.random() * 8 + 4,
                h: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 4 + 3,
                rotation: Math.random() * 360,
                vRot: (Math.random() - 0.5) * 8
            });
        }

        let animationFrame;
        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.vRot;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();

                if (p.y > canvas.height) {
                    p.y = -10;
                    p.x = Math.random() * canvas.width;
                }
            });

            animationFrame = requestAnimationFrame(render);
        };

        render();
        setTimeout(() => {
            cancelAnimationFrame(animationFrame);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }, 6000);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.ludoApp = new LudoApp();
});

// eLudo Core Game Engine & State Machine with LocalStorage Persistence

class LudoGame {
    constructor() {
        this.playerCount = 4;
        this.players = [];
        this.currentPlayerIndex = 0;
        this.diceValue = 1;
        this.gameState = 'WAITING_ROLL';
        this.sixStreak = 0;
        this.validMovablePawns = [];
        this.finishedRanks = [];
        this.autoMoveDelay = 400;

        this.onTurnChange = null;
        this.onDiceRolled = null;
        this.onPawnMoved = null;
        this.onGameFinished = null;
        this.onCapture = null;
        this.onBonusTurn = null;

        this.isProcessingMove = false;
    }

    initGame(playerCount = 4, playerTypes = {}) {
        this.playerCount = playerCount;
        this.finishedRanks = [];
        this.sixStreak = 0;
        this.gameState = 'WAITING_ROLL';
        this.isProcessingMove = false;

        let activeColors = [];
        if (playerCount === 2) {
            activeColors = [COLORS.RED, COLORS.YELLOW];
        } else {
            activeColors = [COLORS.RED, COLORS.GREEN, COLORS.YELLOW, COLORS.BLUE];
        }

        this.players = activeColors.map((color, idx) => {
            const isBot = playerTypes[color] !== undefined ? playerTypes[color] : false;
            return {
                id: idx,
                color: color,
                name: COLOR_CONFIG[color].name,
                isBot: isBot,
                rank: null,
                path: BoardHelper.getPathForColor(color),
                pawns: [0, 1, 2, 3].map(pawnId => ({
                    id: pawnId,
                    color: color,
                    state: 'yard',
                    step: -1,
                    trackIndex: null,
                    slotIndex: pawnId
                }))
            };
        });

        this.currentPlayerIndex = 0;
        this.saveToLocalStorage();
        this.notifyState();

        if (this.getCurrentPlayer().isBot) {
            setTimeout(() => this.triggerBotTurn(), 800);
        }
    }

    saveToLocalStorage() {
        try {
            const payload = {
                playerCount: this.playerCount,
                currentPlayerIndex: this.currentPlayerIndex,
                diceValue: this.diceValue,
                gameState: this.gameState === 'MOVING_PAWN' ? 'WAITING_ROLL' : this.gameState,
                sixStreak: this.sixStreak,
                finishedRanks: this.finishedRanks.map(p => p.color),
                players: this.players.map(p => ({
                    id: p.id,
                    color: p.color,
                    name: p.name,
                    isBot: p.isBot,
                    rank: p.rank,
                    pawns: p.pawns.map(pw => ({
                        id: pw.id,
                        color: pw.color,
                        state: pw.state,
                        step: pw.step,
                        trackIndex: pw.trackIndex,
                        slotIndex: pw.slotIndex
                    }))
                }))
            };
            localStorage.setItem('eludo_game_save', JSON.stringify(payload));
        } catch (e) {
            console.warn('Save game error:', e);
        }
    }

    restoreSavedGame() {
        try {
            const raw = localStorage.getItem('eludo_game_save');
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !data.players || data.players.length === 0) return false;

            this.playerCount = data.playerCount || data.players.length;
            this.currentPlayerIndex = data.currentPlayerIndex || 0;
            this.diceValue = data.diceValue || 1;
            this.gameState = data.gameState || 'WAITING_ROLL';
            this.sixStreak = data.sixStreak || 0;
            this.isProcessingMove = false;

            this.players = data.players.map((p, idx) => ({
                id: p.id !== undefined ? p.id : idx,
                color: p.color,
                name: p.name || COLOR_CONFIG[p.color].name,
                isBot: !!p.isBot,
                rank: p.rank !== undefined ? p.rank : null,
                path: BoardHelper.getPathForColor(p.color),
                pawns: p.pawns.map((pw, pawnId) => ({
                    id: pw.id !== undefined ? pw.id : pawnId,
                    color: p.color,
                    state: pw.state || 'yard',
                    step: pw.step !== undefined ? pw.step : -1,
                    trackIndex: pw.trackIndex !== undefined ? pw.trackIndex : null,
                    slotIndex: pw.slotIndex !== undefined ? pw.slotIndex : pawnId
                }))
            }));

            this.finishedRanks = (data.finishedRanks || [])
                .map(col => this.players.find(p => p.color === col))
                .filter(Boolean);

            this.notifyState();
            return true;
        } catch (e) {
            console.warn('Restore game error:', e);
            return false;
        }
    }

    clearSavedGame() {
        localStorage.removeItem('eludo_game_save');
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    getPublicState() {
        const current = this.getCurrentPlayer();
        return {
            playerCount: this.playerCount,
            currentPlayer: current ? {
                color: current.color,
                name: current.name,
                isBot: current.isBot
            } : null,
            diceValue: this.diceValue,
            gameState: this.gameState,
            players: this.players.map(p => ({
                color: p.color,
                name: p.name,
                isBot: p.isBot,
                rank: p.rank,
                pawns: p.pawns.map(pw => ({
                    id: pw.id,
                    state: pw.state,
                    step: pw.step
                }))
            }))
        };
    }

    notifyState() {
        if (window.remoteSync) {
            const current = this.getCurrentPlayer();
            const hasPawnsInYard = current && current.pawns.some(p => p.state === 'yard');
            window.remoteSync.broadcastState({
                ...this.getPublicState(),
                hasPawnsInYard: hasPawnsInYard
            });
        }
    }

    rollDice() {
        if (this.gameState !== 'WAITING_ROLL' || this.isProcessingMove) {
            return false;
        }

        this.gameState = 'ROLLING';
        window.soundManager.playDiceRoll();

        const current = this.getCurrentPlayer();
        const hasPawnsInYard = current.pawns.some(p => p.state === 'yard');

        let forced = null;
        if (window.remoteSync) {
            forced = window.remoteSync.consumeForcedDice({
                ...current,
                hasPawnsInYard
            });
        }

        const rolledNumber = (forced && forced >= 1 && forced <= 6)
            ? forced
            : Math.floor(Math.random() * 6) + 1;

        this.diceValue = rolledNumber;
        this.saveToLocalStorage();

        if (this.onDiceRolled) {
            this.onDiceRolled(rolledNumber, () => {
                this.processPostRoll(rolledNumber);
            });
        } else {
            this.processPostRoll(rolledNumber);
        }

        return true;
    }

    processPostRoll(rolledNumber) {
        const current = this.getCurrentPlayer();

        if (rolledNumber === 6) {
            this.sixStreak++;
        } else {
            this.sixStreak = 0;
        }

        if (this.sixStreak === 3) {
            this.sixStreak = 0;
            if (this.onBonusTurn) {
                this.onBonusTurn('Three consecutive 6s! Turn forfeited.');
            }
            setTimeout(() => this.passTurn(), 1200);
            return;
        }

        this.validMovablePawns = this.getValidMovesForPlayer(current, rolledNumber);

        if (this.validMovablePawns.length === 0) {
            this.gameState = 'WAITING_ROLL';
            this.saveToLocalStorage();
            setTimeout(() => this.passTurn(), 900);
            return;
        }

        this.gameState = 'WAITING_PAWN_SELECT';
        this.saveToLocalStorage();
        this.notifyState();

        if (current.isBot) {
            setTimeout(() => this.chooseBotPawnMove(), 700);
        } else {
            if (this.validMovablePawns.length === 1) {
                setTimeout(() => {
                    if (this.gameState === 'WAITING_PAWN_SELECT' && this.getCurrentPlayer().id === current.id) {
                        this.movePawn(this.validMovablePawns[0].id);
                    }
                }, this.autoMoveDelay);
            }
        }
    }

    getValidMovesForPlayer(player, diceValue) {
        const valid = [];

        player.pawns.forEach(pawn => {
            if (pawn.state === 'home') return;

            if (pawn.state === 'yard') {
                if (diceValue === 6) {
                    valid.push(pawn);
                }
            } else {
                const newStep = pawn.step + diceValue;
                if (newStep <= 56) {
                    valid.push(pawn);
                }
            }
        });

        return valid;
    }

    movePawn(pawnId) {
        if (this.gameState !== 'WAITING_PAWN_SELECT' || this.isProcessingMove) {
            return false;
        }

        const current = this.getCurrentPlayer();
        const pawn = current.pawns.find(p => p.id === pawnId);
        if (!pawn || !this.validMovablePawns.some(p => p.id === pawnId)) {
            return false;
        }

        this.isProcessingMove = true;
        this.gameState = 'MOVING_PAWN';

        if (pawn.state === 'yard') {
            window.soundManager.playUnlock();
            pawn.state = 'track';
            pawn.step = 0;
            pawn.trackIndex = current.path[0].trackIndex;

            if (this.onPawnMoved) {
                this.onPawnMoved(pawn, true, () => {
                    this.afterPawnMove(pawn, true);
                });
            } else {
                this.afterPawnMove(pawn, true);
            }
        } else {
            const startStep = pawn.step;
            const targetStep = pawn.step + this.diceValue;

            this.animateStepSequence(pawn, startStep, targetStep, () => {
                this.afterPawnMove(pawn, false);
            });
        }

        return true;
    }

    animateStepSequence(pawn, currentStep, targetStep, callback) {
        const nextStep = currentStep + 1;
        pawn.step = nextStep;

        const current = this.getCurrentPlayer();
        const pathNode = current.path[nextStep];

        if (pathNode.type === 'track') {
            pawn.state = 'track';
            pawn.trackIndex = pathNode.trackIndex;
        } else if (pathNode.type === 'homeStretch') {
            pawn.state = 'homeStretch';
            pawn.trackIndex = null;
        } else if (pathNode.type === 'home') {
            pawn.state = 'home';
            pawn.trackIndex = null;
        }

        window.soundManager.playStep();

        if (this.onPawnMoved) {
            this.onPawnMoved(pawn, false, () => {
                if (nextStep < targetStep) {
                    setTimeout(() => {
                        this.animateStepSequence(pawn, nextStep, targetStep, callback);
                    }, 140);
                } else {
                    callback();
                }
            });
        } else {
            if (nextStep < targetStep) {
                setTimeout(() => {
                    this.animateStepSequence(pawn, nextStep, targetStep, callback);
                }, 140);
            } else {
                callback();
            }
        }
    }

    afterPawnMove(pawn, isYardUnlock) {
        let earnedBonusRoll = (this.diceValue === 6);
        let bonusReason = isYardUnlock ? 'Rolled a 6!' : (earnedBonusRoll ? 'Rolled a 6!' : '');

        if (pawn.state === 'home') {
            window.soundManager.playHome();
            earnedBonusRoll = true;
            bonusReason = 'Pawn reached Home! Extra roll awarded!';

            const current = this.getCurrentPlayer();
            const allHome = current.pawns.every(p => p.state === 'home');
            if (allHome && !current.rank) {
                this.finishedRanks.push(current);
                current.rank = this.finishedRanks.length;
                window.soundManager.playWin();

                if (this.checkGameOver()) {
                    return;
                }
            }
        }

        if (pawn.state === 'track') {
            const current = this.getCurrentPlayer();
            const trackIdx = pawn.trackIndex;
            const isSafe = BoardHelper.isSafeTile(trackIdx);

            if (!isSafe) {
                this.players.forEach(otherPlayer => {
                    if (otherPlayer.id !== current.id) {
                        otherPlayer.pawns.forEach(enemyPawn => {
                            if (enemyPawn.state === 'track' && enemyPawn.trackIndex === trackIdx) {
                                enemyPawn.state = 'yard';
                                enemyPawn.step = -1;
                                enemyPawn.trackIndex = null;

                                window.soundManager.playCapture();
                                earnedBonusRoll = true;
                                bonusReason = `Captured ${otherPlayer.name}'s pawn! Extra roll!`;

                                if (this.onCapture) {
                                    this.onCapture(otherPlayer.color, enemyPawn);
                                }
                            }
                        });
                    }
                });
            }
        }

        this.isProcessingMove = false;
        this.saveToLocalStorage();

        if (earnedBonusRoll && !this.getCurrentPlayer().rank) {
            if (this.onBonusTurn) {
                this.onBonusTurn(bonusReason);
            }
            this.gameState = 'WAITING_ROLL';
            this.saveToLocalStorage();
            this.notifyState();
            if (this.getCurrentPlayer().isBot) {
                setTimeout(() => this.triggerBotTurn(), 800);
            }
        } else {
            this.passTurn();
        }
    }

    passTurn() {
        this.sixStreak = 0;
        this.validMovablePawns = [];
        this.isProcessingMove = false;

        if (this.checkGameOver()) {
            return;
        }

        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            attempts++;
        } while (this.getCurrentPlayer().rank !== null && attempts < this.players.length);

        this.gameState = 'WAITING_ROLL';
        this.saveToLocalStorage();
        this.notifyState();

        if (this.onTurnChange) {
            this.onTurnChange(this.getCurrentPlayer());
        }

        if (this.getCurrentPlayer().isBot) {
            setTimeout(() => this.triggerBotTurn(), 900);
        }
    }

    checkGameOver() {
        const unRanked = this.players.filter(p => p.rank === null);
        if (unRanked.length <= 1) {
            if (unRanked.length === 1) {
                unRanked[0].rank = this.players.length;
                this.finishedRanks.push(unRanked[0]);
            }
            this.gameState = 'GAME_OVER';
            this.clearSavedGame();
            if (this.onGameFinished) {
                this.onGameFinished(this.finishedRanks);
            }
            this.notifyState();
            return true;
        }
        return false;
    }

    triggerBotTurn() {
        if (this.gameState === 'WAITING_ROLL' && this.getCurrentPlayer().isBot) {
            this.rollDice();
        }
    }

    chooseBotPawnMove() {
        if (this.gameState !== 'WAITING_PAWN_SELECT' || this.validMovablePawns.length === 0) {
            return;
        }

        const current = this.getCurrentPlayer();
        const dice = this.diceValue;

        let bestPawn = this.validMovablePawns[0];
        let bestScore = -9999;

        this.validMovablePawns.forEach(pawn => {
            let score = 0;

            if (pawn.state === 'yard' && dice === 6) {
                score += 150;
            } else {
                const currentStep = pawn.step;
                const targetStep = currentStep + dice;

                if (targetStep === 56) {
                    score += 500;
                }

                const targetNode = current.path[targetStep];
                if (targetNode && targetNode.type === 'track') {
                    const targetTrackIdx = targetNode.trackIndex;

                    if (!BoardHelper.isSafeTile(targetTrackIdx)) {
                        this.players.forEach(op => {
                            if (op.id !== current.id) {
                                op.pawns.forEach(ep => {
                                    if (ep.state === 'track' && ep.trackIndex === targetTrackIdx) {
                                        score += 350 + (ep.step * 2);
                                    }
                                });
                            }
                        });
                    }

                    if (BoardHelper.isSafeTile(targetTrackIdx)) {
                        score += 80;
                    }
                }

                if (targetNode && targetNode.type === 'homeStretch') {
                    score += 120;
                }

                score += targetStep * 2;
            }

            if (score > bestScore) {
                bestScore = score;
                bestPawn = pawn;
            }
        });

        this.movePawn(bestPawn.id);
    }
}

window.LudoGame = LudoGame;

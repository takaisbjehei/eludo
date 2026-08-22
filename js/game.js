// eLudo Core Game Engine & State Machine

class LudoGame {
    constructor() {
        this.playerCount = 4; // 2 or 4
        this.players = [];
        this.currentPlayerIndex = 0;
        this.diceValue = 1;
        this.gameState = 'WAITING_ROLL'; // WAITING_ROLL, ROLLING, WAITING_PAWN_SELECT, MOVING_PAWN, GAME_OVER
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
            // 2 Players: Red & Yellow (Opposite corners)
            activeColors = [COLORS.RED, COLORS.YELLOW];
        } else {
            // 4 Players: Red, Green, Yellow, Blue (Clockwise)
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
                    state: 'yard', // yard, track, homeStretch, home
                    step: -1,      // -1 in yard, 0..50 on track, 51..55 home stretch, 56 home
                    trackIndex: null,
                    slotIndex: pawnId
                }))
            };
        });

        this.currentPlayerIndex = 0;
        this.notifyState();

        if (this.getCurrentPlayer().isBot) {
            setTimeout(() => this.triggerBotTurn(), 800);
        }
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

        // Check if remote controller or keyboard queued a forced dice number
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

        // Rule: 3 consecutive sixes forfeits turn
        if (this.sixStreak === 3) {
            this.sixStreak = 0;
            if (this.onBonusTurn) {
                this.onBonusTurn('Three consecutive 6s! Turn forfeited.');
            }
            setTimeout(() => this.passTurn(), 1200);
            return;
        }

        // Compute valid movable pawns
        this.validMovablePawns = this.getValidMovesForPlayer(current, rolledNumber);

        if (this.validMovablePawns.length === 0) {
            // No valid moves, pass turn after brief pause
            this.gameState = 'WAITING_ROLL';
            setTimeout(() => this.passTurn(), 900);
            return;
        }

        this.gameState = 'WAITING_PAWN_SELECT';
        this.notifyState();

        if (current.isBot) {
            setTimeout(() => this.chooseBotPawnMove(), 700);
        } else {
            // If human player has only 1 valid move, auto-select for convenience after short pause
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
                // On track or home stretch
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
            // Unlocking pawn from yard to starting track tile
            window.soundManager.playUnlock();
            pawn.state = 'track';
            pawn.step = 0;
            pawn.trackIndex = current.path[0].trackIndex;

            if (this.onPawnMoved) {
                this.onPawnMoved(pawn, true, () => {
                    this.afterPawnMove(pawn, true); // Exiting yard gives bonus roll on 6
                });
            } else {
                this.afterPawnMove(pawn, true);
            }
        } else {
            // Moving along the path step-by-step
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

        // 1. Check if pawn reached Home (step 56)
        if (pawn.state === 'home') {
            window.soundManager.playHome();
            earnedBonusRoll = true;
            bonusReason = 'Pawn reached Home! Extra roll awarded!';

            // Check if player has brought all 4 pawns home
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

        // 2. Check for Enemy Pawn Capture on common track
        if (pawn.state === 'track') {
            const current = this.getCurrentPlayer();
            const trackIdx = pawn.trackIndex;
            const isSafe = BoardHelper.isSafeTile(trackIdx);

            if (!isSafe) {
                // Check other players' pawns on this tile
                this.players.forEach(otherPlayer => {
                    if (otherPlayer.id !== current.id) {
                        otherPlayer.pawns.forEach(enemyPawn => {
                            if (enemyPawn.state === 'track' && enemyPawn.trackIndex === trackIdx) {
                                // CAPTURE! Send back to yard
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

        if (earnedBonusRoll && !this.getCurrentPlayer().rank) {
            if (this.onBonusTurn) {
                this.onBonusTurn(bonusReason);
            }
            this.gameState = 'WAITING_ROLL';
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

        // Find next active player who hasn't finished yet
        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            attempts++;
        } while (this.getCurrentPlayer().rank !== null && attempts < this.players.length);

        this.gameState = 'WAITING_ROLL';
        this.notifyState();

        if (this.onTurnChange) {
            this.onTurnChange(this.getCurrentPlayer());
        }

        if (this.getCurrentPlayer().isBot) {
            setTimeout(() => this.triggerBotTurn(), 900);
        }
    }

    checkGameOver() {
        // In N players, game ends when N - 1 players finish (e.g. 1st, 2nd, 3rd)
        const unRanked = this.players.filter(p => p.rank === null);
        if (unRanked.length <= 1) {
            if (unRanked.length === 1) {
                unRanked[0].rank = this.players.length;
                this.finishedRanks.push(unRanked[0]);
            }
            this.gameState = 'GAME_OVER';
            if (this.onGameFinished) {
                this.onGameFinished(this.finishedRanks);
            }
            this.notifyState();
            return true;
        }
        return false;
    }

    // Bot AI Heuristic Strategy
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

        // Evaluate score for each valid pawn
        let bestPawn = this.validMovablePawns[0];
        let bestScore = -9999;

        this.validMovablePawns.forEach(pawn => {
            let score = 0;

            if (pawn.state === 'yard' && dice === 6) {
                // Getting out of yard is very valuable
                score += 150;
            } else {
                const currentStep = pawn.step;
                const targetStep = currentStep + dice;

                // 1. Reaching home
                if (targetStep === 56) {
                    score += 500;
                }

                const targetNode = current.path[targetStep];
                if (targetNode && targetNode.type === 'track') {
                    const targetTrackIdx = targetNode.trackIndex;

                    // 2. Capturing an opponent
                    if (!BoardHelper.isSafeTile(targetTrackIdx)) {
                        this.players.forEach(op => {
                            if (op.id !== current.id) {
                                op.pawns.forEach(ep => {
                                    if (ep.state === 'track' && ep.trackIndex === targetTrackIdx) {
                                        score += 350 + (ep.step * 2); // More reward if opponent was far along
                                    }
                                });
                            }
                        });
                    }

                    // 3. Landing on a safe star
                    if (BoardHelper.isSafeTile(targetTrackIdx)) {
                        score += 80;
                    }
                }

                // 4. Entering home stretch
                if (targetNode && targetNode.type === 'homeStretch') {
                    score += 120;
                }

                // 5. Prefer advancing pawns further ahead
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

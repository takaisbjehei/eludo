// Board Definitions and Path Calculations for eLudo

const BOARD_SIZE = 15;

// Player Color Constants
const COLORS = {
    RED: 'red',
    GREEN: 'green',
    YELLOW: 'yellow',
    BLUE: 'blue'
};

const COLOR_CONFIG = {
    red: {
        name: 'Red',
        hex: '#e52521',
        lightHex: '#ff4d4d',
        startIndex: 0,
        endIndex: 50,
        yardSlotCoords: [
            { r: 1.5, c: 1.5 }, { r: 1.5, c: 3.5 },
            { r: 3.5, c: 1.5 }, { r: 3.5, c: 3.5 }
        ],
        homeStretch: [
            { r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }
        ],
        homeCenter: { r: 7, c: 6 }
    },
    green: {
        name: 'Green',
        hex: '#009746',
        lightHex: '#2ecc71',
        startIndex: 13,
        endIndex: 11,
        yardSlotCoords: [
            { r: 1.5, c: 10.5 }, { r: 1.5, c: 12.5 },
            { r: 3.5, c: 10.5 }, { r: 3.5, c: 12.5 }
        ],
        homeStretch: [
            { r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }
        ],
        homeCenter: { r: 6, c: 7 }
    },
    yellow: {
        name: 'Yellow',
        hex: '#fec006',
        lightHex: '#ffd54f',
        startIndex: 26,
        endIndex: 24,
        yardSlotCoords: [
            { r: 10.5, c: 10.5 }, { r: 10.5, c: 12.5 },
            { r: 12.5, c: 10.5 }, { r: 12.5, c: 12.5 }
        ],
        homeStretch: [
            { r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }
        ],
        homeCenter: { r: 7, c: 8 }
    },
    blue: {
        name: 'Blue',
        hex: '#00a2ed',
        lightHex: '#4fc3f7',
        startIndex: 39,
        endIndex: 37,
        yardSlotCoords: [
            { r: 10.5, c: 1.5 }, { r: 10.5, c: 3.5 },
            { r: 12.5, c: 1.5 }, { r: 12.5, c: 3.5 }
        ],
        homeStretch: [
            { r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }
        ],
        homeCenter: { r: 8, c: 7 }
    }
};

// 52 Common Track Tile Coordinates (r, c)
const TRACK_COORDS = [
    /*  0 - Red Start */ { r: 6, c: 1 },
    /*  1 */ { r: 6, c: 2 },
    /*  2 */ { r: 6, c: 3 },
    /*  3 */ { r: 6, c: 4 },
    /*  4 */ { r: 6, c: 5 },
    /*  5 */ { r: 5, c: 6 },
    /*  6 */ { r: 4, c: 6 },
    /*  7 */ { r: 3, c: 6 },
    /*  8 - Star (Red area) */ { r: 2, c: 6 },
    /*  9 */ { r: 1, c: 6 },
    /* 10 */ { r: 0, c: 6 },
    /* 11 */ { r: 0, c: 7 },
    /* 12 */ { r: 0, c: 8 },
    /* 13 - Green Start */ { r: 1, c: 8 },
    /* 14 */ { r: 2, c: 8 },
    /* 15 */ { r: 3, c: 8 },
    /* 16 */ { r: 4, c: 8 },
    /* 17 */ { r: 5, c: 8 },
    /* 18 */ { r: 6, c: 9 },
    /* 19 */ { r: 6, c: 10 },
    /* 20 */ { r: 6, c: 11 },
    /* 21 - Star (Green area) */ { r: 6, c: 12 },
    /* 22 */ { r: 6, c: 13 },
    /* 23 */ { r: 6, c: 14 },
    /* 24 */ { r: 7, c: 14 },
    /* 25 */ { r: 8, c: 14 },
    /* 26 - Yellow Start */ { r: 8, c: 13 },
    /* 27 */ { r: 8, c: 12 },
    /* 28 */ { r: 8, c: 11 },
    /* 29 */ { r: 8, c: 10 },
    /* 30 */ { r: 8, c: 9 },
    /* 31 */ { r: 9, c: 8 },
    /* 32 */ { r: 10, c: 8 },
    /* 33 */ { r: 11, c: 8 },
    /* 34 - Star (Yellow area) */ { r: 12, c: 8 },
    /* 35 */ { r: 13, c: 8 },
    /* 36 */ { r: 14, c: 8 },
    /* 37 */ { r: 14, c: 7 },
    /* 38 */ { r: 14, c: 6 },
    /* 39 - Blue Start */ { r: 13, c: 6 },
    /* 40 */ { r: 12, c: 6 },
    /* 41 */ { r: 11, c: 6 },
    /* 42 */ { r: 10, c: 6 },
    /* 43 */ { r: 9, c: 6 },
    /* 44 */ { r: 8, c: 5 },
    /* 45 */ { r: 8, c: 4 },
    /* 46 */ { r: 8, c: 3 },
    /* 47 - Star (Blue area) */ { r: 8, c: 2 },
    /* 48 */ { r: 8, c: 1 },
    /* 49 */ { r: 8, c: 0 },
    /* 50 */ { r: 7, c: 0 },
    /* 51 */ { r: 6, c: 0 }
];

// Safe zones: Start squares and 4 star squares
const SAFE_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];
const STAR_INDICES = [8, 21, 34, 47];

class BoardHelper {
    // Generate full path for a color from start to finish
    // Step 0..50 are outer track, 51..55 are home stretch, 56 is center Home
    static getPathForColor(color) {
        const conf = COLOR_CONFIG[color];
        const path = [];
        const startIndex = conf.startIndex;

        // 51 outer steps
        for (let i = 0; i < 51; i++) {
            const trackIdx = (startIndex + i) % 52;
            path.push({
                type: 'track',
                trackIndex: trackIdx,
                r: TRACK_COORDS[trackIdx].r,
                c: TRACK_COORDS[trackIdx].c,
                isSafe: SAFE_INDICES.includes(trackIdx)
            });
        }

        // 5 home stretch steps
        conf.homeStretch.forEach((coord, idx) => {
            path.push({
                type: 'homeStretch',
                step: idx + 1,
                r: coord.r,
                c: coord.c,
                isSafe: true
            });
        });

        // 1 final center Home step (Step 56)
        path.push({
            type: 'home',
            step: 6,
            r: conf.homeCenter.r,
            c: conf.homeCenter.c,
            isSafe: true
        });

        return path;
    }

    static isSafeTile(trackIndex) {
        return SAFE_INDICES.includes(trackIndex);
    }
}

window.COLOR_CONFIG = COLOR_CONFIG;
window.TRACK_COORDS = TRACK_COORDS;
window.SAFE_INDICES = SAFE_INDICES;
window.STAR_INDICES = STAR_INDICES;
window.BoardHelper = BoardHelper;

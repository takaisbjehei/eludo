# 👑 eLudo - Full-Screen Royal Board Game with Stealth Companion

An HTML5/CSS3/JavaScript full-screen Ludo game built with authentic rules, 3D animated dice, responsive design matching royal tournament layouts, and a **Secret Mobile Companion Remote Controller** that connects from a second phone over the internet with **NO database required**.

---

## 🌟 Key Features

1. **Exact Visual Match**:
   - 15x15 board with colors matching the reference image: Red (Top-Left), Green (Top-Right), Blue (Bottom-Left), Yellow (Bottom-Right).
   - Custom sleek pin-marker style tokens with metallic borders and glowing pulse animations.
   - Safe star squares ($\bigstar$), starting entry arrows, and center home triangles.

2. **Authentic Ludo Rules**:
   - **Yard Exit**: Roll a **6** to bring pawns onto the board.
   - **Extra Rolls**: Rolling a 6, capturing an enemy pawn, or bringing a pawn home awards an extra turn.
   - **3x 6s Penalty**: Rolling three consecutive sixes forfeits the turn.
   - **Captures**: Landing on an opponent sends them back to their yard. Safe star squares protect tokens from capture.
   - **Home Entry**: Exact roll required to reach the center Home.
   - **Podium Victory**: 1st, 2nd, and 3rd rank tracker with confetti celebration.

3. **📱 Secret Mobile Companion Remote (Phone 2 -> Phone 1)**:
   - **No Database Needed!** Connects in real-time using WebRTC (PeerJS) & BroadcastChannel over 4G/5G/Wi-Fi.
   - On **Phone 1 (Main Game)**: Open your Vercel link and play in full-screen. A subtle 4-digit code (e.g. `#4829`) appears in the top navigation.
   - On **Phone 2 (Your Secret Remote)**: Open `/controller.html#room=4829` (or scan the QR code).
   - Secretly tap **1, 2, 3, 4, 5, 6** (or **Fair Random**) on Phone 2. The 3D dice on Phone 1 will naturally roll and land on that exact number with full realistic 3D physics!
   - Includes a **Stealth Fake Calculator Mode** on Phone 2 so nobody peeking at your screen suspects anything.
   - **Keyboard Shortcuts on Host**: Pressing keys `1`–`6` on your physical keyboard also secretly queues that dice roll.

4. **Game Modes**:
   - 2 Players (Red vs Yellow) or 4 Players (Red, Green, Yellow, Blue).
   - Toggle any player slot between **Human** and **Smart AI Bot**.

---

## 🚀 How to Deploy on Vercel (100% Free & Zero Setup)

1. Push this folder to your GitHub repository (or upload directly to [vercel.com](https://vercel.com)).
2. Import the repository into **Vercel**.
3. Framework Preset: **Other** / **Static Site** (no build command needed).
4. Click **Deploy**!

---

## 🎮 How to Play with 2 Phones

1. **On Phone 1 (Main Playing Device / Shared Screen)**:
   - Open your Vercel URL (e.g. `https://your-eludo.vercel.app`).
   - Tap **⛶ Fullscreen**.
   - Note the 4-digit room code in the top header (e.g., `#4829`).
2. **On Phone 2 (Your Secret Controller)**:
   - Open `https://your-eludo.vercel.app/controller.html#room=4829`.
   - The indicator turns 🟢 **Paired**.
   - Pick any number `1` to `6` to force the next roll, or tap **⚡ Secret Roll Main Screen** to trigger the roll remotely!

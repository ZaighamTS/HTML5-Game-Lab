# Required Sound Files

This folder should contain the following sound files for all games to work properly.

## Existing Sounds (5 files)
- ✅ `break.wav` - Used by Breakout (brick breaking)
- ✅ `lose.wav` - Used by Breakout (life lost)
- ✅ `paddle.wav` - Used by Breakout, Pong, Pong-2P (paddle hit)
- ✅ `score.wav` - Used by Pong, Pong-2P, Flappy (scoring)
- ✅ `wall.wav` - Used by Pong, Pong-2P (wall bounce)

## New Sounds Required (7 files)

### For Flappy Game (4 sounds)
- ⚠️ `flap.wav` - Bird wing flap sound (plays on space/tap)
- ✅ `score.wav` - Already exists (reused for passing pipes)
- ⚠️ `hit.wav` - Collision sound (pipe or ground hit)
- ⚠️ `gameover.wav` - Game over sound effect

### For Whack-a-Mole Game (4 sounds)
- ⚠️ `hit.wav` - Normal mole hit sound
- ⚠️ `bad.wav` - Bad mole hit sound (negative feedback)
- ⚠️ `golden.wav` - Golden mole hit sound (special reward)
- ⚠️ `miss.wav` - Miss click sound (wrong click)

## Total Sound Files Needed
- **Current:** 5 files
- **New:** 7 files (note: `hit.wav` is shared by Flappy and Whack)
- **Total:** 11 unique sound files

## Sound File Recommendations

### Flappy Sounds:
- `flap.wav` - Short, light "whoosh" or wing flap sound (~0.1-0.3s)
- `hit.wav` - Sharp collision/thud sound (~0.2-0.4s)
- `gameover.wav` - Sad/defeat sound (~0.5-1s)

### Whack-a-Mole Sounds:
- `hit.wav` - Satisfying "thump" or "pop" sound (~0.1-0.2s)
- `bad.wav` - Negative "buzz" or "error" sound (~0.2-0.3s)
- `golden.wav` - Special "chime" or "coin" sound (~0.3-0.5s)
- `miss.wav` - Subtle "whoosh" or "miss" sound (~0.1-0.2s)

## Implementation Status
- ✅ Code implemented in both games
- ⚠️ Sound files need to be added to this folder
- Once files are added, sounds will automatically work


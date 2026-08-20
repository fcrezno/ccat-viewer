// GENERATED from clanker-arena/data/script.json — do not edit by hand.
//
// The fight's spoken lines, copied word for word from the main game so the
// preview sounds like the real thing. 104 battle lines in 18 decks.
//
// Tokens are the owner's: {cat} {foe} {winner} {loser} {move} {turf} {perk}.
// Rules that travel with this text: never put a damage number in a line, and do
// not name the winner before the KO line.

export type ScriptLine = { text: string; style: string }

export const BATTLE: Record<string, ScriptLine[]> = {
  "arena": [
    { text: "ARENA: {turf}", style: "" },
    { text: "{cat}'s ARENA: {turf}", style: "" },
  ],
  "homeTurf": [
    { text: "{cat} fights on homefield advantage!", style: "" },
    { text: "{cat} feels right at home!", style: "" },
  ],
  "perk": [
    { text: "{perk}!", style: "" },
    { text: "{cat}'s {perk}!", style: "" },
  ],
  "move": [
    { text: "{cat} used {move}!", style: "" },
    { text: "{cat}'s {move}!", style: "" },
  ],
  "hesitate": [
    { text: "{cat} hesitated...", style: "" },
    { text: "{cat}'s heart wavered..", style: "" },
    { text: "{cat} isn't feeling too sure..", style: "" },
    { text: "{cat} second-guessed it.", style: "" },
    { text: "{cat} froze up!", style: "" },
    { text: "{cat} lost the plot.", style: "" },
    { text: "{cat} forgot what it was doing.", style: "" },
  ],
  "miss": [
    { text: "It missed!", style: "" },
    { text: "It dodged!!", style: "" },
    { text: "HOW DO YOU MISS THAT!?", style: "" },
    { text: "HE MISSED?! IT WAS RIGHT THERE!!!", style: "" },
    { text: "Swing and a miss!", style: "" },
    { text: "Nothing but air!", style: "" },
    { text: "Not even close!", style: "" },
    { text: "WIDE!", style: "" },
    { text: "uh oh", style: "" },
    { text: "Can't touch me!", style: "" },
    { text: "OOOOH so close!", style: "" },
  ],
  "critBoth": [
    { text: "DOUBLE YEEEEEEEEEEOWCH!!!", style: "" },
    { text: "OH MY GOODNESS!!", style: "" },
    { text: "ABSOLUTELY DEVASTATING!", style: "" },
    { text: "THAT SHOULD BE ILLEGAL!", style: "" },
    { text: "A SAVAGE HIT!", style: "" },
  ],
  "crit": [
    { text: "YEEEEEEEEEEOWCH!!!", style: "" },
    { text: "RIGHT IN THE WHISKERS!", style: "" },
    { text: "MOM GET THE CAMERA!", style: "" },
    { text: "67", style: "" },
    { text: "DIRECT HIT!", style: "" },
    { text: "CRIT!", style: "" },
    { text: "ow.", style: "" },
  ],
  "speedCrit": [
    { text: "BLIZTD!", style: "" },
    { text: "CLEAN HIT!", style: "" },
    { text: "SHARP!!", style: "" },
    { text: "PERFECT TIMING!", style: "" },
    { text: "SLICE AND DICED!", style: "" },
  ],
  "weak": [
    { text: "WEAK..", style: "" },
    { text: "What was that?", style: "" },
    { text: "Barely felt it.", style: "" },
    { text: "walked right through that.", style: "" },
    { text: "That did nothing!", style: "" },
    { text: "Huh?", style: "" },
    { text: "All you got?", style: "" },
    { text: "nani?", style: "" },
  ],
  "endure": [
    { text: "SECOND WIND!! {cat} hangs on by a thread!", style: "" },
    { text: "{cat} REFUSES TO GO DOWN!", style: "" },
    { text: "HOW IS {cat} STILL UP?!", style: "" },
    { text: "ONE PIXEL!!!", style: "" },
  ],
  "down": [
    { text: "{cat} is down!", style: "" },
    { text: "DOWN GOES {cat}!", style: "" },
    { text: "{cat} IS OUT!", style: "" },
    { text: "AND THAT IS THE END OF {cat}!", style: "" },
    { text: "{cat} WILL NOT BE GETTING UP!", style: "" },
    { text: "IT'S OVER FOR {cat}!", style: "" },
    { text: "GOOD GAME!", style: "" },
    { text: "GAME!!", style: "" },
    { text: "ggez", style: "" },
    { text: "izi", style: "" },
  ],
  "win": [
    { text: "{cat} wins!", style: "" },
    { text: "{cat} TAKES IT!", style: "" },
    { text: "YOUR WINNER: {cat}!", style: "" },
    { text: "{cat} WINS THIS BOUT!", style: "" },
    { text: "{cat} SURVIVES!", style: "" },
    { text: "Winner: {cat}!! ", style: "" },
  ],
  "lowHp": [
    { text: "{cat} IS BARELY STANDING!", style: "" },
    { text: "ONE MORE HIT!", style: "announce" },
    { text: "{cat} IS ON THEIR LAST LEGS!", style: "" },
    { text: "{cat} IS HANGING BY A THREAD!", style: "" },
    { text: "SOMEBODY STOP THE FIGHT!", style: "" },
    { text: "{cat} CANNOT TAKE ANOTHER!", style: "" },
  ],
  "comeback": [
    { text: "WHAT A COMEBACK! {cat} HAD NOTHING LEFT!", style: "" },
    { text: "{cat} WON THAT ON FUMES!", style: "" },
    { text: "FROM NOWHERE! {cat} TAKES IT!", style: "" },
    { text: "NOBODY SAW THAT COMING!", style: "" },
    { text: "{cat} STOLE IT!", style: "" },
    { text: "WRITTEN IN THE HISTORY BOOKS!", style: "" },
    { text: "CLIP THAT!", style: "" },
  ],
  "flawless": [
    { text: "NOT A SCRATCH ON {cat}!", style: "" },
    { text: "{cat} DIDN'T EVEN BREAK A SWEAT!", style: "" },
    { text: "UNTOUCHED!", style: "" },
    { text: "A CLINIC FROM {cat}!", style: "" },
    { text: "{cat} MADE THAT LOOK EASY!", style: "" },
    { text: "PERFECT!", style: "" },
    { text: "FLAWLESS VICTORY.", style: "" },
    { text: "Flawless victory, NOW DO IT AGAIN!", style: "" },
  ],
  "quickWin": [
    { text: "THAT WAS OVER BEFORE IT STARTED!", style: "" },
    { text: "BLINK AND YA MISSED IT!", style: "" },
    { text: "DID EVERYONE SEE THAT?!", style: "" },
    { text: "WE ARE ALREADY DONE!", style: "" },
    { text: "SHORTEST FIGHT OF THE DAY!", style: "" },
    { text: "...what", style: "" },
  ],
  "longFight": [
    { text: "THESE TWO WILL NOT QUIT!", style: "" },
    { text: "SOMEBODY END THIS!", style: "" },
    { text: "HOW ARE THEY BOTH STILL UP?!", style: "" },
    { text: "THE CREW WANTS TO GO HOME!", style: "" },
    { text: "THIS IS AN ENDURANCE TEST!", style: "" },
    { text: "ITS A STALEMATE.. someone get me popcorn..!!", style: "" },
  ],
}

export const OUTCOMES: Record<string, ScriptLine[]> = {
  "crit": [
    { text: "Critical Hit!", style: "" },
    { text: "Right on the button!", style: "" },
    { text: "That one counted.", style: "" },
  ],
  "weak": [
    { text: "Not really strong...", style: "" },
    { text: "Barely felt it.", style: "" },
    { text: "Shrugged off.", style: "" },
  ],
  "miss": [
    { text: "Miss!", style: "" },
    { text: "Just missed!", style: "" },
    { text: "Nothing but air..", style: "" },
    { text: "Swing and a miss!", style: "" },
  ],
}

/** A deck, or an empty one. */
export const deck = (k: string): ScriptLine[] => BATTLE[k] ?? []

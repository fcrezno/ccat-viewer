// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * IdleAutoRun — ClankerCats Idle Clank
 *
 * Players pay $CLKCAT to run their idle game automatically.
 * Payments split: 80% prize pool, 20% treasury.
 * At season end, owner snapshots top players and they claim from the prize pool.
 */
contract IdleAutoRun {

    // ── Config ──────────────────────────────────────────────────────────────

    IERC20 public immutable CLKCAT;
    address public treasury;
    address public owner;

    uint256 public constant PRIZE_BPS  = 8000; // 80%
    uint256 public constant TREASURY_BPS = 2000; // 20%

    // Tier costs in $CLKCAT (18 decimals)
    uint256[3] public tierCosts = [
        100_000 ether,  // 6 hours
        250_000 ether,  // 12 hours
        500_000 ether   // 24 hours
    ];

    uint64[3] public tierDurations = [
        6  hours,
        12 hours,
        24 hours
    ];

    // ── Season ───────────────────────────────────────────────────────────────

    uint256 public season;
    uint256 public seasonEndsAt;
    uint256 public prizePool;

    // season → player → score (set by owner at snapshot)
    mapping(uint256 => mapping(address => uint256)) public scores;
    // season → player → claimed
    mapping(uint256 => mapping(address => bool)) public claimed;
    // season → total score (for proportional split)
    mapping(uint256 => uint256) public totalScore;

    // ── Auto-run sessions ────────────────────────────────────────────────────

    struct Session {
        uint64 startedAt;
        uint64 expiresAt;
        uint8  tier;
    }

    mapping(address => Session) public sessions;

    // ── Events ───────────────────────────────────────────────────────────────

    event AutoRunStarted(address indexed player, uint8 tier, uint64 expiresAt, uint256 season);
    event SeasonStarted(uint256 indexed season, uint256 endsAt);
    event ScoresSubmitted(uint256 indexed season, address[] players, uint256[] scores);
    event Claimed(address indexed player, uint256 indexed season, uint256 amount);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address _clkcat, address _treasury) {
        CLKCAT    = IERC20(_clkcat);
        treasury  = _treasury;
        owner     = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ── Player actions ───────────────────────────────────────────────────────

    /**
     * Pay $CLKCAT to start an auto-run session.
     * @param tier 0 = 6hrs, 1 = 12hrs, 2 = 24hrs
     */
    function startAutoRun(uint8 tier) external {
        require(tier < 3, "invalid tier");
        require(block.timestamp >= sessions[msg.sender].expiresAt, "session already active");
        require(seasonEndsAt > block.timestamp, "no active season");

        uint256 cost = tierCosts[tier];

        // Split payment
        uint256 toPrize    = (cost * PRIZE_BPS)    / 10_000;
        uint256 toTreasury = (cost * TREASURY_BPS) / 10_000;

        require(CLKCAT.transferFrom(msg.sender, address(this), toPrize),    "prize transfer failed");
        require(CLKCAT.transferFrom(msg.sender, treasury, toTreasury), "treasury transfer failed");

        prizePool += toPrize;

        uint64 expiry = uint64(block.timestamp) + tierDurations[tier];
        sessions[msg.sender] = Session({
            startedAt: uint64(block.timestamp),
            expiresAt: expiry,
            tier:      tier
        });

        emit AutoRunStarted(msg.sender, tier, expiry, season);
    }

    /**
     * Claim prize share after owner submits scores.
     */
    function claim(uint256 _season) external {
        require(_season < season, "season not ended");
        require(!claimed[_season][msg.sender], "already claimed");
        uint256 score = scores[_season][msg.sender];
        require(score > 0, "no score");

        claimed[_season][msg.sender] = true;

        uint256 share = (prizePool * score) / totalScore[_season];
        require(CLKCAT.transfer(msg.sender, share), "transfer failed");

        emit Claimed(msg.sender, _season, share);
    }

    // ── Read helpers ─────────────────────────────────────────────────────────

    function isActive(address player) external view returns (bool) {
        return block.timestamp < sessions[player].expiresAt;
    }

    function remainingSecs(address player) external view returns (uint256) {
        if (block.timestamp >= sessions[player].expiresAt) return 0;
        return sessions[player].expiresAt - block.timestamp;
    }

    function getSession(address player) external view returns (Session memory) {
        return sessions[player];
    }

    // ── Owner actions ─────────────────────────────────────────────────────────

    function startSeason(uint256 durationSecs) external onlyOwner {
        season++;
        seasonEndsAt = block.timestamp + durationSecs;
        emit SeasonStarted(season, seasonEndsAt);
    }

    /**
     * Submit leaderboard scores at season end.
     * Score = kills * 10 + zone * 100 (computed off-chain, submitted by owner).
     */
    function submitScores(
        uint256 _season,
        address[] calldata players,
        uint256[] calldata _scores
    ) external onlyOwner {
        require(_season == season, "wrong season");
        require(block.timestamp >= seasonEndsAt, "season not ended");
        require(players.length == _scores.length, "length mismatch");

        uint256 total = 0;
        for (uint256 i = 0; i < players.length; i++) {
            scores[_season][players[i]] = _scores[i];
            total += _scores[i];
        }
        totalScore[_season] = total;

        emit ScoresSubmitted(_season, players, _scores);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setTierCosts(uint256[3] calldata costs) external onlyOwner {
        tierCosts = costs;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}

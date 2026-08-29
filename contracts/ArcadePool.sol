// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ArcadePool — entries in, prizes out, nothing minted.
 *
 * Successor to IdleClankPool.sol, which cannot safely hold a token that takes a
 * fee on transfer. Deploy fresh: the token address is fixed in the constructor
 * and there is no setter, by design.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 *
 * The arcade model. A cat is the ticket that lets you enter; the entry is paid
 * in fBOMB; the pool pays winners out of what came in. NOTHING IS EVER MINTED —
 * `require(total <= prizePool)` is the whole economy, and it is the line that
 * separates this from every emissions scheme that has killed a game token.
 *
 * ── WHY IT DOES NOT BURN ANYTHING ITSELF ─────────────────────────────────────
 *
 * fBOMB burns on transfer. Measured on Base rather than assumed: of 23
 * transactions in a three-hour window, 14 carried a paired Transfer to the zero
 * address. So an entry already burns on its way in and a prize burns on its way
 * out, with no help from this contract.
 *
 * Adding a burn here would tax the player TWICE for one action. The deflation is
 * the token's job and it is already doing it.
 *
 * ── THE BUG THIS EXISTS TO FIX ───────────────────────────────────────────────
 *
 * IdleClankPool credited the amount SENT rather than the amount RECEIVED:
 *
 *     token.transferFrom(msg.sender, address(this), amount);
 *     prizePool += amount;                    // wrong for a fee-on-transfer token
 *
 * With a 1% burn, funding 100 delivers 99 and records 100. Every entry
 * over-credits, and nothing complains — until `distributePrizes` passes its
 * ceiling check against an inflated number and then reverts on a transfer the
 * contract cannot cover. THE WHOLE DISTRIBUTION FAILS, at season end, with
 * winners watching. It is the worst possible moment for it to surface.
 *
 * Measuring the balance either side of the transfer is correct for a fee of any
 * size, including none, and it stays correct if the fee ever changes — which
 * matters here, because fBOMB is an upgradeable proxy and its behaviour is not
 * frozen.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    /// Required for the balance-delta accounting above. Absent from the old interface.
    function balanceOf(address account) external view returns (uint256);
}

contract ArcadePool {
    address public owner;
    IERC20  public immutable token;

    uint256 public prizePool;
    bool    public seasonActive;
    uint256 public seasonNumber;

    /*
     * Prizes are sent in a loop to addresses the owner supplies. A plain ERC-20
     * cannot re-enter, but this pool is built for a token behind an UPGRADEABLE
     * proxy, so its behaviour is not fixed for the life of this contract. The
     * guard costs one storage slot and removes the question.
     */
    uint256 private _lock = 1;
    modifier noReentry() {
        require(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    event SeasonStarted(uint256 indexed season);
    event SeasonEnded(uint256 indexed season);
    /// `credited` is what the pool actually received, which a fee makes smaller than what was sent.
    event Funded(address indexed from, uint256 sent, uint256 credited);
    event PrizeSent(address indexed winner, uint256 amount, uint256 indexed season);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _token) {
        require(_token != address(0), "token is zero");
        owner = msg.sender;
        token = IERC20(_token);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner is zero");
        owner = newOwner;
    }

    function startSeason() external onlyOwner {
        require(!seasonActive, "season already active");
        seasonActive = true;
        seasonNumber++;
        emit SeasonStarted(seasonNumber);
    }

    /**
     * Pay an entry, or top the pool up. Anyone may call it.
     *
     * The pool is credited with what ARRIVED, not what was sent. See the note at
     * the top of this file for what goes wrong otherwise.
     */
    function fundRewards(uint256 amount) external noReentry {
        require(seasonActive, "no active season");
        require(amount > 0, "amount is zero");

        uint256 before = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        uint256 credited = token.balanceOf(address(this)) - before;

        // A token that delivers nothing is either broken or taxing at 100%.
        require(credited > 0, "nothing received");

        prizePool += credited;
        emit Funded(msg.sender, amount, credited);
    }

    /**
     * Pay the winners. The total may never exceed what came in.
     *
     * `amounts` are what the pool SENDS. A burning token means each winner
     * receives slightly less, so publish prizes net or somebody will reasonably
     * think they were shorted.
     */
    function distributePrizes(address[] calldata winners, uint256[] calldata amounts)
        external
        onlyOwner
        noReentry
    {
        require(seasonActive, "no active season");
        require(winners.length == amounts.length, "length mismatch");

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) total += amounts[i];
        require(total <= prizePool, "exceeds pool");

        /*
         * The accounting above can only be right if the tokens are really here.
         * Checked explicitly so a shortfall reports itself plainly instead of
         * arriving as a failed transfer part-way through the loop.
         */
        require(token.balanceOf(address(this)) >= total, "pool short of tokens");

        // Effects before interactions: the pool is debited before anything is sent.
        prizePool -= total;

        for (uint256 i = 0; i < winners.length; i++) {
            require(winners[i] != address(0), "winner is zero");
            require(token.transfer(winners[i], amounts[i]), "transfer failed");
            emit PrizeSent(winners[i], amounts[i], seasonNumber);
        }
    }

    function endSeason() external onlyOwner {
        require(seasonActive, "no active season");
        seasonActive = false;
        emit SeasonEnded(seasonNumber);
    }

    /**
     * Emergency exit.
     *
     * Deliberately unchanged in spirit from the original: the owner can recover
     * tokens, and `prizePool` is floored at zero rather than underflowing. It is
     * a trapdoor, and it is worth knowing it exists — a pool the owner can empty
     * is a pool players are trusting the owner with.
     */
    function withdraw(uint256 amount) external onlyOwner noReentry {
        require(token.transfer(owner, amount), "transfer failed");
        prizePool = amount <= prizePool ? prizePool - amount : 0;
    }
}

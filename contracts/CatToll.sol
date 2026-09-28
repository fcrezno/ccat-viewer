// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBUN {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function burn(uint256 amount) external;
}

/**
 * CatToll — BUN in, split five ways, nobody can change the shares.
 *
 * JP, 2026-09-21: "instead of just burning why not do something like a 30-30-40
 * split; 30 goes toward agents; 30% to me and the rest is burned." Then: "there
 * are 3 agents."
 *
 *      10% + 10% + 10%   the three agents, an even cut of the agents' 30
 *      30%               the creator
 *      40% and all dust  burnt
 *
 * THE EVEN CUT IS AN ASSUMPTION. "30 toward agents" with three agents reads as
 * ten each, and that is what is compiled in. Uneven shares are a one-line change
 * to the four constants below, but only BEFORE deploy — after that they are
 * fixed forever, which is the point of them.
 *
 * ── WHY A PLAYER NEVER CALLS THIS CONTRACT ───────────────────────────────────
 *
 * BUN has no permit(). DOMAIN_SEPARATOR(), nonces() and eip712Domain() all
 * revert, so there is no signed approval. A pull-payment would therefore cost a
 * player TWO transactions — approve, then pay — and the first one does nothing
 * they can see.
 *
 * So a player does not call anything here. They send BUN to this address with an
 * ordinary transfer, which is one transaction and the thing their wallet already
 * knows how to do. The backend reads that Transfer log as the receipt and signs
 * the mint voucher. Nothing needs to happen here first.
 *
 * settle() then divides whatever has arrived. It is deliberately separate from
 * paying: a player should never carry the gas for somebody else's accounting.
 *
 * ── WHY THE SHARES CANNOT MOVE ───────────────────────────────────────────────
 *
 * Every address is `immutable` and there is no owner, no setter and no pause.
 * The split is compiled in. That is the entire trust story, and it is the reason
 * this is a contract rather than a treasury wallet: a wallet asks people to
 * believe a promise, this one does not have to be believed.
 *
 * ROUNDING FAVOURS THE BURN. The four shares are computed and the REMAINDER is
 * burnt, so no rounding dust can ever land on a person's side.
 *
 * ── THE TRADE THIS MAKES ─────────────────────────────────────────────────────
 *
 * No owner means no rescue. A different token sent here is stuck forever. That
 * is the price of nobody being able to redirect the split, and it is the right
 * way round for a contract that handles other people's payments.
 */
contract CatToll {
    IBUN    public immutable bun;
    address public immutable agent1;
    address public immutable agent2;
    address public immutable agent3;
    address public immutable creator;

    uint256 public constant AGENT_BPS   = 1000;   // 10% each, 30% together
    uint256 public constant CREATOR_BPS = 3000;   // 30%
    // the remainder, 40% plus any dust, is burnt

    uint256 public totalSettled;

    event Settled(uint256 perAgent, uint256 toCreator, uint256 burned);

    error ZeroAddress();
    error DuplicateAgent();
    error NothingToSettle();
    error TransferFailed();

    constructor(address _bun, address _agent1, address _agent2, address _agent3, address _creator) {
        if (_bun == address(0) || _agent1 == address(0) || _agent2 == address(0)
            || _agent3 == address(0) || _creator == address(0)) revert ZeroAddress();

        /*
         * Three agents must be three addresses. A repeated one would silently
         * pay somebody twice, and there is no way to correct it afterwards —
         * so it is refused here rather than discovered later.
         */
        if (_agent1 == _agent2 || _agent1 == _agent3 || _agent2 == _agent3) revert DuplicateAgent();

        bun     = IBUN(_bun);
        agent1  = _agent1;
        agent2  = _agent2;
        agent3  = _agent3;
        creator = _creator;
    }

    /**
     * @notice Split everything this contract holds: 10% to each agent, 30% to
     *         the creator, the rest burnt. Callable by anyone — there is nothing
     *         to abuse, because every destination is fixed at deploy.
     */
    function settle() external returns (uint256 perAgent, uint256 toCreator, uint256 burned) {
        uint256 bal = bun.balanceOf(address(this));
        if (bal == 0) revert NothingToSettle();

        perAgent  = (bal * AGENT_BPS)   / 10_000;
        toCreator = (bal * CREATOR_BPS) / 10_000;
        burned    = bal - (perAgent * 3) - toCreator;   // takes the dust

        totalSettled += bal;

        if (!bun.transfer(agent1,  perAgent))  revert TransferFailed();
        if (!bun.transfer(agent2,  perAgent))  revert TransferFailed();
        if (!bun.transfer(agent3,  perAgent))  revert TransferFailed();
        if (!bun.transfer(creator, toCreator)) revert TransferFailed();

        /*
         * A real burn, not a transfer to 0x…dEaD. BUN exposes burn(uint256) and
         * it was checked against a live holder before this contract was written,
         * so totalSupply actually falls. Parking tokens at a dead address only
         * looks like a burn on a chart.
         */
        bun.burn(burned);

        emit Settled(perAgent, toCreator, burned);
    }

    /** What settle() would pay out right now. */
    function pending() external view returns (uint256 perAgent, uint256 toCreator, uint256 burned) {
        uint256 bal = bun.balanceOf(address(this));
        perAgent  = (bal * AGENT_BPS)   / 10_000;
        toCreator = (bal * CREATOR_BPS) / 10_000;
        burned    = bal - (perAgent * 3) - toCreator;
    }
}

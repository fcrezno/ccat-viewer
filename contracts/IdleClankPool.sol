// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract IdleClankPool {
    address public owner;
    IERC20  public token;

    uint256 public prizePool;
    bool    public seasonActive;
    uint256 public seasonNumber;

    event SeasonStarted(uint256 indexed season);
    event SeasonEnded(uint256 indexed season);
    event Funded(address indexed from, uint256 amount);
    event PrizeSent(address indexed winner, uint256 amount, uint256 indexed season);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _token) {
        owner = msg.sender;
        token = IERC20(_token);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function startSeason() external onlyOwner {
        require(!seasonActive, "season already active");
        seasonActive = true;
        seasonNumber++;
        emit SeasonStarted(seasonNumber);
    }

    function fundRewards(uint256 amount) external {
        require(seasonActive, "no active season");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        prizePool += amount;
        emit Funded(msg.sender, amount);
    }

    // Pay out winners — arrays must be same length, total must not exceed prizePool
    function distributePrizes(address[] calldata winners, uint256[] calldata amounts) external onlyOwner {
        require(seasonActive, "no active season");
        require(winners.length == amounts.length, "length mismatch");
        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) total += amounts[i];
        require(total <= prizePool, "exceeds pool");
        prizePool -= total;
        for (uint256 i = 0; i < winners.length; i++) {
            require(token.transfer(winners[i], amounts[i]), "transfer failed");
            emit PrizeSent(winners[i], amounts[i], seasonNumber);
        }
    }

    function endSeason() external onlyOwner {
        require(seasonActive, "no active season");
        seasonActive = false;
        emit SeasonEnded(seasonNumber);
    }

    // Emergency withdrawal of any remaining tokens
    function withdraw(uint256 amount) external onlyOwner {
        require(token.transfer(owner, amount), "transfer failed");
        if (amount <= prizePool) prizePool -= amount;
        else prizePool = 0;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ClankerCatsV3 — the Robinhood Chain drop. Free to mint, one per wallet; burn
 * BUN through a cat and it becomes a BunBurner (see burnBun).
 *
 * The "WHAT REPLACES IT" note below describes the original play-to-mint gate.
 * Since 2026-09-28 the backend signs the voucher without a run (RUN_DOOR in
 * lib/mintv3.ts); the contract does not care why a voucher was signed.
 *
 * Same shape as ClankerCatsV2, which is deployed and working on Base. The ONLY
 * real change is what a voucher is issued for, so the diff is small on purpose:
 * a fresh ERC-721 written from scratch would be a bigger risk than reusing one
 * that has been live and holding 1111 tokens.
 *
 * ── WHY NOT GATE ON A FARCASTER ID ───────────────────────────────────────────
 *
 * V2's header says it plainly: gating on FID means farming the drop needs real
 * Farcaster accounts, not just fresh wallets. That is the stronger guarantee and
 * it is GIVEN UP HERE, deliberately.
 *
 * Robinhood Chain has no Farcaster context. A fid gate would lock out exactly
 * the audience this collection exists to reach, so it gates on the wallet, and
 * a wallet is free to make.
 *
 * ── WHAT REPLACES IT ─────────────────────────────────────────────────────────
 *
 * The backend only signs a voucher for a wallet that has finished a gauntlet
 * run. The server picks every seed and reveals one round at a time, so a run
 * cannot be fast-forwarded or re-rolled — it costs the minutes it takes to play
 * five fights. Farming the drop therefore costs TIME per wallet rather than
 * being free, and once Robinhood Chain stops subsidising gas it costs gas too.
 *
 * That is weaker than the fid gate and it is written down rather than implied.
 *
 * ── THIS MAPPING IS THE SPENT-TICKET STORE ───────────────────────────────────
 *
 * lib/ticket.ts warns that a signed run can be REPLAYED, because remembering a
 * spent one needs a database the app does not have — and that before a run pays
 * out automatically, something has to close that hole. A mint is an automatic
 * payout, so `minted` is that something. Replay a run all you like: the second
 * voucher is for a wallet this contract has already served, and it reverts.
 *
 * V1 (0xbE76Ce3cE0966fedA606fCF70884dae8FBaa7FCF) and V2
 * (0x5C5b928f937F63656BE62d0A45f4Db756b79934B) are both on Base and untouched.
 */
contract ClankerCatsV3 {
    // ── metadata ───────────────────────────────────────────────────────────────
    string public name   = "Clanker Cats V3";
    string public symbol = "CLANKER3";

    string public baseURI;
    string public contractURI;

    // ── supply ─────────────────────────────────────────────────────────────────
    uint256 public immutable maxSupply;
    uint256 public totalSupply;

    // ── access ─────────────────────────────────────────────────────────────────
    address public owner;
    address public signer;      // backend key that authorises mints
    bool    public mintOpen;

    // ── royalties (ERC2981) ────────────────────────────────────────────────────
    address public royaltyReceiver;
    uint96  public royaltyBps;  // out of 10_000

    // ── ERC721 storage ─────────────────────────────────────────────────────────
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    /// Wallet → has already minted. Also the spent-ticket store; see the header.
    mapping(address => bool) public minted;

    // ── BunBurner ──────────────────────────────────────────────────────────────
    //
    // JP, 2026-09-28: the mint is free; burning BUN is optional, "but if they do
    // they get something special" — the BunBurner trait — and BunBurners will
    // probably get the whitelist for the BUN Cat collection that comes next.
    //
    // So the mark lives HERE, on chain, where a later contract or a snapshot can
    // read it without trusting any server. `bunBurner` travels with the cat; the
    // BunBurner event also names the wallet that paid, so a whitelist can be
    // built either way later.
    //
    // Token, destination and price are immutable: nobody can reprice the burn or
    // redirect it after deploy. The destination is the CatToll, which splits
    // 30% agents / 30% creator / 40% burned by code nobody can change.
    address public immutable bun;
    address public immutable bunToll;
    uint256 public immutable bunBurnPrice;

    /// Token → has burned BUN through this cat. Permanent; once per cat.
    mapping(uint256 => bool) public bunBurner;

    // ── EIP-712 ────────────────────────────────────────────────────────────────
    bytes32 private constant MINT_TYPEHASH =
        keccak256("Mint(address to,uint256 deadline)");
    bytes32 private immutable DOMAIN_SEPARATOR;

    // ── events ─────────────────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Minted(uint256 indexed tokenId, address indexed to);
    event MintOpenSet(bool open);
    event SignerSet(address signer);
    event BaseURISet(string baseURI);
    event BunBurner(uint256 indexed tokenId, address indexed burner, uint256 amount);
    /// ERC-4906. Tells marketplaces a cat's metadata changed (it gained BunBurner).
    event MetadataUpdate(uint256 _tokenId);

    // ── errors ─────────────────────────────────────────────────────────────────
    error NotOwner();
    error MintClosed();
    error SoldOut();
    error AlreadyMinted();
    error VoucherExpired();
    error BadSignature();
    error ZeroAddress();
    error NonexistentToken();
    error NotOwnerOrApproved();
    error TransferFromIncorrectOwner();
    error TransferToNonERC721Receiver();
    error BadRoyalty();
    error AlreadyBunBurner();
    error BunBurnFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        uint256 _maxSupply,
        address _signer,
        string memory _baseURI,
        string memory _contractURI,
        address _royaltyReceiver,
        uint96  _royaltyBps,
        address _bun,
        address _bunToll,
        uint256 _bunBurnPrice
    ) {
        if (_royaltyBps > 10_000) revert BadRoyalty();
        if (_bun == address(0) || _bunToll == address(0)) revert ZeroAddress();

        bun          = _bun;
        bunToll      = _bunToll;
        bunBurnPrice = _bunBurnPrice;

        owner           = msg.sender;
        maxSupply       = _maxSupply;
        signer          = _signer;
        baseURI         = _baseURI;
        contractURI     = _contractURI;
        royaltyReceiver = _royaltyReceiver;
        royaltyBps      = _royaltyBps;

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("ClankerCatsV3")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ── mint ───────────────────────────────────────────────────────────────────

    /**
    /**
     * @notice Mint one cat. Requires a voucher signed by `signer` for the caller.
     *         One per wallet, forever.
     */
    function mint(uint256 deadline, bytes calldata signature) external returns (uint256 tokenId) {
        if (!mintOpen)                 revert MintClosed();
        if (totalSupply >= maxSupply)  revert SoldOut();
        if (minted[msg.sender])        revert AlreadyMinted();
        if (block.timestamp > deadline) revert VoucherExpired();

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(MINT_TYPEHASH, msg.sender, deadline))
        ));
        if (_recover(digest, signature) != signer) revert BadSignature();

        minted[msg.sender] = true;
        tokenId        = ++totalSupply;

        _owners[tokenId]     = msg.sender;
        _balances[msg.sender] += 1;

        emit Transfer(address(0), msg.sender, tokenId);
        emit Minted(tokenId, msg.sender);
    }

    /**
     * @notice Burn BUN through your cat and it becomes a BunBurner, for good.
     *         Optional — the mint is free without it. Only the cat's owner can,
     *         once per cat. Approve this contract for `bunBurnPrice` BUN first:
     *         BUN has no permit(), so that is a separate transaction.
     *
     *         The BUN goes straight from the owner to the CatToll, which pays the
     *         30/30/40 split when anyone calls its settle().
     */
    function burnBun(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwnerOrApproved();
        if (bunBurner[tokenId])             revert AlreadyBunBurner();

        // Effects before the external call, so a re-entrant BUN cannot mark twice.
        bunBurner[tokenId] = true;

        // transferFrom(owner, toll, price). Checked by hand rather than through an
        // interface so a token that returns nothing on success is still accepted.
        (bool ok, bytes memory ret) = bun.call(
            abi.encodeWithSelector(0x23b872dd, msg.sender, bunToll, bunBurnPrice)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert BunBurnFailed();

        emit BunBurner(tokenId, msg.sender, bunBurnPrice);
        emit MetadataUpdate(tokenId);
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        // reject malleable (high-s) signatures
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        if (v != 27 && v != 28) revert BadSignature();

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert BadSignature();
        return recovered;
    }

    // ── admin ──────────────────────────────────────────────────────────────────

    function setMintOpen(bool open) external onlyOwner {
        mintOpen = open;
        emit MintOpenSet(open);
    }

    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
        emit SignerSet(_signer);
    }

    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
        emit BaseURISet(_baseURI);
    }

    function setContractURI(string calldata _contractURI) external onlyOwner {
        contractURI = _contractURI;
    }

    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        if (bps > 10_000) revert BadRoyalty();
        royaltyReceiver = receiver;
        royaltyBps      = bps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ── ERC721 metadata ────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert NonexistentToken();
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        return (royaltyReceiver, (salePrice * royaltyBps) / 10_000);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd  // ERC721
            || interfaceId == 0x5b5e139f  // ERC721Metadata
            || interfaceId == 0x2a55205a  // ERC2981
            || interfaceId == 0x49064906  // ERC4906 (MetadataUpdate)
            || interfaceId == 0x01ffc9a7; // ERC165
    }

    // ── ERC721 core ────────────────────────────────────────────────────────────

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _owners[tokenId];
        if (o == address(0)) revert NonexistentToken();
        return o;
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return _balances[account];
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !_operatorApprovals[o][msg.sender]) revert NotOwnerOrApproved();
        _tokenApprovals[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_owners[tokenId] == address(0)) revert NonexistentToken();
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) external view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (to == address(0)) revert ZeroAddress();
        address o = ownerOf(tokenId);
        if (o != from) revert TransferFromIncorrectOwner();
        if (
            msg.sender != o &&
            msg.sender != _tokenApprovals[tokenId] &&
            !_operatorApprovals[o][msg.sender]
        ) revert NotOwnerOrApproved();

        delete _tokenApprovals[tokenId];
        _balances[from] -= 1;
        _balances[to]   += 1;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 ret) {
                if (ret != IERC721Receiver.onERC721Received.selector) revert TransferToNonERC721Receiver();
            } catch {
                revert TransferToNonERC721Receiver();
            }
        }
    }

    // ── util ───────────────────────────────────────────────────────────────────

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external returns (bytes4);
}

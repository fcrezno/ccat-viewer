// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ClankerCatsV2 — the free-mint follow-up to the original 200.
 *
 * Minting happens inside the Farcaster mini app. The app authenticates the user
 * with Quick Auth, the backend verifies that token and signs an EIP-712 voucher,
 * and this contract enforces **one mint per Farcaster ID** on-chain. Gating on FID
 * rather than wallet address means farming the drop requires real Farcaster
 * accounts, not just fresh wallets.
 *
 * V1 (0xbE76Ce3cE0966fedA606fCF70884dae8FBaa7FCF) is untouched by this contract
 * and stays capped at 200.
 */
contract ClankerCatsV2 {
    // ── metadata ───────────────────────────────────────────────────────────────
    string public name   = "Clanker Cats V2";
    string public symbol = "CLANKER2";

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

    /// Farcaster id → has already minted. The core anti-farming guarantee.
    mapping(uint256 => bool) public fidMinted;

    // ── EIP-712 ────────────────────────────────────────────────────────────────
    bytes32 private constant MINT_TYPEHASH =
        keccak256("Mint(address to,uint256 fid,uint256 deadline)");
    bytes32 private immutable DOMAIN_SEPARATOR;

    // ── events ─────────────────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Minted(uint256 indexed tokenId, address indexed to, uint256 indexed fid);
    event MintOpenSet(bool open);
    event SignerSet(address signer);
    event BaseURISet(string baseURI);

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
        uint96  _royaltyBps
    ) {
        if (_royaltyBps > 10_000) revert BadRoyalty();

        owner           = msg.sender;
        maxSupply       = _maxSupply;
        signer          = _signer;
        baseURI         = _baseURI;
        contractURI     = _contractURI;
        royaltyReceiver = _royaltyReceiver;
        royaltyBps      = _royaltyBps;

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("ClankerCatsV2")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ── mint ───────────────────────────────────────────────────────────────────

    /**
     * @notice Mint one cat. Requires a voucher signed by `signer` for this exact
     *         (recipient, fid) pair. The backend only issues one after verifying
     *         the caller's Quick Auth token, so `fid` cannot be spoofed client-side.
     */
    function mint(uint256 fid, uint256 deadline, bytes calldata signature) external returns (uint256 tokenId) {
        if (!mintOpen)                 revert MintClosed();
        if (totalSupply >= maxSupply)  revert SoldOut();
        if (fidMinted[fid])            revert AlreadyMinted();
        if (block.timestamp > deadline) revert VoucherExpired();

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(MINT_TYPEHASH, msg.sender, fid, deadline))
        ));
        if (_recover(digest, signature) != signer) revert BadSignature();

        fidMinted[fid] = true;
        tokenId        = ++totalSupply;

        _owners[tokenId]     = msg.sender;
        _balances[msg.sender] += 1;

        emit Transfer(address(0), msg.sender, tokenId);
        emit Minted(tokenId, msg.sender, fid);
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

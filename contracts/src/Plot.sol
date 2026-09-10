// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * A place in the world.
 *
 * There is no land registry here and no token for a plot, because neither is
 * needed: the plot *is* this contract's address. The address is its coordinates
 * — the map is the address space — and two addresses cannot collide, so nobody
 * can be moved off a spot and nobody has to be trusted to keep the record.
 *
 * The code is identical for every plot on purpose. Its hash is part of what
 * fixes the address, so if it varied, mining a location would mean mining for
 * one particular set of contents. What differs between one plot and the next is
 * what its owner puts into it.
 *
 * And what they can put into it is anything. A plot is a proxy: its owner
 * points it at an implementation — any contract they have written and deployed
 * — and from then on every call the plot does not answer itself is run as that
 * implementation's code, with the plot's own address, balance and storage. A
 * casino, a gallery, a game: it lives *here*, at this place. The owner can
 * point it somewhere else later, or seal it, after which the code can never
 * change again — which is the promise a casino's players want to see.
 *
 * The plot's own state lives in hashed storage slots (the EIP-1967 slots for
 * the implementation and the owner, a namespaced slot for the rest), so an
 * implementation may use ordinary storage from slot zero as any contract does,
 * and the two never meet.
 */
contract Plot {
    /// EIP-1967: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    /// EIP-1967: bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1)
    bytes32 private constant OWNER_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
    /// bytes32(uint256(keccak256("groundstate.plot.words")) - 1): the note, and the seal
    bytes32 private constant WORDS_SLOT = 0x9cd8f8100ccd357e601900697171708d60891808cd52063bf7e0fe7d3dc16ef9;

    struct Words {
        string note;
        /// `sealed` is a word Solidity keeps for itself
        bool forGood;
    }

    error NotOwner();
    error NoOwner();
    error NotAContract();
    error Sealed();
    error NoCode();

    event Inscribed(string note);
    event Transferred(address indexed from, address indexed to);
    event CodeSet(address indexed implementation);
    event SealedForGood();

    constructor() {
        _setOwner(Plots(msg.sender).claimant());
    }

    modifier onlyOwner() {
        if (msg.sender != owner()) revert NotOwner();
        _;
    }

    // --- what the plot itself answers ---------------------------------------

    function owner() public view returns (address who) {
        assembly {
            who := sload(OWNER_SLOT)
        }
    }

    function implementation() public view returns (address code) {
        assembly {
            code := sload(IMPLEMENTATION_SLOT)
        }
    }

    /// Whatever the owner has to say about the place. Label and shape both.
    function note() external view returns (string memory) {
        return _words().note;
    }

    /// Whether the code is fixed for good.
    function isSealed() external view returns (bool) {
        return _words().forGood;
    }

    function inscribe(string calldata text) external onlyOwner {
        _words().note = text;
        emit Inscribed(text);
    }

    /// Hand the place to somebody else. Not to nobody: ground with no owner is
    /// ground nobody can ever write into again.
    function transfer(address to) external onlyOwner {
        if (to == address(0)) revert NoOwner();
        emit Transferred(owner(), to);
        _setOwner(to);
    }

    /// Point the plot at code of the owner's own. Anything with code will do;
    /// address zero takes it back to being just a plot.
    function setCode(address code) external onlyOwner {
        if (_words().forGood) revert Sealed();
        if (code != address(0) && code.code.length == 0) revert NotAContract();
        assembly {
            sstore(IMPLEMENTATION_SLOT, code)
        }
        emit CodeSet(code);
    }

    /// Fix the code for good. Whoever deals with this place afterwards can be
    /// sure it will go on doing exactly what it does now.
    function seal() external onlyOwner {
        _words().forGood = true;
        emit SealedForGood();
    }

    // --- everything else is the implementation's -------------------------------

    /// Plain ether is taken either way: a plot can hold a balance, and what a
    /// place holds is part of how the world draws it.
    receive() external payable {
        address code = implementation();
        if (code != address(0)) _delegate(code);
    }

    fallback() external payable {
        address code = implementation();
        if (code == address(0)) revert NoCode();
        _delegate(code);
    }

    function _delegate(address code) private {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), code, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    function _setOwner(address who) private {
        assembly {
            sstore(OWNER_SLOT, who)
        }
    }

    function _words() private pure returns (Words storage words) {
        assembly {
            words.slot := WORDS_SLOT
        }
    }
}

/**
 * The factory, and the only thing that ever deploys a plot.
 *
 * Its own address is part of the CREATE2 formula, so with the factory fixed and
 * the plot's code fixed, the salt is the only thing left that moves the
 * address. Choosing a salt is therefore choosing a place on the map, and that
 * is the whole mechanic: the price of ground is work, not an auction.
 *
 * The salt must begin with the caller's own address. A mined salt is public the
 * moment it is broadcast, and without that rule anyone watching the mempool
 * could take the place it took hours to find. With it, a stolen salt is
 * worthless to the thief — and it costs one hash per attempt to mine rather
 * than two, which matters when the attempts are counted in billions.
 */
contract Plots {
    /// Who the plot being deployed right now belongs to.
    address public claimant;

    error SaltNotYours();
    error AlreadyTaken();

    event Claimed(address indexed plot, address indexed owner, bytes32 salt);

    function claim(bytes32 salt) external returns (address plot) {
        // the first twenty bytes of the salt are the caller's own address
        // forge-lint: disable-next-line(unsafe-typecast)
        if (address(bytes20(salt)) != msg.sender) revert SaltNotYours();
        // the same salt puts a plot in the same place, and the place is taken;
        // said in words rather than left to CREATE2 to fail without any
        if (_predict(salt).code.length != 0) revert AlreadyTaken();

        claimant = msg.sender;
        plot = address(new Plot{salt: salt}());
        claimant = address(0);

        emit Claimed(plot, msg.sender, salt);
    }

    /// Where a salt would put a plot, without spending anything to find out.
    function predict(bytes32 salt) external view returns (address) {
        return _predict(salt);
    }

    function _predict(bytes32 salt) internal view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(type(Plot).creationCode))
                    )
                )
            )
        );
    }

    /// The hash a miner needs, so it never has to be trusted to guess it right.
    function plotCodeHash() external pure returns (bytes32) {
        return keccak256(type(Plot).creationCode);
    }
}

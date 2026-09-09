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
 * what its owner writes into it — and since the world takes a structure's shape
 * from what an account holds, writing is how you build.
 *
 * The owner is kept in storage rather than baked into the code, so every plot's
 * runtime code is byte for byte the same — which is how the world knows one
 * when it sees one — and so that a plot can change hands: ground is given, sold
 * and inherited, and a place nobody can ever pass on is a place that dies with
 * its first owner.
 */
contract Plot {
    /// Set from the factory, which knows who asked. Passed on by `transfer`.
    address public owner;

    /// Whatever the owner has to say about the place. Shape and label both.
    string public note;

    error NotOwner();
    error NoOwner();

    event Inscribed(string note);
    event Transferred(address indexed from, address indexed to);

    constructor() {
        owner = Plots(msg.sender).claimant();
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function inscribe(string calldata text) external onlyOwner {
        note = text;
        emit Inscribed(text);
    }

    /// Hand the place to somebody else. Not to nobody: ground with no owner is
    /// ground nobody can ever write into again.
    function transfer(address to) external onlyOwner {
        if (to == address(0)) revert NoOwner();
        emit Transferred(owner, to);
        owner = to;
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

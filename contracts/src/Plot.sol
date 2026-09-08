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
 */
contract Plot {
    /// Set from the factory, which knows who asked. Never changes.
    address public immutable owner;

    /// Whatever the owner has to say about the place. Shape and label both.
    string public note;

    error NotOwner();

    event Inscribed(string note);

    constructor() {
        owner = Plots(msg.sender).claimant();
    }

    function inscribe(string calldata text) external {
        if (msg.sender != owner) revert NotOwner();
        note = text;
        emit Inscribed(text);
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

        claimant = msg.sender;
        plot = address(new Plot{salt: salt}());
        claimant = address(0);

        emit Claimed(plot, msg.sender, salt);
    }

    /// Where a salt would put a plot, without spending anything to find out.
    function predict(bytes32 salt) external view returns (address) {
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

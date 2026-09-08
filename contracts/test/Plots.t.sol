// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Plot, Plots} from "../src/Plot.sol";

contract PlotsTest is Test {
    Plots internal plots;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        plots = new Plots();
    }

    /// A salt that belongs to `who`: their address, then anything at all.
    function saltFor(address who, uint96 tail) internal pure returns (bytes32) {
        return bytes32((uint256(uint160(who)) << 96) | uint256(tail));
    }

    function test_claimPutsThePlotWherePredictSaidItWould() public {
        bytes32 salt = saltFor(alice, 1);
        address expected = plots.predict(salt);

        vm.prank(alice);
        address plot = plots.claim(salt);

        assertEq(plot, expected, "a plot must land where the salt says");
        assertEq(Plot(plot).owner(), alice, "and belong to whoever claimed it");
    }

    /// The whole point of mixing the address into the salt.
    function test_aMinedSaltIsWorthlessToAnybodyElse() public {
        bytes32 salt = saltFor(alice, 7);

        vm.prank(bob);
        vm.expectRevert(Plots.SaltNotYours.selector);
        plots.claim(salt);
    }

    function test_groundCannotBeTakenTwice() public {
        bytes32 salt = saltFor(alice, 3);
        vm.prank(alice);
        plots.claim(salt);

        vm.prank(alice);
        vm.expectRevert();
        plots.claim(salt);
    }

    function test_onlyTheOwnerWritesIntoTheirOwnPlot() public {
        vm.prank(alice);
        Plot plot = Plot(plots.claim(saltFor(alice, 9)));

        vm.prank(bob);
        vm.expectRevert(Plot.NotOwner.selector);
        plot.inscribe("mine now");

        vm.prank(alice);
        plot.inscribe("here, and on purpose");
        assertEq(plot.note(), "here, and on purpose");
    }

    /// Different salts are different places; that is what makes mining mean anything.
    function test_everySaltIsItsOwnPlace() public {
        address first = plots.predict(saltFor(alice, 1));
        address second = plots.predict(saltFor(alice, 2));
        address elsewhere = plots.predict(saltFor(bob, 1));

        assertTrue(first != second);
        assertTrue(first != elsewhere);
    }

    /// A miner works out addresses itself, so it must be given the same hash.
    function test_theCodeHashAMinerNeedsIsTheOneUsed() public view {
        bytes32 fromChain = plots.plotCodeHash();
        bytes32 mine = keccak256(type(Plot).creationCode);
        assertEq(fromChain, mine);
    }
}

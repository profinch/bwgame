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
        assertEq(Plot(payable(plot)).owner(), alice, "and belong to whoever claimed it");
    }

    /// The whole point of mixing the address into the salt.
    function test_aMinedSaltIsWorthlessToAnybodyElse() public {
        bytes32 salt = saltFor(alice, 7);

        vm.prank(bob);
        vm.expectRevert(Plots.SaltNotYours.selector);
        plots.claim(salt);
    }

    function test_groundCannotBeTakenTwice_andSaysSo() public {
        bytes32 salt = saltFor(alice, 3);
        vm.prank(alice);
        plots.claim(salt);

        vm.prank(alice);
        vm.expectRevert(Plots.AlreadyTaken.selector);
        plots.claim(salt);
    }

    function test_aPlotCanChangeHands_butNotToNobody() public {
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(saltFor(alice, 11))));

        // not by anyone but the owner
        vm.prank(bob);
        vm.expectRevert(Plot.NotOwner.selector);
        plot.transfer(bob);

        // not to nobody
        vm.prank(alice);
        vm.expectRevert(Plot.NoOwner.selector);
        plot.transfer(address(0));

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Plot.Transferred(alice, bob);
        plot.transfer(bob);
        assertEq(plot.owner(), bob, "the plot is bob's now");

        // and the old owner has no say any more; the new one has
        vm.prank(alice);
        vm.expectRevert(Plot.NotOwner.selector);
        plot.inscribe("still mine");
        vm.prank(bob);
        plot.inscribe("mine now");
        assertEq(plot.note(), "mine now");
    }

    // --- the plot as a proxy --------------------------------------------------

    function test_aPlotRunsWhateverCodeItsOwnerPointsItAt() public {
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(saltFor(alice, 31))));
        Counter counter = new Counter();

        // nothing to run yet
        vm.expectRevert(Plot.NoCode.selector);
        Counter(payable(address(plot))).bump();

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Plot.CodeSet(address(counter));
        plot.setCode(address(counter));
        assertEq(plot.implementation(), address(counter));

        // anybody can use it, and the count lives in the plot, not in the counter
        Counter(payable(address(plot))).bump();
        Counter(payable(address(plot))).bump();
        assertEq(Counter(payable(address(plot))).n(), 2, "the plot keeps its own count");
        assertEq(counter.n(), 0, "the implementation's own storage is untouched");

        // and the plot's own state is untouched by the implementation's slot zero
        assertEq(plot.owner(), alice);
        vm.prank(alice);
        plot.inscribe("the counting house");
        assertEq(plot.note(), "the counting house");
        assertEq(Counter(payable(address(plot))).n(), 2, "and the count survives the writing");
    }

    function test_onlyTheOwnerPointsIt_andOnlyAtCode() public {
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(saltFor(alice, 32))));
        Counter counter = new Counter();

        vm.prank(bob);
        vm.expectRevert(Plot.NotOwner.selector);
        plot.setCode(address(counter));

        vm.prank(alice);
        vm.expectRevert(Plot.NotAContract.selector);
        plot.setCode(address(0xBEEF));

        // and back to being just a plot is allowed
        vm.startPrank(alice);
        plot.setCode(address(counter));
        plot.setCode(address(0));
        vm.stopPrank();
        assertEq(plot.implementation(), address(0));
    }

    function test_sealedIsForGood() public {
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(saltFor(alice, 33))));
        Counter counter = new Counter();

        vm.startPrank(alice);
        plot.setCode(address(counter));
        vm.expectEmit(false, false, false, true);
        emit Plot.SealedForGood();
        plot.seal();
        assertTrue(plot.isSealed());
        vm.expectRevert(Plot.Sealed.selector);
        plot.setCode(address(0));
        vm.stopPrank();

        // the code still runs, and the place can still be written into and handed on
        Counter(payable(address(plot))).bump();
        assertEq(Counter(payable(address(plot))).n(), 1);
        vm.prank(alice);
        plot.transfer(bob);
        assertEq(plot.owner(), bob);
    }

    /// What a Chainlink coordinator does: call the consumer back. The consumer is the plot.
    function test_somebodyElseCanCallThePlotBack() public {
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(saltFor(alice, 34))));
        Consumer consumer = new Consumer();
        vm.prank(alice);
        plot.setCode(address(consumer));

        Coordinator coordinator = new Coordinator();
        coordinator.fulfill(address(plot), 424242);
        assertEq(Consumer(payable(address(plot))).last(), 424242, "the word landed in the plot");
    }

    function test_aPlotTakesEther_withCodeOrWithout() public {
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(saltFor(alice, 35))));
        vm.deal(bob, 2 ether);

        vm.prank(bob);
        (bool ok,) = address(plot).call{value: 1 ether}("");
        assertTrue(ok, "plain ether with no code");
        assertEq(address(plot).balance, 1 ether);

        Counter counter = new Counter();
        vm.prank(alice);
        plot.setCode(address(counter));
        vm.prank(bob);
        (ok,) = address(plot).call{value: 1 ether}("");
        assertTrue(ok, "plain ether with code that takes it");
        assertEq(address(plot).balance, 2 ether);
    }

    /// The world knows a plot by its code, so two plots must have the same code exactly.
    function test_everyPlotHasTheSameRuntimeCode() public {
        vm.prank(alice);
        address one = plots.claim(saltFor(alice, 21));
        vm.prank(bob);
        address two = plots.claim(saltFor(bob, 22));
        assertEq(keccak256(one.code), keccak256(two.code), "owner must not be written into the code");
    }

    function test_onlyTheOwnerWritesIntoTheirOwnPlot() public {
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(saltFor(alice, 9))));

        vm.prank(bob);
        vm.expectRevert(Plot.NotOwner.selector);
        plot.inscribe("mine now");

        vm.prank(alice);
        plot.inscribe("here, and on purpose");
        assertEq(plot.note(), "here, and on purpose");
    }

    /// Different salts are different places; that is what makes mining mean anything.
    function test_everySaltIsItsOwnPlace() public view {
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

/// Somebody's own contract, as they would write it: ordinary storage from slot zero.
contract Counter {
    uint256 public n;

    function bump() external {
        n++;
    }

    receive() external payable {}
}

/// A consumer of somebody else's callbacks, the way a Chainlink VRF consumer is.
contract Consumer {
    uint256 public last;

    function fulfill(uint256 word) external {
        last = word;
    }
}

/// The one doing the calling back.
contract Coordinator {
    function fulfill(address consumer, uint256 word) external {
        Consumer(consumer).fulfill(word);
    }
}

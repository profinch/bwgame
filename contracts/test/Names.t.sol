// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PermissionedRegistry} from "@ensdomains/contracts-v2/registry/PermissionedRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {LabelStore} from "@ensdomains/contracts-v2/utils/LabelStore.sol";
import {IContractNamer} from "@ensdomains/contracts-v2/reverse-registrar/interfaces/IContractNamer.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {Names} from "../src/Names.sol";
import {Plot, Plots} from "../src/Plot.sol";

contract NamesTest is Test {
    Plots internal plots;
    PermissionedRegistry internal registry;
    Names internal names;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    /// Every root role, with its admin: what a registry's owner holds.
    uint256 internal constant ALL_ROOT =
        RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN
        | RegistryRolesLib.ROLE_UNREGISTER | RegistryRolesLib.ROLE_UNREGISTER_ADMIN
        | RegistryRolesLib.ROLE_RENEW | RegistryRolesLib.ROLE_RENEW_ADMIN
        | RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN
        | RegistryRolesLib.ROLE_SET_SUBREGISTRY | RegistryRolesLib.ROLE_SET_SUBREGISTRY_ADMIN;

    function setUp() public {
        plots = new Plots();
        registry = new PermissionedRegistry(new LabelStore(IContractNamer(address(0))), address(this), ALL_ROOT);
        names = new Names(plots, registry);
        // the registrar, and only it, may register and take back labels
        registry.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_UNREGISTER, address(names));
    }

    function saltFor(address who, uint96 tail) internal pure returns (bytes32) {
        return bytes32((uint256(uint160(who)) << 96) | uint256(tail));
    }

    function dns(string memory label) internal pure returns (bytes memory) {
        return NameCoder.encode(string.concat(label, ".groundstate.eth"));
    }

    function test_aPlotIsNamed_andTheNameIsThePlots() public {
        bytes32 salt = saltFor(alice, 1);
        vm.prank(alice);
        address plot = plots.claim(salt);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Names.Named(plot, "well");
        names.name(salt, "well");

        uint256 labelId = uint256(keccak256("well"));
        assertEq(registry.getOwner(labelId), alice, "the token is the owner's, and cannot be moved on its own");
        assertEq(registry.getResolver("well"), address(names), "and this is its resolver");
        assertEq(names.nameOf(plot), "well");
        assertEq(names.plotOf(labelId), plot);
        // never expires
        assertEq(registry.getExpiry(labelId), type(uint64).max);
    }

    function test_onlyThePlotsOwnerNamesIt_andOnlyAPlot() public {
        bytes32 salt = saltFor(alice, 2);
        vm.prank(alice);
        plots.claim(salt);

        vm.prank(bob);
        vm.expectRevert(Names.NotOwner.selector);
        names.name(salt, "mine");

        // a salt nobody has claimed is nothing to name
        vm.prank(alice);
        vm.expectRevert();
        names.name(saltFor(alice, 99), "ghost");
    }

    function test_aNameIsLettersDigitsAndHyphens() public {
        bytes32 salt = saltFor(alice, 3);
        vm.prank(alice);
        plots.claim(salt);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Names.BadLabel.selector, "Well"));
        names.name(salt, "Well");
        vm.expectRevert(abi.encodeWithSelector(Names.BadLabel.selector, "a.b"));
        names.name(salt, "a.b");
        vm.expectRevert(abi.encodeWithSelector(Names.BadLabel.selector, ""));
        names.name(salt, "");
        names.name(salt, "the-well-7");
        vm.stopPrank();
    }

    function test_aNameIsOneToAPlot_andTakenNamesAreTaken() public {
        bytes32 one = saltFor(alice, 4);
        bytes32 two = saltFor(bob, 5);
        vm.prank(alice);
        address first = plots.claim(one);
        vm.prank(bob);
        plots.claim(two);

        vm.prank(alice);
        names.name(one, "well");
        // bob cannot have alice's name
        vm.prank(bob);
        vm.expectRevert();
        names.name(two, "well");

        // renaming gives the old one back
        vm.prank(alice);
        names.name(one, "spring");
        assertEq(names.nameOf(first), "spring");
        assertEq(names.plotOf(uint256(keccak256("well"))), address(0));
        vm.prank(bob);
        names.name(two, "well");
        assertEq(names.nameOf(plots.predict(two)), "well");

        // and taken away
        vm.prank(alice);
        names.unname(one);
        assertEq(names.nameOf(first), "");
        assertEq(registry.getOwner(uint256(keccak256("spring"))), address(0));
    }

    function test_theNameFollowsThePlot() public {
        bytes32 salt = saltFor(alice, 6);
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(salt)));
        vm.prank(alice);
        names.name(salt, "well");

        vm.prank(alice);
        plot.transfer(bob);
        // alice has no say any more; bob does, and the name came with the ground
        vm.prank(alice);
        vm.expectRevert(Names.NotOwner.selector);
        names.name(salt, "stolen");
        assertEq(names.nameOf(address(plot)), "well");
        vm.prank(bob);
        names.name(salt, "bobs-well");
        assertEq(names.nameOf(address(plot)), "bobs-well");
    }

    function test_itResolvesTheWholeSubtree() public {
        bytes32 salt = saltFor(alice, 7);
        vm.prank(alice);
        Plot plot = Plot(payable(plots.claim(salt)));
        vm.prank(alice);
        names.name(salt, "well");
        vm.prank(alice);
        plot.inscribe("a deep one");

        // addr(bytes32)
        bytes memory got = names.resolve(dns("well"), abi.encodeWithSelector(0x3b3b57de, bytes32(0)));
        assertEq(abi.decode(got, (address)), address(plot));
        // addr(bytes32, 60)
        got = names.resolve(dns("well"), abi.encodeWithSelector(0xf1cb7e06, bytes32(0), uint256(60)));
        assertEq(abi.decode(got, (bytes)), abi.encodePacked(address(plot)));
        // text: description is the note, url opens the world there
        got = names.resolve(dns("well"), abi.encodeWithSelector(0x59d1d43c, bytes32(0), "description"));
        assertEq(abi.decode(got, (string)), "a deep one");
        got = names.resolve(dns("well"), abi.encodeWithSelector(0x59d1d43c, bytes32(0), "url"));
        assertEq(
            abi.decode(got, (string)),
            string.concat("https://gs.bwtoken.io/world.html?chain=sepolia&at=", vm.toLowercase(vm.toString(address(plot))))
        );
        // a name nobody has, and a name not under groundstate.eth: nothing
        assertEq(names.resolve(dns("nobody"), abi.encodeWithSelector(0x3b3b57de, bytes32(0))).length, 0);
        assertEq(
            names.resolve(NameCoder.encode("well.elsewhere.eth"), abi.encodeWithSelector(0x3b3b57de, bytes32(0))).length, 0
        );
        assertTrue(names.supportsInterface(0x9061b923), "ENSIP-10");
    }
}

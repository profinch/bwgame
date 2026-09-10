// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {IExtendedResolver} from "@ens/contracts/resolvers/profiles/IExtendedResolver.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Plot, Plots} from "./Plot.sol";

/**
 * Names for places.
 *
 * A plot is an address, and an address is nowhere anybody can be told to go.
 * So a plot's owner may give it a name under `groundstate.eth` — `well.groundstate.eth`
 * — and the name is how the place is shared.
 *
 * This is ENSv2, on its own terms. `groundstate.eth` points its subregistry at
 * a registry of ours (a PermissionedRegistry), and this contract is the
 * registrar for it: the only thing allowed to register a label there. The
 * label's token goes to the plot's owner and cannot be transferred on its own —
 * a name belongs to the place, and this contract keeps which place; when the
 * place changes hands, the new owner names it, and the old name is given back.
 * Naming is free and does not expire.
 *
 * It is also the resolver for the whole subtree: `groundstate.eth` names this
 * contract as its resolver, so a name that is not registered still resolves to
 * nothing here rather than nowhere (wildcard resolution), and a name that is
 * registered resolves to its plot — address, and a description that is what
 * the owner wrote into the plot, and a link that opens the world there.
 */
contract Names is IExtendedResolver, IERC165 {
    Plots public immutable FACTORY;
    IPermissionedRegistry public immutable REGISTRY;
    /// What the world at gs.bwtoken.io opens a place with.
    string public constant URL = "https://gs.bwtoken.io/world.html?chain=sepolia&at=";

    /// The label a plot is named, by the plot; and the plot, by the label's id.
    mapping(address plot => string label) public nameOf;
    mapping(uint256 labelId => address plot) public plotOf;

    error NotAPlot(address plot);
    error NotOwner();
    error BadLabel(string label);

    event Named(address indexed plot, string label);
    event Unnamed(address indexed plot, string label);

    constructor(Plots factory, IPermissionedRegistry registry) {
        FACTORY = factory;
        REGISTRY = registry;
    }

    // --- naming ------------------------------------------------------------

    /// Give the plot this salt made a name. Renaming gives the old one back.
    function name(bytes32 salt, string calldata label) external {
        address plot = _plotOf(salt);
        if (!_goodLabel(label)) revert BadLabel(label);
        _forget(plot);
        REGISTRY.register(label, msg.sender, IRegistry(address(0)), address(this), 0, type(uint64).max);
        nameOf[plot] = label;
        plotOf[uint256(keccak256(bytes(label)))] = plot;
        emit Named(plot, label);
    }

    /// Take the plot's name away.
    function unname(bytes32 salt) external {
        _forget(_plotOf(salt));
    }

    /// The plot a salt made, if its owner is asking.
    function _plotOf(bytes32 salt) private view returns (address plot) {
        plot = FACTORY.predict(salt);
        if (plot.code.length == 0) revert NotAPlot(plot);
        if (Plot(payable(plot)).owner() != msg.sender) revert NotOwner();
    }

    function _forget(address plot) private {
        string memory had = nameOf[plot];
        if (bytes(had).length == 0) return;
        uint256 labelId = uint256(keccak256(bytes(had)));
        REGISTRY.unregister(labelId);
        delete plotOf[labelId];
        delete nameOf[plot];
        emit Unnamed(plot, had);
    }

    /// Lowercase letters, digits and hyphens, one to thirty-two of them: what a
    /// name is, and — not by accident — what the stones can be written in.
    function _goodLabel(string calldata label) private pure returns (bool) {
        bytes calldata b = bytes(label);
        if (b.length == 0 || b.length > 32) return false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x7a) || c == 0x2d;
            if (!ok) return false;
        }
        return true;
    }

    // --- resolving -------------------------------------------------------------

    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant ADDR_COIN = 0xf1cb7e06; // addr(bytes32,uint256)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    uint256 private constant COIN_ETH = 60;

    /**
     * ENSIP-10: the whole DNS-encoded name and the query, answered for
     * `<label>.groundstate.eth`. Anything else under the parent — a deeper
     * name, the parent itself — resolves to nothing.
     */
    function resolve(bytes memory dnsName, bytes memory data) external view returns (bytes memory) {
        (string memory label, uint256 next) = NameCoder.extractLabel(dnsName, 0);
        (string memory parent, uint256 after_) = NameCoder.extractLabel(dnsName, next);
        (string memory tld, ) = NameCoder.extractLabel(dnsName, after_);
        if (
            keccak256(bytes(parent)) != keccak256("groundstate") || keccak256(bytes(tld)) != keccak256("eth")
        ) {
            return "";
        }
        address plot = plotOf[uint256(keccak256(bytes(label)))];
        if (plot == address(0)) return "";

        bytes4 selector = bytes4(data);
        if (selector == ADDR) return abi.encode(plot);
        if (selector == ADDR_COIN) {
            (, uint256 coinType) = abi.decode(_tail(data), (bytes32, uint256));
            return coinType == COIN_ETH ? abi.encode(abi.encodePacked(plot)) : abi.encode("");
        }
        if (selector == TEXT) {
            (, string memory key) = abi.decode(_tail(data), (bytes32, string));
            if (keccak256(bytes(key)) == keccak256("description")) {
                return abi.encode(Plot(payable(plot)).note());
            }
            if (keccak256(bytes(key)) == keccak256("url")) {
                return abi.encode(string.concat(URL, _hex(plot)));
            }
            return abi.encode("");
        }
        return "";
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// The arguments of a call, without its selector.
    function _tail(bytes memory data) private pure returns (bytes memory tail) {
        tail = new bytes(data.length - 4);
        for (uint256 i = 0; i < tail.length; i++) tail[i] = data[i + 4];
    }

    function _hex(address a) private pure returns (string memory) {
        bytes16 digits = "0123456789abcdef";
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) {
            out[i] = digits[v & 0xf];
            v >>= 4;
        }
        return string(out);
    }
}

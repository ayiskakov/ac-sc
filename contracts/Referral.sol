// Contract Name: Referral
//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


import "@openzeppelin/contracts/access/AccessControl.sol";

contract Referral is AccessControl {
    bytes32 public constant SERVICE_ROLE = keccak256("SERVICE");
    // user is reffered by user/agency
    mapping(address => address) private referrals;
    mapping(address => bool) private set;

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setService(address _service, bool _set) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_set) {
            _setupRole(SERVICE_ROLE, _service);
        } else {
            _revokeRole(SERVICE_ROLE, _service);
        }
    }

    function setReferral(address _referral, address _referrer) public onlyRole(SERVICE_ROLE) {
        require(!set[_referral], "already setted");
        referrals[_referral] = _referrer;
        set[_referral] = true;
    }

    function getReferrer(address _referral) public view returns (address) {
        return referrals[_referral];
    }
}
// Contract Name: Fee
//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.1;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Fee is AccessControl {

    bytes32 public constant FEE_CHANGER_ROLE = keccak256("FEE_CHANGER");
    
    //  successful case fees
    uint256 private bookingPercentage;
    uint256 private platformFeePercentage;
    uint256 private dldFeePercentage;
    uint256 private poaFee;

    using SafeMath for uint256;

    event BookingPercentageChanged(uint256 newPercentage, uint256 timestamp);
    event PlatformFeePercentageChanged(uint256 newPercentage, uint256 timestamp);
    event DLDFeePercentageChanged(uint256 newPercentage, uint256 timestamp);
    event PoaFeeChanged(uint256 newFee, uint256 timestamp);

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    modifier checkPercentage(uint256 _percentage) {
        require(_percentage <= 10000, "Percentage must be less than or equal to 100");
        require(_percentage >= 0);
        _;
    }

    function setFeeChanger(address _feeChanger) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setupRole(FEE_CHANGER_ROLE, _feeChanger);
    }

    function setPoaFee(uint256 _fee) public onlyRole(FEE_CHANGER_ROLE) {
        poaFee = _fee;
        emit PoaFeeChanged(poaFee, block.timestamp);
    }

    function setFeePercentage(uint256 _booking, uint256 _platform, uint256 _dld) public onlyRole(FEE_CHANGER_ROLE) checkPercentage(_booking) checkPercentage(_platform) checkPercentage(_dld) {
        uint256 sum = _booking.add(_platform).add(_dld);
        
        require(sum <= 10000, "Percentage must be lte 100");

        bookingPercentage = _booking;
        platformFeePercentage = _platform;
        dldFeePercentage = _dld;
        
        uint256 bt = block.timestamp;
        emit BookingPercentageChanged(_booking, bt);
        emit PlatformFeePercentageChanged(_platform, bt);
        emit DLDFeePercentageChanged(_dld, bt);
    }

    function getBookingPercentage() public view returns (uint256) {
        return bookingPercentage;
    }

    function getPlatformFeePercentage() public view returns (uint256) {
        return platformFeePercentage;
    }

    function getDLDFeePercentage() public view returns (uint256) {
        return dldFeePercentage;
    }

    function getBookingFee(uint256 _amount) public view returns (uint256) {
        return _amount.mul(bookingPercentage).div(10000);
    }

    function getPlatformFee(uint256 _amount) public view returns (uint256) {
        return _amount.mul(platformFeePercentage).div(10000);
    }

    function getPoaFee() public view returns (uint256) {
        return poaFee;
    }

    function getDLDFee(uint256 _amount) public view returns (uint256) {
        return _amount.mul(dldFeePercentage).div(10000);
    }
}
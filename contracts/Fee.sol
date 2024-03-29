// Contract Name: Fee
//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.1;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


contract Fee is AccessControl {

    bytes32 public constant FEE_CHANGER_ROLE = keccak256("FEE_CHANGER");
    
    //  successful case fees
    uint256 private bookingPercentage;
    uint256 private platformFeePercentage = 1000;
    uint256 private poaFee;

    using SafeMath for uint256;

    event BookingPercentageChanged(uint256 newPercentage, uint256 timestamp);
    event PlatformFeePercentageChanged(uint256 newPercentage, uint256 timestamp);
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

    function setFeePercentage(uint256 _booking, uint256 _platform) public onlyRole(FEE_CHANGER_ROLE) checkPercentage(_booking) checkPercentage(_platform) {
        uint256 sum = _booking.add(_platform);
        
        require(sum <= 10000, "Percentage must be lte 100");

        bookingPercentage = _booking;
        platformFeePercentage = _platform;
        
        uint256 bt = block.timestamp;
        emit BookingPercentageChanged(_booking, bt);
        emit PlatformFeePercentageChanged(_platform, bt);
    }

    function getBookingPercentage() public view returns (uint256) {
        return bookingPercentage;
    }

    function getBookingFee(uint256 _amount) public view returns (uint256) {
        return _amount.mul(bookingPercentage).div(10000);
    }

    function getPlatformFee(uint256 _amount) public pure returns (uint256) {
        // compute factor without if statements however log is not supported in solidity
        // factor = 10 ** (uint256(log10(_amount)) - 1);

        if (_amount == 0) {
            return 0;
        }

        uint256 factor = 1;

        for (uint256 i = 0; i < 18 && _amount > factor * 10; i++) {
            factor = factor * 10;
        }

        return ((_amount / factor) + 1) * factor / 10;
    }

    function getCustomerFee(uint256 _amount) public pure returns (uint256) {
        return getPlatformFee(_amount) / 2;
    }

    function getPoaFee() public view returns (uint256) {
        return poaFee;
    }
}
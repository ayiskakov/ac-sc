// Contract Name: Marketplace
//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "./RealEstate.sol";
import "./Verifier.sol";
import "./Fee.sol";
import "./Referral.sol";


import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";

// import "@openzeppelin/contracts/finance/PaymentSplitter.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
// import "hardhat/console.sol";


import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

import "@openzeppelin/contracts/metatx/MinimalForwarder.sol";

contract Marketplace is ERC2771Context, ERC1155Receiver, AccessControl {
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE");

    RealEstate private realEstate;
    Verifier private verifier;
    Fee private fee;
    Referral private referral;
    IERC20 private usdC;
    AggregatorV3Interface private priceFeed;
    
    address private platform;

    using SafeMath for uint256;

    struct Property {
        uint256 tokenId;
        uint256 amount;
        uint256 price;
        address agency;
        address seller;
        bool isOnSale;
    }

    struct Booking {
        uint256 tokenId;
        uint256 date;
        uint256 fee;
        address buyer;
        bool paid;
        bool poa;
    }

    mapping(address => mapping(uint256 => Property)) public properties;
    mapping(uint256 => bool) private isBooked;
    mapping(uint256 => Booking) private booking;


    // Security
    mapping(uint256 => bool) private noReentrancy;



    event propertyCreated(uint256 indexed tokenId, string uri, address indexed agency, address indexed seller, uint256 timestamp);
   
    // event tradeOpened(address indexed seller, uint256 id, uint256 amount, uint256 price, uint8 currency, uint256 timestamp);
    // event tradeClosed(address indexed seller, uint256 id, uint256 amount, uint256 timestamp);
    // event tradeSold(address indexed seller, address indexed buyer, uint256 id, uint256 amount, uint256 price, uint8 currency, uint256 timestamp);
   
    // event traded(uint256 tokenId, uint256 price, uint8 currency, address buyer, uint256 timestamp);
    // event booked property
    event propertyBooked(uint256 tokenId, uint256 fee, address buyer, bool poa, uint256 timestamp);
    event propertBookingCancelled(uint256 tokenId, uint256 sellerFee, uint256 platformFee, uint256 agencyFee, uint256 timestamp);
    event propertyPaid(uint256 tokenId, uint256 admFee, uint256 dldFee, uint256 ptFee, uint256 total, address buyer, uint256 timestamp);
    event propertyTradeFulfilled(uint256 tokenId, address referrer, uint256 referralFee, uint256 timestamp);
    
    event propertyTradeOpened(uint256 tokenId, address indexed agency, uint256 price, uint256 timestamp);
    
    constructor(
        address _platform, 
        address _realEstate, 
        address _verifier, 
        address _fee, 
        address _referral, 
        address _usdcAddress, 
        address _priceFeed, 
        address _forwarder
    ) ERC2771Context(_forwarder) {
        platform = _platform;

        realEstate = RealEstate(_realEstate);
        verifier = Verifier(_verifier);
        fee = Fee(_fee);
        referral = Referral(_referral);
        usdC = IERC20(_usdcAddress);
        priceFeed = AggregatorV3Interface(_priceFeed);
        
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    modifier noReentrant(uint256 _tokenId) {
        require(!noReentrancy[_tokenId], "No re-entrancy");
        noReentrancy[_tokenId] = true;
        _;
        noReentrancy[_tokenId] = false;
    }
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }


    function setMarketplace(address _marketplace, bool _set) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_set) {
            _setupRole(MARKETPLACE_ROLE, _marketplace);
        } else {
            _revokeRole(MARKETPLACE_ROLE, _marketplace);
        }
    }

    function createProperty(string memory _uri, address _seller) public returns (uint256) {
        address sender = _msgSender();
        require(verifier.isVerifiedAgency(sender), "not agency");
        
        uint256 tokenId = realEstate.createToken(1, sender);

        properties[sender][tokenId] = Property(tokenId, 1, 0, sender, _seller, false);
        // EmitEvent(PropertyCreated(tokenId, uri)) TODO: emit event
        emit propertyCreated(tokenId, _uri, sender, _seller, block.timestamp);
        return tokenId;
    }

    function bookProperty(uint256 _tokenId, bool _usePoa) public noReentrant(_tokenId) {
        require(!isBooked[_tokenId], "already booked");
        require(properties[address(this)][_tokenId].isOnSale, "not on sale");
        
        Property memory property = properties[address(this)][_tokenId];

        address sender = _msgSender();
        uint256 bookingFee = fee.getBookingFee(property.price);

        require(usdC.allowance(sender, address(this)) >= bookingFee, "not enough allowance");
        require(usdC.transferFrom(sender, address(this), bookingFee), "not enough usdC");
        
        isBooked[_tokenId] = true;
        booking[_tokenId] = Booking(_tokenId, block.timestamp, bookingFee, sender, false, _usePoa);
        
        emit propertyBooked(_tokenId, bookingFee, sender, _usePoa, block.timestamp);
        // EmitEvent(PropertyBooked(tokenId)) TODO: emit event
    }
    
    function endBooking(uint256 _tokenId) public onlyRole(MARKETPLACE_ROLE) noReentrant(_tokenId) {
        require(isBooked[_tokenId], "not booked");
        isBooked[_tokenId] = false;
        
        Property memory pt = properties[address(this)][_tokenId];


        uint256 bookingFee  = fee.getBookingFee(pt.price);

        uint256 sellerFee   = bookingFee.mul(5000).div(10000);
        uint256 platformFee = bookingFee.mul(4000).div(10000);
        uint256 agencyFee   = bookingFee.mul(1000).div(10000);
        
        require(usdC.transfer(pt.seller, sellerFee), "not enough usdC");
        require(usdC.transfer(platform, platformFee), "not enough usdC");
        require(usdC.transfer(pt.agency, agencyFee), "not enough usdC");

        delete booking[_tokenId];
    //  event propertBookingCancelled(uint256 tokenId, uint256 timestamp);
        emit propertBookingCancelled(_tokenId, sellerFee, platformFee, agencyFee, block.timestamp);
        // EmitEvent(PropertyBookingEnded(tokenId)) TODO: emit event
    }

    function buyProperty(uint256 _tokenId) public noReentrant(_tokenId) {
        require(isBooked[_tokenId], "not booked");
        require(properties[address(this)][_tokenId].isOnSale, "not on sale");
        require(booking[_tokenId].buyer == _msgSender(), "not your booking");
        require(!booking[_tokenId].paid, "already paid");
        Property storage pt = properties[address(this)][_tokenId];

        uint256 admFee  = fee.getAdministrativeFee(pt.price);
        uint256 dldFee  = fee.getDLDFee(pt.price);
        uint256 ptFee   = fee.getPlatformFee(pt.price);

        uint256 total = pt.price.sub(booking[_tokenId].fee).add(admFee).add(dldFee).add(ptFee);

        if (booking[_tokenId].poa) {
            total = total.add(fee.getPoaFee());
        }

        require(usdC.allowance(_msgSender(), address(this)) >= total, "not enough allowance");
        require(usdC.transferFrom(_msgSender(), address(this), total), "not enough usdC");
        
        pt.isOnSale = false;
        booking[_tokenId].paid = true;
        booking[_tokenId].buyer = _msgSender();
        // EmitEvent(PropertySold(tokenId)) TODO: emit event
        // uint256 admFee, uint256 dldFee, uint256 ptFee, uint256 total, uint256 buyer, uint256 timestamp
        emit propertyPaid(_tokenId, admFee, dldFee, ptFee, total, _msgSender(), block.timestamp);
        
    }
    
    function fullfillBuy(uint256 _tokenId) public onlyRole(MARKETPLACE_ROLE) noReentrant(_tokenId) {
        require(isBooked[_tokenId], "not booked");
        require(booking[_tokenId].paid, "not paid");

        Property storage pt = properties[address(this)][_tokenId];
        
        uint256 sellerPart = pt.price.mul(9500).div(10000);
        uint256 agencyFee = pt.price.mul(200).div(10000);
        uint256 platformFee = fee.getDLDFee(pt.price).add(fee.getPlatformFee(pt.price)).add(fee.getAdministrativeFee(pt.price));

        address referrer = referral.getReferrer(booking[_tokenId].buyer);
        uint256 referralFee = pt.price.mul(100).div(10000);

        if (booking[_tokenId].poa) {
            platformFee = platformFee.add(fee.getPoaFee());
        }


        if (referrer == address(0)) {
            platformFee = platformFee.add(referralFee);
        } else {
            if (referrer == pt.agency) {
                agencyFee = agencyFee.add(referralFee);
            } else {
                require(usdC.transfer(referrer, referralFee), "not enough usdC");
            }
        }

        require(usdC.transfer(pt.seller, sellerPart), "not enough usdC");
        require(usdC.transfer(pt.agency, agencyFee), "not enough usdC");
        require(usdC.transfer(platform, platformFee), "not enough usdC");

        emit propertyTradeFulfilled(_tokenId, referrer, referralFee, block.timestamp);
        // address referrer, uint256 referralFee, uint256 sellerPart, uint256 agencyFee, platformFee, uint256 timestamp
    }

    function putOnSale(uint256 _tokenId, uint256 _price) public {
        require(_price > 0, "price");

        address sender = _msgSender();

        require(realEstate.balanceOf(sender, _tokenId) == 1, "balance");
        require(!properties[sender][_tokenId].isOnSale, "already on sale");

        realEstate.safeTransferFrom(sender, address(this), _tokenId, 1, "");
        
        Property memory property = properties[sender][_tokenId];

        properties[address(this)][_tokenId] = Property(_tokenId, 1, _price, property.agency, property.seller, true);
        
        delete properties[sender][_tokenId];
        // EmitEvent(tradeOpened(msg.sender, _tokenId, _price)) TODO: emit event
        emit propertyTradeOpened(_tokenId, sender, _price, block.timestamp);
    }

    // function removeFromSale(uint256 _tokenId) public noReentrant(_tokenId) {
    
    // }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Receiver, AccessControl) returns (bool) {
        return ERC1155Receiver.supportsInterface(interfaceId) || AccessControl.supportsInterface(interfaceId);
    }
}
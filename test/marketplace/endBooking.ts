import { expect } from "chai";
import { ethers } from "hardhat";
import { ethers as eth } from "ethers";

describe("End Booking", function () {
  let usdcContract: eth.Contract;
  let usdcFactory: eth.ContractFactory;

  let feeContract: eth.Contract;
  let feeFactory: eth.ContractFactory;

  let referralContract: eth.Contract;
  let referralFactory: eth.ContractFactory;

  let verifierContract: eth.Contract;
  let verifierFactory: eth.ContractFactory;

  let realEstateContract: eth.Contract;
  let realEstateFactory: eth.ContractFactory;

 


  let owner: eth.Signer,
    marketplace: eth.Signer,
    tokenHolder: eth.Signer,
    multiSigner: eth.Signer,
    agency: eth.Signer;

  let marketplaceContract: eth.Contract;
  let marketplaceFactory: eth.ContractFactory;

  const ONE_DOLLAR = eth.BigNumber.from(1_000_000);
  const HUNDRED_PERCENT = eth.BigNumber.from(10_000);

  const BOOKING_FEE_PERCENTAGE = eth.BigNumber.from(1000);
  const PLATFORM_FEE_PERCENTAGE = eth.BigNumber.from(500);


  // _platform,  _realEstate,  _verifier,  _fee,  _referral,  _usdcAddress,  _priceFeed) {
  beforeEach(async function () {
    [owner, marketplace, tokenHolder, multiSigner, agency] =
      await ethers.getSigners();

    const multiAddress = await multiSigner.getAddress();
    // Setting up the verifier contract
    verifierFactory = await ethers.getContractFactory("Verifier");
    verifierContract = await verifierFactory.deploy();
    await verifierContract.deployed();

    await verifierContract.connect(owner).setVerifier(multiAddress, true);

    // Setting up the referral contract
    referralFactory = await ethers.getContractFactory("Referral");
    referralContract = await referralFactory.deploy();
    await referralContract.deployed();

    await referralContract.connect(owner).setService(multiAddress, true);

    // Setting up the fee contract
    feeFactory = await ethers.getContractFactory("Fee");
    feeContract = await feeFactory.deploy();
    await feeContract.deployed();

    await feeContract.connect(owner).setFeeChanger(multiAddress);

    // Setting up the real estate contract
    realEstateFactory = await ethers.getContractFactory("RealEstate");
    realEstateContract = await realEstateFactory.deploy();
    await realEstateContract.deployed();

    const ownerAddress = await owner.getAddress();
    const tokenHolderAddress = await tokenHolder.getAddress();
    const marketplaceAddress = await marketplace.getAddress();

    // Setting up the mock usdc contract
    usdcFactory = await ethers.getContractFactory("MockUsdc");
    usdcContract = await usdcFactory.deploy(
      marketplaceAddress,
      tokenHolderAddress
    );
    await usdcContract.deployed();

    // Setting up the marketplace contract
    marketplaceFactory = await ethers.getContractFactory("Marketplace");
    marketplaceContract = await marketplaceFactory.deploy(
      ownerAddress,
      realEstateContract.address,
      verifierContract.address,
      feeContract.address,
      referralContract.address,
      usdcContract.address,
      ethers.constants.AddressZero
    );
    await marketplaceContract.deployed();

    await realEstateContract
      .connect(owner)
      .setMarketplaceContract(marketplaceContract.address);

    await marketplaceContract
      .connect(owner)
      .setMarketplace(marketplaceAddress, true);

    await feeContract
      .connect(multiSigner)
      .setFeePercentage(
        BOOKING_FEE_PERCENTAGE,
        PLATFORM_FEE_PERCENTAGE
      );

    const agencyAddress = await agency.getAddress();
    const buyerAddress = await marketplace.getAddress();
    await verifierContract
      .connect(multiSigner)
      .setVerificationAgency(agencyAddress, true);
    await verifierContract
      .connect(multiSigner)
      .setVerificationUser(buyerAddress, true);
  });

  it("End Booking for tokenId does not exist", async function () {
      
    const tokenHolderAddress = await tokenHolder.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, ONE_DOLLAR);

    const bookingFee = await feeContract.getBookingFee(ONE_DOLLAR);
    usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);

    await marketplaceContract.connect(marketplace).bookProperty(1, false);
    const tx = marketplaceContract.connect(marketplace).endBooking(2);
    
    await expect(tx).to.be.reverted;
    
  });

  it("End Booking by other than marketplace role", async function () {
      
    const tokenHolderAddress = await tokenHolder.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, ONE_DOLLAR);

    const bookingFee = await feeContract.getBookingFee(ONE_DOLLAR);
    usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);
 
    await marketplaceContract.connect(marketplace).bookProperty(1, false);
    const tx = marketplaceContract.connect(owner).endBooking(1);
    
    await expect(tx).to.be.reverted;
      
  });

  it("Successful End Booking", async function () {
      
    const tokenHolderAddress = await tokenHolder.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, ONE_DOLLAR);

    const bookingFee = await feeContract.getBookingFee(ONE_DOLLAR);
    usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);
 
    await marketplaceContract.connect(marketplace).bookProperty(1, false);
    const tx = marketplaceContract.connect(marketplace).endBooking(1);
    await expect(tx).not.to.be.reverted; 
      
  });
  

});

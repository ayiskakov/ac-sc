import { expect } from "chai";
import { ethers } from "hardhat";
import { ethers as eth } from "ethers";

describe("Marketplace contract initialization test", function () {
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

  it("should create token by agency", async function () {
    const tokenHolderAddress = await tokenHolder.getAddress();

    const tx = marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, ONE_DOLLAR);
    await expect(tx).not.to.be.reverted;
    await tx;

    const balance = await realEstateContract.balanceOf(
      marketplaceContract.address,
      1
    );
    expect(balance).to.be.eq(1);
  });

  it("should create token by agency and put it on sale", async function () {
    const agencyAddress = await agency.getAddress();
    const tokenHolderAddress = await tokenHolder.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, ONE_DOLLAR);

    let balance = await realEstateContract.balanceOf(
      marketplaceContract.address,
      1
    );
    expect(balance).to.be.eq(1);

    balance = await realEstateContract.balanceOf(agencyAddress, 1);
    expect(balance).to.be.eq(0);
    balance = await realEstateContract.balanceOf(
      marketplaceContract.address,
      1
    );
    expect(balance).to.be.eq(1);
  });

  it("should create token by agency and put it on sale and be booked by marketplace", async function () {
    const tokenHolderAddress = await tokenHolder.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, ONE_DOLLAR);

    const bookingFee = await feeContract.getBookingFee(ONE_DOLLAR);
    usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);

    const tx = marketplaceContract.connect(marketplace).bookProperty(1, false);
    await expect(tx).not.to.be.reverted;
    await tx;
  });

  it("should create token by agency and put it on sale and be booked by marketplace, bought", async function () {
    const PRICE = eth.BigNumber.from(1).mul(ONE_DOLLAR);

    const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
    const platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);

    const finalPrice = PRICE.sub(bookingFee).add(platformFee);

    const tokenHolderAddress = await tokenHolder.getAddress();
    const buyerAddress = await marketplace.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, ONE_DOLLAR);

    const initialBalanceMarketplaceContract = await usdcContract.balanceOf(
      marketplaceContract.address
    );
    const initialBalanceMarketplace = await usdcContract.balanceOf(
      buyerAddress
    );

    await usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);

    await marketplaceContract.connect(marketplace).bookProperty(1, false);

    await usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, finalPrice);

    await marketplaceContract.connect(marketplace).signedAllDoc(1, true);
    const tx = marketplaceContract.connect(marketplace).buyProperty(1);

    await expect(tx).not.to.be.reverted;

    const finalBalanceMarketplaceContract = await usdcContract.balanceOf(
      marketplaceContract.address
    );
    const finalBalanceMarketplace = await usdcContract.balanceOf(buyerAddress);

    expect(
      finalBalanceMarketplaceContract.sub(initialBalanceMarketplaceContract)
    ).to.equal(initialBalanceMarketplace.sub(finalBalanceMarketplace));
  });

  it("should create token by agency and put it on sale and be booked by marketplace bought and fulfilled", async function () {
    const AGENCY_FEE_PERCENTAGE = eth.BigNumber.from(200);
    // const REFERRAL_FEE_PERCENTAGE = eth.BigNumber.from(100);

    const ONE_DOLLAR = eth.BigNumber.from(1_000_000);

    const PRICE = eth.BigNumber.from(500).mul(ONE_DOLLAR);

    const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
    let platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
    const agencyFee = PRICE.mul(AGENCY_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
    // const referralFee = PRICE.mul(REFERRAL_FEE_PERCENTAGE).div(HUNDRED_PERCENT);

    const finalPrice = PRICE.sub(bookingFee).add(platformFee);

    const agencyAddress = await agency.getAddress();
    const tokenHolderAddress = await tokenHolder.getAddress();

    const buyerAddress = await marketplace.getAddress();
    // const ownerAddress = await owner.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, PRICE);

    const initialBalanceMarketplaceContract = await usdcContract.balanceOf(
      marketplaceContract.address
    );
    const initialBalanceMarketplace = await usdcContract.balanceOf(
      buyerAddress
    );
    const initialBalanceTokenHolder = await usdcContract.balanceOf(
      tokenHolderAddress
    );
    // const initialBalanceOwner = await usdcContract.balanceOf(ownerAddress);

    await usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);

    await marketplaceContract.connect(marketplace).bookProperty(1, false);

    await usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, finalPrice);

    await marketplaceContract.connect(marketplace).signedAllDoc(1, true);
    await marketplaceContract.connect(marketplace).buyProperty(1);

    const finalBalanceMarketplaceContract = await usdcContract.balanceOf(
      marketplaceContract.address
    );
    const finalBalanceMarketplace = await usdcContract.balanceOf(buyerAddress);

    expect(
      finalBalanceMarketplaceContract.sub(initialBalanceMarketplaceContract)
    ).to.equal(initialBalanceMarketplace.sub(finalBalanceMarketplace));
    
    const tx = marketplaceContract.connect(marketplace).fulfillBuy(1);

    await expect(tx).not.to.be.reverted;
    // console.log(await (await tx).wait())
    platformFee = platformFee.add(platformFee.mul(200).div(10000));
    const balanceAgency = await usdcContract.balanceOf(agencyAddress);
    const balanceTokenHolder = await usdcContract.balanceOf(tokenHolderAddress);
    // const balanceMarketplace = await usdcContract.balanceOf(buyerAddress);
    // const balanceOwner = await usdcContract.balanceOf(ownerAddress);

    expect(balanceAgency).to.equal(agencyFee);
    expect(balanceTokenHolder.sub(initialBalanceTokenHolder)).to.equal(
      PRICE.mul(9500).div(10000)
    );
  });

  it("should create token by agency and put it on sale and be booked by marketplace bought and fulfilled with poa", async function () {
    // const AGENCY_FEE_PERCENTAGE = eth.BigNumber.from(200);
    // const REFERRAL_FEE_PERCENTAGE = eth.BigNumber.from(100);

    const PRICE = eth.BigNumber.from(1_000).mul(ONE_DOLLAR);

    const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
    // const platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);

    // const agencyFee = PRICE.mul(AGENCY_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
    // const referralFee = PRICE.mul(REFERRAL_FEE_PERCENTAGE).div(HUNDRED_PERCENT);

    // const agencyAddress = await agency.getAddress();
    const tokenHolderAddress = await tokenHolder.getAddress();

    // const buyerAddress = await marketplace.getAddress();
    // const ownerAddress = await owner.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, PRICE);

    // const initialBalanceMarketplaceContract = await usdcContract.balanceOf(
    //   marketplaceContract.address
    // );
    // const initialBalanceMarketplace = await usdcContract.balanceOf(
    //   buyerAddress
    // );
    // const initialBalanceTokenHolder = await usdcContract.balanceOf(
    //   tokenHolderAddress
    // );
    // const initialBalanceOwner = await usdcContract.balanceOf(ownerAddress);

    await usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);

    const tx = marketplaceContract.connect(marketplace).bookProperty(1, false);
    await expect(tx).not.to.be.reverted;
  });

  it("should create token by agency and put it on sale and be booked by marketplace bought and fulfilled but not signed all docs", async function () {
    const ONE_DOLLAR = eth.BigNumber.from(1_000_000);

    const PRICE = eth.BigNumber.from(500).mul(ONE_DOLLAR);

    const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
    let platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);

    const finalPrice = PRICE.sub(bookingFee).add(platformFee);

    const tokenHolderAddress = await tokenHolder.getAddress();

    await marketplaceContract
      .connect(agency)
      .createProperty("", tokenHolderAddress, PRICE);


    await usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, bookingFee);

    await marketplaceContract.connect(marketplace).bookProperty(1, false);

    await usdcContract
      .connect(marketplace)
      .increaseAllowance(marketplaceContract.address, finalPrice);

    const tx = marketplaceContract.connect(marketplace).buyProperty(1);
  
    await expect(tx).to.be.reverted;

    
   
  });
});

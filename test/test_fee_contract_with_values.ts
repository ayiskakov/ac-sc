import { expect } from "chai";
import { ethers } from "hardhat";
import { ethers as eth } from "ethers";

describe("Fee contract with values", function () {
  let feeContract: eth.Contract;
  let feeFactory: eth.ContractFactory;
  let owner: eth.Signer, feeChanger: eth.Signer, addr3: eth.Signer;

  // Setting up fee percentage variables
  // @example: The 100% for smart contract is 10000
  // 			 The 50% is 5000
  const BOOKING_FEE_PERCENTAGE = eth.BigNumber.from(1000);
  const PLATFORM_FEE_PERCENTAGE = eth.BigNumber.from(1000);

  const ONE_DOLLAR = eth.BigNumber.from(1_000_000);
  const HUNDRED_PERCENT = eth.BigNumber.from(10_000);
  // This is actual value of the POA FEE
  const POA_FEE = eth.BigNumber.from(2_000).mul(ONE_DOLLAR);

  const PRICE = eth.BigNumber.from(500_000).mul(ONE_DOLLAR);

  const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
  const platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);

  beforeEach(async function () {
    [owner, feeChanger, addr3] = await ethers.getSigners();

    feeFactory = await ethers.getContractFactory("Fee");
    feeContract = await feeFactory.deploy();
    await feeContract.deployed();

    // Getting address of fee changer
    const address = await feeChanger.getAddress();
    // Connecting to smart contract and setting role for the fee changer
    await feeContract.connect(owner).setFeeChanger(address);
    // Setting fee percentage for the fee contract
    await feeContract
      .connect(feeChanger)
      .setFeePercentage(
        BOOKING_FEE_PERCENTAGE,
        PLATFORM_FEE_PERCENTAGE,
      );
    // Setting POA fee for the fee contract
    await feeContract.connect(feeChanger).setPoaFee(POA_FEE);
  });

  it(`should have a booking percentage of ${BOOKING_FEE_PERCENTAGE}`, async function () {
    const feePercentage = await feeContract.getBookingPercentage();
    expect(feePercentage).to.eq(BOOKING_FEE_PERCENTAGE);
  });

  it(`should have a poa fee of ${POA_FEE}`, async function () {
    const fee = await feeContract.getPoaFee();
    expect(fee).to.eq(POA_FEE);
  });

  it(`should have booking fee of ${bookingFee} with price ${PRICE}`, async function () {
    const fee = await feeContract.getBookingFee(PRICE);
    expect(fee).to.eq(bookingFee);
  });

  it(`should have platform fee of ${platformFee} with price ${PRICE}`, async function () {
    const fee = await feeContract.getPlatformFee(PRICE);
    expect(fee).to.eq(eth.BigNumber.from(60000).mul(ONE_DOLLAR));
  });

  it("should have booking fee of 0 if input is zero", async function () {
    const fee = await feeContract.getBookingFee(0);
    expect(fee).to.eq(0);
  });

  it("should have platform fee of 0 if input is zero", async function () {
    const fee = await feeContract.getPlatformFee(0);
    expect(fee).to.eq(0);
  });

  it("should pass test", async function () {
    const fee = await feeContract.getPlatformFee(300000);
    expect(fee).to.eq(40000);

    const fee2 = await feeContract.getPlatformFee(350000);
    expect(fee2).to.eq(40000);

    const fee3 = await feeContract.getPlatformFee(400001);
    expect(fee3).to.eq(50000);

    const fee4 = await feeContract.getPlatformFee(450000);
    expect(fee4).to.eq(50000);

    const fee5 = await feeContract.getPlatformFee(500003);
    expect(fee5).to.eq(60000);

    const fee6 = await feeContract.getPlatformFee(550000);
    expect(fee6).to.eq(60000);
  });
});

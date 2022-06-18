import { expect } from "chai";
import { ethers } from "hardhat";
import { ethers as eth } from 'ethers';

describe("Fee contract initialization test", function () {
	let feeContract: eth.Contract;
	let feeFactory: eth.ContractFactory;
	let owner: eth.Signer, feeChanger: eth.Signer;
	
	before(async function () {
		[owner, feeChanger] = await ethers.getSigners();

		feeFactory = await ethers.getContractFactory("Fee");
		feeContract = await feeFactory.deploy();
		await feeContract.deployed();
	});
	

	it("should have a booking percentage of 0", async function () {
		const feePercentage = await feeContract.getBookingPercentage();
		expect(feePercentage).to.eq(0);
	});


	it("should have a platform fee percentage of 0", async function () {
		const feePercentage = await feeContract.getPlatformFeePercentage();
		expect(feePercentage).to.eq(0);
	});


	it("should have a poa fee of 0", async function () {
		const fee = await feeContract.getPoaFee();
		expect(fee).to.eq(0);
	});


	it("should have a dld fee percentage of 0", async function () {
		const feePercentage = await feeContract.getDLDFeePercentage();
		expect(feePercentage).to.eq(0);
	});


	it("should have booking fee of 0", async function () {
		const fee = await feeContract.getBookingFee(0);
		expect(fee).to.eq(0);
	});


	it("should have platform fee of 0", async function () {
		const fee = await feeContract.getPlatformFee(0);
		expect(fee).to.eq(0);
	});


	it("should have dld fee of 0", async function () {
		const fee = await feeContract.getDLDFee(0);
		expect(fee).to.eq(0);
	});


	it("should have booking fee of 0 if input not zero", async function () {
		const fee = await feeContract.getBookingFee(999999);
		expect(fee).to.eq(0);
	});


	it("should have platform fee of 0 if input not zero", async function () {
		const fee = await feeContract.getPlatformFee(999999);
		expect(fee).to.eq(0);
	});


	it("should have dld fee of 0 if input not zero", async function () {
		const fee = await feeContract.getDLDFee(999999);
		expect(fee).to.eq(0);
	});

	it("should revert if user without fee changer role tries to set fees", async function() {
        await expect(feeContract.connect(feeChanger).setFeePercentage(0, 0, 0)).to.be.reverted;
    });

	it("should set fee changer role to feeChanger signer", async function() {
		const address = await feeChanger.getAddress();
		const poaFee = eth.BigNumber.from(100000)

		const tx = feeContract.connect(owner).setFeeChanger(address);
		await expect(tx).to.be.not.reverted;


		const txSetfee = feeContract.connect(feeChanger).setFeePercentage(0, 0, 0)
		await expect(txSetfee).to.be.not.reverted;

		const txSetPOAFee = feeContract.connect(feeChanger).setPoaFee(poaFee)
		await expect(txSetPOAFee).to.be.not.reverted;

		const getPoaFee = await feeContract.getPoaFee();
		expect(getPoaFee).to.equal(eth.BigNumber.from(poaFee));
	});
});

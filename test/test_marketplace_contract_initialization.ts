import { expect } from "chai";
import { ethers } from "hardhat";
import { ethers as eth } from 'ethers';

describe("Marketplace contract initialization test", function () {
    let mockAggrContract: eth.Contract;
    let mockAggrFactory: eth.ContractFactory;

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

    let owner: eth.Signer, marketplace: eth.Signer, tokenHolder: eth.Signer, multiSigner: eth.Signer, agency: eth.Signer;

    let marketplaceContract: eth.Contract;
	let marketplaceFactory: eth.ContractFactory;

    const ONE_DOLLAR = eth.BigNumber.from(1_000_000);

    // _platform,  _realEstate,  _verifier,  _fee,  _referral,  _usdcAddress,  _priceFeed) {
    beforeEach(async function () {
		[owner, marketplace, tokenHolder, multiSigner, agency] = await ethers.getSigners();

        let multiAddress = await multiSigner.getAddress();

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

        let ownerAddress = await owner.getAddress();
        let tokenHolderAddress = await tokenHolder.getAddress();
        let marketplaceAddress = await marketplace.getAddress();

        // Setting up the mock aggregator chainlink contract
        mockAggrFactory = await ethers.getContractFactory("MockV3Aggregator");
		mockAggrContract = await mockAggrFactory.deploy(18, "2630000000000000000000");
		await mockAggrContract.deployed();

        // Setting up the mock usdc contract
		usdcFactory = await ethers.getContractFactory("MockUsdc");
		usdcContract = await usdcFactory.deploy(marketplaceAddress, tokenHolderAddress);
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
            mockAggrContract.address,
            ethers.constants.AddressZero
        );
        await marketplaceContract.deployed();

        await realEstateContract.connect(owner).setMarketplace(marketplaceContract.address);
	});

    it("should create token by agency", async function() {
        const agencyAddress = await agency.getAddress();
        const tokenHolderAddress = await tokenHolder.getAddress();

        let tx = verifierContract.connect(multiSigner).setVerificationAgency(agencyAddress, true);
        await expect(tx).not.to.be.reverted;
        await tx;

        tx = marketplaceContract.connect(agency).createProperty("", tokenHolderAddress);
        await expect(tx).not.to.be.reverted;
        await tx;

        const balance = await realEstateContract.balanceOf(agencyAddress, 1);
        expect(balance).to.be.eq(1);
    });


    it("should create token by agency and put it on sale", async function() {
        const agencyAddress = await agency.getAddress();
        const tokenHolderAddress = await tokenHolder.getAddress();

        await verifierContract.connect(multiSigner).setVerificationAgency(agencyAddress, true);
        await marketplaceContract.connect(agency).createProperty("", tokenHolderAddress);

        let balance = await realEstateContract.balanceOf(agencyAddress, 1);
        expect(balance).to.be.eq(1);
        
        await marketplaceContract.connect(agency).putOnSale(1, ONE_DOLLAR);
        balance = await realEstateContract.balanceOf(agencyAddress, 1);
        expect(balance).to.be.eq(0);
        balance = await realEstateContract.balanceOf(marketplaceContract.address, 1);
        expect(balance).to.be.eq(1);
    });


    it("should create token by agency and put it on sale and be booked by marketplace", async function() {
        const BOOKING_FEE_PERCENTAGE		= eth.BigNumber.from(1000);
        const PLATFORM_FEE_PERCENTAGE		= eth.BigNumber.from(500);
        const ADMINISTRATIVE_FEE_PERCENTAGE = eth.BigNumber.from(500);
        const DLD_FEE_PERCENTAGE 			= eth.BigNumber.from(400);
        
        const ONE_DOLLAR = eth.BigNumber.from(1_000_000);
        const HUNDRED_PERCENT = eth.BigNumber.from(10_000);
        // This is actual value of the POA FEE
        const POA_FEE = eth.BigNumber.from(2_000).mul(ONE_DOLLAR);
    
        const PRICE = eth.BigNumber.from(50_000).mul(ONE_DOLLAR);
    
        // const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        // const platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        // const administrativeFee = PRICE.mul(ADMINISTRATIVE_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        // const dldFee = PRICE.mul(DLD_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        
        
        await feeContract.connect(multiSigner).setFeePercentage(
			BOOKING_FEE_PERCENTAGE, 
			PLATFORM_FEE_PERCENTAGE, 
			ADMINISTRATIVE_FEE_PERCENTAGE, 
			DLD_FEE_PERCENTAGE
		);
		// Setting POA fee for the fee contract
		await feeContract.connect(multiSigner).setPoaFee(POA_FEE)
        
        
        const agencyAddress = await agency.getAddress();
        const tokenHolderAddress = await tokenHolder.getAddress();
        const buyerAddress = await marketplace.getAddress();

        await verifierContract.connect(multiSigner).setVerificationAgency(agencyAddress, true);
        await verifierContract.connect(multiSigner).setVerificationUser(buyerAddress, true);
        
        await marketplaceContract.connect(agency).createProperty("", tokenHolderAddress);
        await marketplaceContract.connect(agency).putOnSale(1, ONE_DOLLAR);

        const bookingFee = await feeContract.getBookingFee(ONE_DOLLAR);
        usdcContract.connect(marketplace).increaseAllowance(marketplaceContract.address, bookingFee);
        
        let tx = marketplaceContract.connect(marketplace).bookProperty(1, false);
        await expect(tx).not.to.be.reverted;
        await tx;
    });


    it("should create token by agency and put it on sale and be booked by marketplace, bought", async function() {
        const BOOKING_FEE_PERCENTAGE		= eth.BigNumber.from(1000);
        const PLATFORM_FEE_PERCENTAGE		= eth.BigNumber.from(500);
        const ADMINISTRATIVE_FEE_PERCENTAGE = eth.BigNumber.from(500);
        const DLD_FEE_PERCENTAGE 			= eth.BigNumber.from(400);
        
        const ONE_DOLLAR = eth.BigNumber.from(1_000_000);
        const HUNDRED_PERCENT = eth.BigNumber.from(10_000);
        // This is actual value of the POA FEE
        const POA_FEE = eth.BigNumber.from(2_000).mul(ONE_DOLLAR);
    
        const PRICE = eth.BigNumber.from(1).mul(ONE_DOLLAR);
    
        const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        const platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        const administrativeFee = PRICE.mul(ADMINISTRATIVE_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        const dldFee = PRICE.mul(DLD_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        
        const finalPrice = PRICE.sub(bookingFee).add(platformFee).add(administrativeFee).add(dldFee);

        await feeContract.connect(multiSigner).setFeePercentage(
			BOOKING_FEE_PERCENTAGE, 
			PLATFORM_FEE_PERCENTAGE, 
			ADMINISTRATIVE_FEE_PERCENTAGE, 
			DLD_FEE_PERCENTAGE
		);
		// Setting POA fee for the fee contract
		await feeContract.connect(multiSigner).setPoaFee(POA_FEE)
        
        
        const agencyAddress = await agency.getAddress();
        const tokenHolderAddress = await tokenHolder.getAddress();
        const buyerAddress = await marketplace.getAddress();

        await verifierContract.connect(multiSigner).setVerificationAgency(agencyAddress, true);
        await verifierContract.connect(multiSigner).setVerificationUser(buyerAddress, true);
        
        await marketplaceContract.connect(agency).createProperty("", tokenHolderAddress);
        await marketplaceContract.connect(agency).putOnSale(1, ONE_DOLLAR);
        
        const initialBalanceMarketplaceContract = await usdcContract.balanceOf(marketplaceContract.address);
        const initialBalanceMarketplace = await usdcContract.balanceOf(buyerAddress);
        
        await usdcContract.connect(marketplace).increaseAllowance(marketplaceContract.address, bookingFee);

        await marketplaceContract.connect(marketplace).bookProperty(1, false);

        await usdcContract.connect(marketplace).increaseAllowance(marketplaceContract.address, finalPrice);
        
        const tx = marketplaceContract.connect(marketplace).buyProperty(1);
  
        await expect(tx).not.to.be.reverted;

        const finalBalanceMarketplaceContract = await usdcContract.balanceOf(marketplaceContract.address);
        const finalBalanceMarketplace = await usdcContract.balanceOf(buyerAddress);
        
        expect(finalBalanceMarketplaceContract.sub(initialBalanceMarketplaceContract)).to.equal(initialBalanceMarketplace.sub(finalBalanceMarketplace));
    });



    it("should create token by agency and put it on sale and be booked by marketplace bought and fulfilled", async function() {
        const BOOKING_FEE_PERCENTAGE		= eth.BigNumber.from(1000);
        const PLATFORM_FEE_PERCENTAGE		= eth.BigNumber.from(500);
        const ADMINISTRATIVE_FEE_PERCENTAGE = eth.BigNumber.from(500);
        const DLD_FEE_PERCENTAGE 			= eth.BigNumber.from(400);
        
        const ONE_DOLLAR = eth.BigNumber.from(1_000_000);
        const HUNDRED_PERCENT = eth.BigNumber.from(10_000);
        // This is actual value of the POA FEE
        const POA_FEE = eth.BigNumber.from(2_000).mul(ONE_DOLLAR);
    
        const PRICE = eth.BigNumber.from(1).mul(ONE_DOLLAR);
    
        const bookingFee = PRICE.mul(BOOKING_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        const platformFee = PRICE.mul(PLATFORM_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        const administrativeFee = PRICE.mul(ADMINISTRATIVE_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        const dldFee = PRICE.mul(DLD_FEE_PERCENTAGE).div(HUNDRED_PERCENT);
        
        const finalPrice = PRICE.sub(bookingFee).add(platformFee).add(administrativeFee).add(dldFee);

        await feeContract.connect(multiSigner).setFeePercentage(
			BOOKING_FEE_PERCENTAGE, 
			PLATFORM_FEE_PERCENTAGE, 
			ADMINISTRATIVE_FEE_PERCENTAGE, 
			DLD_FEE_PERCENTAGE
		);
		// Setting POA fee for the fee contract
		await feeContract.connect(multiSigner).setPoaFee(POA_FEE)
        
        
        const agencyAddress = await agency.getAddress();
        const tokenHolderAddress = await tokenHolder.getAddress();
        const buyerAddress = await marketplace.getAddress();

        await verifierContract.connect(multiSigner).setVerificationAgency(agencyAddress, true);
        await verifierContract.connect(multiSigner).setVerificationUser(buyerAddress, true);
        
        await marketplaceContract.connect(agency).createProperty("", tokenHolderAddress);
        await marketplaceContract.connect(agency).putOnSale(1, ONE_DOLLAR);
        
        const initialBalanceMarketplaceContract = await usdcContract.balanceOf(marketplaceContract.address);
        const initialBalanceMarketplace = await usdcContract.balanceOf(buyerAddress);
        
        await usdcContract.connect(marketplace).increaseAllowance(marketplaceContract.address, bookingFee);

        await marketplaceContract.connect(marketplace).bookProperty(1, false);

        await usdcContract.connect(marketplace).increaseAllowance(marketplaceContract.address, finalPrice);
        
        await marketplaceContract.connect(marketplace).buyProperty(1);
  
        const finalBalanceMarketplaceContract = await usdcContract.balanceOf(marketplaceContract.address);
        const finalBalanceMarketplace = await usdcContract.balanceOf(buyerAddress);
        
        expect(finalBalanceMarketplaceContract.sub(initialBalanceMarketplaceContract)).to.equal(initialBalanceMarketplace.sub(finalBalanceMarketplace));

        const tx = marketplaceContract.connect(marketplace).fullfillBuy(1);
        await expect(tx).not.to.be.reverted;
    });

}); 
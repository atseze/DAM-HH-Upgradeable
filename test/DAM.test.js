require("@nomicfoundation/hardhat-ethers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

const sharePercent = 50;
const asset1Name = "Asset 1";
const asset1Price = ethers.parseEther("0.2");
let asset1Index;
let marketAddress;

describe("Checking market initial state", async () => {
  let myMarket, provider;

  before(async () => {
    provider = ethers.provider;
    const Market = await ethers.getContractFactory("DigitalAssetMarket");
    myMarket = await upgrades.deployProxy(Market, [sharePercent]);
    await myMarket.waitForDeployment();
  });

  it("Check share percent", async () => {
    expect(await myMarket.sharePercent()).to.be.equal(sharePercent);
  });

  it("Check that market is empty", async () => {
    expect(await myMarket.assetsCount()).to.be.equal(0);
  });

  it("Check that market balance is zero", async () => {
    expect(await provider.getBalance(await myMarket.getAddress())).to.be.equal(
      0
    );
  });
});

describe("Checking market business", () => {
  let myMarket, owner, seller, buyer, provider;

  before(async () => {
    provider = ethers.provider;

    const Market = await ethers.getContractFactory("DigitalAssetMarket");
    myMarket = await upgrades.deployProxy(Market, [sharePercent]);
    await myMarket.waitForDeployment();
    marketAddress = await myMarket.getAddress();
    const accounts = await ethers.getSigners();
    owner = accounts[0];
    seller = accounts[1];
    buyer = accounts[2];
  });

  it("Seller add asset to market", async () => {
    await myMarket.once("NewAsset", (_address, _name, _index) => {
      asset1Index = _index;
    });
    await myMarket.connect(seller).addAsset(asset1Name, asset1Price);
  });

  it("Asset must added to market", async () => {
    expect(await myMarket.assetsCount()).equal(1);
    const asset1 = await myMarket.assetData(Number(asset1Index));
    expect(asset1[0]).to.be.equal(asset1Name);
    expect(asset1[1]).to.be.equal(asset1Price);
    expect(asset1[2]).to.be.equal(0);
  });

  it("Unathorized access to assets data are prohabitted", async () => {
    expect(myMarket.connect(seller).assetData(asset1Index)).to.be.revertedWith(
      "Only market owner can call this method!"
    );
  });

  it("Buyer can noy buy asset with incorrect value", async () => {
    await expect(
      myMarket.connect(buyer).buy(asset1Index, {
        value: ethers.parseEther("0.0001"),
      })
    ).to.be.revertedWith("Value and price are different!");
  });

  it("Buyer can not buy a product with an invalid index", async () => {
    await expect(
      myMarket.connect(buyer).buy(100, {
        value: asset1Price,
      })
    ).to.be.revertedWith("The asset reference is not valid!");
  });

  it("Buyer can buy asset with correct value", async () => {
    const startingBalance = await provider.getBalance(await buyer.address);
    asset1 = await myMarket.assetData(asset1Index);

    const txPromise = myMarket.connect(buyer).buy(asset1Index, {
      value: asset1Price,
    });
    const txReceipt = await txPromise;
    await expect(txPromise).not.to.be.reverted;
    const trx = await provider.getTransactionReceipt(txReceipt.hash);
    const changedBalance = await provider.getBalance(buyer.address);

    expect(changedBalance).to.be.lessThan(startingBalance);

    expect(changedBalance).to.be.equal(
      startingBalance - trx.gasUsed * trx.gasPrice - asset1Price
    );
    expect(await provider.getBalance(await myMarket.getAddress())).to.be.equal(
      (asset1Price * BigInt(sharePercent)) / 100n
    );
  });

  it("Seller and buyer must be different", async () => {
    const txPromise = myMarket.connect(seller).buy(asset1Index, {
      value: asset1Price,
    });

    await expect(txPromise).not.to.be.revertedWith("This item is yours!");
  });

  it("An item cannot be sold twice", async () => {
    expect(
      myMarket.connect(buyer).buy(asset1Index, {
        value: asset1Price,
      })
    ).to.be.revertedWith("This item is not for sale!");
  });

  it("Only market owner can withdraw money", async () => {
    expect(
      myMarket.connect(seller).withdraw(ethers.parseEther("0.01"))
    ).to.be.revertedWith("Only market owner can withdraw money!");
  });

  it("Withdrawn amount must be lte market balance", async () => {
    expect(myMarket.withdraw(asset1Price)).to.be.revertedWith(
      "Not enough money!"
    );
  });

  it("Owner can withdraw market balance", async () => {
    const ownerStartingBalance = await provider.getBalance(owner.address);
    const marketStartingBalance = await provider.getBalance(
      await myMarket.getAddress()
    );

    const txPromise = await myMarket.withdraw(marketStartingBalance);
    const txReceipt = await txPromise;
    await expect(txPromise).not.to.be.reverted;
    const trx = await provider.getTransactionReceipt(txReceipt.hash);

    const marketNewBalance = await provider.getBalance(
      await myMarket.getAddress()
    );
    expect(marketNewBalance).to.be.equal(0);
    const ownerNewBalance = await provider.getBalance(owner.address);
    expect(ownerNewBalance).to.be.equal(
      ownerStartingBalance + marketStartingBalance - trx.gasUsed * trx.gasPrice
    );
  });
});

describe("Upgarde the market to version 2", async () => {
  let myMarket2, provider;

  before(async () => {
    provider = ethers.provider;
    const Market2 = await ethers.getContractFactory("DigitalAssetMarketV2");
    myMarket2 = await upgrades.upgradeProxy(marketAddress, Market2, [
      sharePercent,
    ]);
    await myMarket2.waitForDeployment();
  });

  it("Check the existance of new method", async () => {
    expect(myMarket2.withdrawAsset).to.be.a("function");
  });

  it("New market must be in the same address of previous", async () => {
    expect(await myMarket2.getAddress()).to.be.equal(marketAddress);
  });
});

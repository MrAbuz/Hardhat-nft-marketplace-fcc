//Patrick: Ideally, only 1 assert per "it" block
//                  check everything
//                  goal: check the test coverage in the end to make sure its 100%

const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Unit Tests", () => {
          let nftMarketplace, basicNft, accounts, deployer, player
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0
          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = accounts[0] //could also use (await getNamedAccounts()).deployer
              player = accounts[1] //patrick says its better like this cuz of the type
              await deployments.fixture(["all"])
              nftMarketplace = await ethers.getContract("NftMarketplace") //getContract defaults to grabbing the account 0 which is our deployer, so we dont need to say it
              basicNft = await ethers.getContract("BasicNft")
              await basicNft.mintNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID) //approve the marketplace to sell our nft
          })

          describe("listItem function", () => {
              it("adds the listing to the listings mapping", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  //nice, this is how you test for structs!
                  assert.equal(listing.price.toString(), PRICE.toString())
                  assert.equal(listing.seller.toString(), deployer.address)
              })
              it("emits the ItemListed event", async () => {
                  await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit(
                      nftMarketplace,
                      "ItemListed"
                  )
              })
              it("modifier notListed - reverts if the nft is already listed", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const error = `NftMarketplace__AlreadyListed("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error)
              })
              it("modifier isOwner - reverts if it's not the owner trying to list the nft", async () => {
                  const nftMarketplacePlayer = await nftMarketplace.connect(player) //patrick just used await in 1 of the .connects so now i'm not sure if the await is needed
                  await expect(
                      nftMarketplacePlayer.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("reverts if the price provided is equal or less than 0", async () => {
                  const newPriceOne = 0
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, newPriceOne)
                  ).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })
              it("reverts if the marketplace doesn't have the nft's approval to sell the nft", async () => {
                  await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID) //address zero
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotApprovedForMarketplace")
              })
          })
          describe("buyItem function", () => {
              it("emits the ItemBought event", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  await expect(
                      nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  ).to.emit(nftMarketplacePlayer, "ItemBought")
              })
              it("modifier isListed - reverts if the nft is not listed", async () => {
                  await expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  ).to.revertedWith("NftMarketplace__NotListed")
              })
              it("reverts if the price paid is lower than the price that the nft was listed for", async () => {
                  const lowerPrice = ethers.utils.parseEther("0.01")
                  assert(lowerPrice.toString() < PRICE.toString())
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  await expect(
                      nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, {
                          value: lowerPrice,
                      })
                  ).to.be.revertedWith("NftMarketplace__PriceNotMet")
              })
              it("after the nft is sold, it adds the sold amount to the seller's proceeds mapping", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  let tx = await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  await tx.wait(1)
                  const proceeds = await nftMarketplace.getProceeds(deployer.address)
                  assert.equal(proceeds.toString(), PRICE.toString())
              })
              it("after the nft is sold, the listing is deleted from the listing's mapping", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  let tx = await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  await tx.wait(1)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), 0)
                  assert.equal(listing.seller.toString(), ethers.constants.AddressZero) // nice way to add the address 0x000..
              })
              it("after the nft is sold, the nft is transfered to the buyers address", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  let tx = await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  await tx.wait(1)
                  const owner = await basicNft.ownerOf(TOKEN_ID)
                  assert.equal(owner, player.address)
              })
          })
          describe("cancelLIsting function", () => {
              it("cancels the listing", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price, 0)
                  assert.equal(listing.seller.toString(), ethers.constants.AddressZero)
              })
              it("emits the ItemCanceled event", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)).to.emit(
                      nftMarketplace,
                      "ItemCanceled"
                  )
              })
              it("modifier isOwner - reverts if its not the owner of the nft trying to cancel the listing", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  await expect(
                      nftMarketplacePlayer.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("modifier isListed - reverts if the nft is not listed", async () => {
                  const error = `NotListed("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith(error)
              })
          })
          describe("updateListing function", () => {
              it("updates the listing with a new price", async () => {
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), newPrice.toString())
                  assert(listing.price.toString() != PRICE)
              })
              it("emits the ItemListed event", async () => {
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  ).to.emit(nftMarketplace, "ItemListed")
              })
              it("reverts if the new price is below or equal to zero", async () => {
                  const newPrice = 0
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  ).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })
              it("modifier isListed - reverts if the nft is not listed", async () => {
                  const newPrice = 0
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  ).to.be.revertedWith("NftMarketplace__NotListed")
              })
              it("modifier isOwner - reverts if the person trying to update the listing is not the nft owner", async () => {
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  await expect(
                      nftMarketplacePlayer.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
          })
          describe("withdrawProceeds function", () => {
              it("transfers the proceeds to the seller", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  const proceeds = await nftMarketplace.getProceeds(deployer.address)
                  const balanceBefore = await deployer.getBalance()
                  const txResponse = await nftMarketplace.withdrawProceeds()
                  const transactionReceipt = await txResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const balanceAfter = await deployer.getBalance()

                  assert.equal(
                      balanceAfter.add(gasCost).toString(),
                      balanceBefore.add(proceeds).toString()
                  )
              })
              it("it reverts if the caller has no proceeds to retrieve", async () => {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                      "NftMarketplace__NoProceeds"
                  )
              })
              it("clears the proceeds mapping of the seller to zero", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await nftMarketplace.connect(player)
                  await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  const proceedsBefore = await nftMarketplace.getProceeds(deployer.address)
                  assert.equal(proceedsBefore.toString(), PRICE.toString())
                  await nftMarketplace.withdrawProceeds()
                  const proceedsAfter = await nftMarketplace.getProceeds(deployer.address)
                  assert.equal(proceedsAfter.toString(), 0)
              })
          })
      })

//how to test the ReentrancyGuard
//got 97% coverage, missing line 208 that I dont know how to test that revert of the transfer

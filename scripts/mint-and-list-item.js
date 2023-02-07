const { ethers } = require("hardhat")

const PRICE = ethers.utils.parseEther("0.1")

async function mintAndList() {
    const nftMarketplace = await ethers.getContract("NftMarketplace")
    const randomNumber = Math.floor(Math.random() * 2)
    let basicNft
    if (randomNumber == 1) {
        basicNft = await ethers.getContract("BasicNft")
    } else {
        basicNft = await ethers.getContract("BasicNftTwo")
    }
    console.log("Minting NFT...")
    const mintTx = await basicNft.mintNft()
    const mintTxReceipt = await mintTx.wait(1)
    const tokenId = mintTxReceipt.events[0].args.tokenId

    console.log("Approving Nft...")
    const approvalTx = await basicNft.approve(nftMarketplace.address, tokenId)
    await approvalTx.wait(1)

    console.log("Listing NFT...")
    const tx = await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
    await tx.wait(1)
    console.log("Listed!")

    //if (network.config.chainId == 31337) {
    // Was only to be used in Moralis cuz while using hardhat localhost chain we had to move 1 block for the moralis event database to validate the event.
    // But funny script to keep here for future use if needed
    //     await moveBlocks(1, (sleepAmount = 1000))
    //}
}

mintAndList()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })

const {
    frontEndContractsFile, // "../nextjs-nft-marketplace-moralis-fcc/constants/networkMapping.json"
    frontEndContractsFile2, // "../nextjs-nft-marketplace-thegraph-fcc/constants/networkMapping.json"
    frontEndAbiLocation, // "../nextjs-nft-marketplace-moralis-fcc/constants/"
    frontEndAbiLocation2, // "../nextjs-nft-marketplace-thegraph-fcc/constants/"
} = require("../helper-hardhat-config")
require("dotenv").config()
const fs = require("fs")
const { network } = require("hardhat")

// still need to add the contants file there and fix all of this with the helper-hardhat-config.js
// re-read all this properly, but its easy

// this "fs.writeFileSync" writes wathever we want in any file in the location we specify, so nice
// "fs.readFileSync" reads from whathever location we want

module.exports = async () => {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Writing to front end...")
        await updateContractAddresses()
        await updateAbi()
        console.log("Front end written!")
    }
}

async function updateAbi() {
    const nftMarketplace = await ethers.getContract("NftMarketplace")
    fs.writeFileSync(
        //here we want to just just create a new/replace the json file everytime we create a new abi (cuz we dont want an old ABI, but we must likely want an old address)
        //so with the contract addresses we readFileSync(), alter the file, then we writeFileSync() that altered file to that location;
        //here we just write the abi and replace wathever is there
        //if an NftMarketplace.json is not created at that location, it creates. If not it alters. Suppose its like this
        //all this logic is quite simple, the syntax seems strange but its easy to do and super useful to have it set up
        `${frontEndAbiLocation}NftMarketplace.json`,
        nftMarketplace.interface.format(ethers.utils.FormatTypes.json)
    )
    fs.writeFileSync(
        `${frontEndAbiLocation2}NftMarketplace.json`,
        nftMarketplace.interface.format(ethers.utils.FormatTypes.json)
    )

    const basicNft = await ethers.getContract("BasicNft")
    fs.writeFileSync(
        `${frontEndAbiLocation}BasicNft.json`,
        basicNft.interface.format(ethers.utils.FormatTypes.json)
    )
    fs.writeFileSync(
        `${frontEndAbiLocation2}BasicNft.json`,
        basicNft.interface.format(ethers.utils.FormatTypes.json)
    )
}

async function updateContractAddresses() {
    const chainId = network.config.chainId.toString()
    const nftMarketplace = await ethers.getContract("NftMarketplace")
    const contractAddresses = JSON.parse(fs.readFileSync(frontEndContractsFile, "utf8"))
    //here we have the location for the addresses with the file already defined "../nextjs-nft-marketplace-moralis-fcc/constants/networkMapping.json"
    //im assuming because we are reading from it first, then we are writing. so initially we created a json file by hand with just "{}" so we have something to read from,
    //and so we define the location already with the file.
    //in the abi we didnt need to replace anything (cuz we dont need an old abi) so we just writeFileSync() and we dont even need to have a file already created, we just create
    //and if its already there we replace (think its like this and makes sense)
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId]["NftMarketplace"].includes(nftMarketplace.address)) {
            contractAddresses[chainId]["NftMarketplace"].push(nftMarketplace.address)
        }
    } else {
        contractAddresses[chainId] = { NftMarketplace: [nftMarketplace.address] }
    }
    fs.writeFileSync(frontEndContractsFile, JSON.stringify(contractAddresses))
    fs.writeFileSync(frontEndContractsFile2, JSON.stringify(contractAddresses))
}
module.exports.tags = ["all", "frontend"]

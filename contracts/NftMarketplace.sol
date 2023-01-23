// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

error NftMarketplace__PriceMustBeAboveZero();
error NftMarketplace__NotApprovedForMarketplace();
error NftMarketplace__AlreadyListed(address nftAddress, uint256 tokenId);

contract NftMarketplace {
    struct Listing {
        //because we want to either include the address of the seller aswell as the price in the mapping, so instead of 2 mappings we'll do a struct
        uint256 price;
        address seller;
    }

    event ItemListed(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    // NFT Contract address -> NFT TokenID -> Listing
    mapping(address => mapping(uint256 => Listing)) private s_listings;

    ////////////////////
    //   Modifiers    //
    ////////////////////

    modifier notListed(
        address nftAddress,
        uint256 tokenId,
        address owner
    ) {
        //we wanna make sure that we only list NFTs that haven't already been listed
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price > 0) {
            revert NftMarketplace__AlreadyListed(nftAddress, tokenId);
        }
        _;
    }

    ////////////////////
    // Main Functions //
    ////////////////////

    function listItem(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    ) external notListed(nftAddress, tokenId, msg.sender) {
        //We can actually do this in 2 different ways:
        // 1. Send the NFT to the contract. Transfer -> Contract "hold" the NFT. But this makes it gas expensive for someone to list NFTs, and makes it harder for someone to prove its their nft if they have it listed.
        // 2. Owners can still hold their NFT, and give the marketplace approval to sell the NFT for them. Ofc owners of the nft could withdraw approval at any time and the marketplace wouldnt be able to sell it, but people could easily see if its really approved for the marketplace or not.
        // This 2nd way seems to be the least intrusive way to run this NFT Marketplace. People will still have ownership of their NFTs.
        if (price <= 0) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }
        IERC721 nft = IERC721(nftAddress);
        if (nft.getApproved(tokenId) != address(this)) {
            //getApproved() from the ERC721 standart
            //checks to see if the marketplace contract has an approval over that tokenId's nft
            revert NftMarketplace__NotApprovedForMarketplace();
        }
        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
        //"what's the best practise for updating mappings? you guessed it. we need to emit an event"

        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }
}

//    1. `listItem`: List NFT on the marketplace
//    2. `buyItem`: Buy the NFTs
//    3. `cancelItem`: Cancel a listing
//    4. `updateListing`: Update Price
//    5. `withdrawProceeds`: Withdraw payment for my bought NFTs

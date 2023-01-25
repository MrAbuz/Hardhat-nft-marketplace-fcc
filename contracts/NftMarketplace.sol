// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
//actually this reentrancy guard looks good because it uses uints instead of bools to save gas and worries about refunds(read in the contract). but is it necessary if
//we always do the best practise of doing external calls in the end of the functions?

error NftMarketplace__PriceMustBeAboveZero();
error NftMarketplace__NotApprovedForMarketplace();
error NftMarketplace__AlreadyListed(address nftAddress, uint256 tokenId);
error NftMarketplace__NotOwner();
error NftMarketplace__NotListed(address nftAddress, uint256 tokenId);
error NftMarketplace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);
error NftMarketplace__NoProceeds();
error NftMarketplace__TransferFailed();

contract NftMarketplace is ReentrancyGuard {
    struct Listing {
        //because we want to either include the address of the seller aswell as the price in the listings mapping, so instead of 2 mappings we'll do a struct
        uint256 price;
        address seller;
    }

    event ItemListed(
        address indexed seller,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemBought(
        address indexed buyer,
        address indexed nftAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemCanceled(address indexed seller, address indexed nftAddress, uint256 indexed tokenId);

    // NFT Contract address -> NFT TokenID -> Listing struct
    mapping(address => mapping(uint256 => Listing)) private s_listings;

    // Seller address -> Amount earned
    mapping(address => uint256) private s_proceeds;

    ////////////////////
    //   Modifiers    //
    ////////////////////

    modifier notListed(address nftAddress, uint256 tokenId) {
        //check in the end if we're doing this "if reverts" as modifier to have the functions cleaner or because we'll re-use them
        //we wanna make sure that we only list NFTs that haven't already been listed
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price > 0) {
            revert NftMarketplace__AlreadyListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isOwner(
        address nftAddress,
        uint256 tokenId,
        address spender
    ) {
        //checks if the msg.sender is the owner of the nft he's trying to list
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        if (spender != owner) {
            revert NftMarketplace__NotOwner();
        }
        _;
    }

    modifier isListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if (listing.price <= 0) {
            revert NftMarketplace__NotListed(nftAddress, tokenId);
        }
        _;
    }

    ////////////////////
    // Main Functions //
    ////////////////////

    /*
     * @notice Method for listing your NFT on the marketplace
     * @param nftAddress: Address of the NFT
     * @param tokenId: Token ID of the NFT
     * @param price: Sale price of the listed NFT
     * @dev Technically, we could have the contract be the escrow for the NFTs but this way people can still hold their NFTs when listed.
     */

    function listItem(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    )
        external
        // Challenge: Have this contract accept payments in a subset of tokens as well
        // 1. Hint: Use Chainlink Price Feeds to convert the price of the tokens between each other. He added "address tokenPayment" as a parameter while explaining (23:58:50)
        // 2. Be able to set prices in other currencies?
        // 3. Tweet me @PatrickAlphaC if you come up with a solution! (in github he added this challenge in buyItem but in the video he explained here).
        notListed(nftAddress, tokenId)
        isOwner(nftAddress, tokenId, msg.sender)
    {
        //We can actually do this in 2 different ways:
        // 1. Send the NFT to the contract. Transfer -> Contract "hold" the NFT. But this makes it gas expensive for someone to list NFTs, and makes it harder for someone to prove they have that nft for other things if they have it listed.
        // 2. Owners can still hold their NFT, and give the marketplace approval to sell the NFT for them. Ofc owners of the nft could withdraw approval at any time and the marketplace wouldnt be able to sell it, but people could easily see if its really approved for the marketplace or not.
        // This 2nd way seems to be the least intrusive way to run this NFT Marketplace and that's the way we'll use. People will still have ownership of their NFTs.
        if (price <= 0) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }
        IERC721 nft = IERC721(nftAddress);
        if (nft.getApproved(tokenId) != address(this)) {
            //getApproved() from the ERC721 standart
            //gets the address that has an approval for that token id's nft and checks to see if that address is our marketplace contract address
            revert NftMarketplace__NotApprovedForMarketplace();
        }
        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
        //"what's the best practise for updating mappings? you guessed it. we need to emit an event"

        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }

    /*
     * @notice Method for buying a listed NFT
     * @notice The owner of an NFT could unapprove the marketplace, which would cause this function to fail. Ideally you'd also have a `createOffer` functionality.
     * @param nftAddress: Address of the NFT
     * @param tokenId: Token ID of the NFT
     */

    function buyItem(
        address nftAddress,
        uint256 tokenId
    ) external payable nonReentrant isListed(nftAddress, tokenId) {
        //we could also check if the contract still has the approval to transfer that nft like we did above, cuz the seller can remove the approval after listing.
        //tho the transaction will throw anyway in safeTransferFrom because it checks for the approvals but at that point it consumed all this gas, but ye its not a big problem
        Listing memory listedItem = s_listings[nftAddress][tokenId];
        if (msg.value < listedItem.price) {
            //shouldnt this be != ? because > price should not be allowed aswell
            revert NftMarketplace__PriceNotMet(nftAddress, tokenId, listedItem.price);
        }
        //pull over push:
        //you notice that we dont just send the money to the seller. Solidity has this concept of pull over push (*), and its considered a best practise when working with solidity.
        //you wanna shift the risk associated with transferring ether to the user
        //principle from the site: never trust external calls to execute without throwing an error
        //instead of sending the money to the user; you want to have them withdraw the money
        s_proceeds[listedItem.seller] += msg.value;
        // (nice!) to delete an entry in a mapping, we use:
        delete (s_listings[nftAddress][tokenId]);
        //safeTransferFrom checks for a bunch more requisites than transferFrom (**)
        //we cant check to make sure the NFT was transfered because neither transferFrom or safeTransferFrom return anything, but we can use the safest transfer
        IERC721(nftAddress).safeTransferFrom(listedItem.seller, msg.sender, tokenId);
        //and now, since we updated a mapping, we emit an event:
        emit ItemBought(msg.sender, nftAddress, tokenId, listedItem.price);
    }

    /*
     * @notice Method for cancelling a listing
     * @param nftAddress: Address of the NFT
     * @param tokenId: Token ID of the NFT
     */

    function cancelListing(
        address nftAddress,
        uint256 tokenId
    ) external isOwner(nftAddress, tokenId, msg.sender) isListed(nftAddress, tokenId) {
        delete (s_listings[nftAddress][tokenId]);
        emit ItemCanceled(msg.sender, nftAddress, tokenId);
    }

    /*
     * @notice Method for updating a listing
     * @param nftAddress: Address of the NFT
     * @param tokenId: Token ID of the NFT
     * @param newPrice: New price in Wei for the NFT
     */

    function updateListing(
        address nftAddress,
        uint256 tokenId,
        uint256 newPrice
    ) external isListed(nftAddress, tokenId) nonReentrant isOwner(nftAddress, tokenId, msg.sender) {
        if (newPrice <= 0) {
            revert NftMarketplace__PriceMustBeAboveZero();
        }

        s_listings[nftAddress][tokenId].price = newPrice;
        //we didnt create a new event cuz by updating we're essentially re-listing it with a new price
        emit ItemListed(msg.sender, nftAddress, tokenId, newPrice);
    }

    /*
     * @notice Method for a user to withdraw the proceeds from his NFT sales
     */

    function withdrawProceeds() external {
        uint256 proceeds = s_proceeds[msg.sender];
        if (proceeds <= 0) {
            revert NftMarketplace__NoProceeds();
        }
        s_proceeds[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: proceeds}("");
        if (!success) {
            revert NftMarketplace__TransferFailed();
        }
    }

    //////////////////////
    // Getter Functions //
    //////////////////////

    function getListing(
        address nftAddress,
        uint256 tokenId
    ) external view returns (Listing memory) {
        return s_listings[nftAddress][tokenId];
    }

    function getProceeds(address seller) external view returns (uint256) {
        return s_proceeds[seller];
    }
}

//    Plan:
//    1. `listItem`: List NFT on the marketplace
//    2. `buyItem`: Buy the NFTs
//    3. `cancelItem`: Cancel a listing
//    4. `updateListing`: Update Price
//    5. `withdrawProceeds`: Withdraw payment for my bought NFTs

// (*) https://fravoll.github.io/solidity-patterns/pull_over_push.html
// (**) ctrl f "safeTransferFrom" -> text above the function  https://eips.ethereum.org/EIPS/eip-721

// Check out https://github.com/Fantom-foundation/Artion-Contracts/blob/5c90d2bc0401af6fb5abf35b860b762b31dfee02/contracts/FantomMarketplace.sol
// For a full decentralized nft marketplace that we took ideas from

const assert = require("assert");
const Battleship = artifacts.require("Battleship");
const BID = 1000000000000000000;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const FAKE_MERKLE = "98765432198765432198765432198765";

// TESTS:
contract("Battleship", accounts => {
    let ethership;

    beforeEach('new Battleship obj', async () => {
        ethership = await Battleship.new();
    });

    describe('Store bids', () => {

        it("basic store_bids check for one player", async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            
            assert(await ethership.get_player1_addr.call() == accounts[1], "Player 1 address not stored correctly.");
            assert(await ethership.get_player2_addr.call() == ZERO_ADDR, "Player 2 address not stored correctly.");
            assert(await ethership.get_bit.call() == BID, "BID value not stored correctly.");

        }).timeout(100000);

        it("basic store_bids check for two players", async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID + 1256});

            assert(await ethership.get_player1_addr.call() == accounts[1], "Player 1 address not stored correctly.");
            assert(await ethership.get_player2_addr.call() == accounts[2], "Player 2 address not stored correctly.");
            assert(await ethership.get_bit.call() == BID*2, "BID value not stored correctly.");

        }).timeout(100000);
    });
});
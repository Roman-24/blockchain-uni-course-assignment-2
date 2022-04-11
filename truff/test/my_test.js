const assert = require("assert");
const Battleship = artifacts.require("Battleship");
const BID = 100000000000000;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const MERKLE = "98765543219876543219876432198765";
const MERKLE2 = "98765436543219821987765432198765";
const MERKLE3 = "98762199873682154319876543254765";
const TIMER = 100001;

// TESTS:
contract("Battleship", accounts => {

    let ethership;
    beforeEach('new Battleship obj', async () => {
        ethership = await Battleship.new();
    });

    describe('Store bids', () => {

        it("basic store_bids check for one player", async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            
            assert(await ethership.get_player1_addr.call() == accounts[1], "Player 1 address not stored correctly");
            assert(await ethership.get_player2_addr.call() == ZERO_ADDR, "Player 2 address not stored correctly");
            assert(await ethership.get_bid.call() == BID, "BID value not stored correctly");

        }).timeout(TIMER);

        it("basic store_bids check for two players", async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID + 1256});

            assert(await ethership.get_player1_addr.call() == accounts[1], "Player 1 address not stored correctly");
            assert(await ethership.get_player2_addr.call() == accounts[2], "Player 2 address not stored correctly");
            assert(await ethership.get_bid.call() == BID*2, "BID value not stored correctly");

        }).timeout(TIMER);
    });

    describe('Clear_state', () => {

        it("Chceck if all atributes are cleared", async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID + 1256});

            try {
                ethership.clear_state();
            } catch (error) {
                // console.error(error);
                assert(error, "Func is not err");
            }
             
        }).timeout(TIMER);

    });

    describe('Store_board_commitment', () => {

        it('Should store player1 and player2 board commitments', async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID});

            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});

            assert(await ethership.get_player1_merkle_root.call() == web3.utils.asciiToHex(MERKLE), "Player1 board commitment not stored correctly");
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});
            assert(await ethership.get_player2_merkle_root.call() == web3.utils.asciiToHex(MERKLE2), "Player2 board commitment not stored correctly");

        }).timeout(TIMER);

        it('Should revert as player 1 tries to submit merkle after submittion of both players', async () => {
            
            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID});

            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});

            await tryCatch (ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]}), "store_board_commitment: Game is not in session");
            await tryCatch (ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]}), "store_board_commitment: Game is not in session");

        }).timeout(TIMER);

        it('Player 3 tries to set merkle', async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID});

            await tryCatch(ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE3), {from: accounts[3]}),"store_board_commitment: Only players can store board commitments");

        }).timeout(TIMER);

    });

    describe('Forfeit', () => {

        it('Should end the game', async function () {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID+52368});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});
            await ethership.forfeit(accounts[2], {from: accounts[1]});
        
            assert(await ethership.is_game_over.call(), "Game not end as was predicted");
            assert(await ethership.get_player1_addr.call() == ZERO_ADDR, "Player 1 address not zero");
            assert(await ethership.get_player2_addr.call() == ZERO_ADDR, "Player 2 address not zero");
            assert(await ethership.get_bid.call() == 0, "BID value not zero");
            assert(await ethership.get_state.call() == 0, "BID value not zero");

        }).timeout(TIMER);

        it('Should not make forfeit - Opponent cannot be sender', async function () {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID+12563});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});

            await tryCatch(ethership.forfeit(accounts[2], {from: accounts[2]}), "forfeit: Opponent cannot be sender");
            assert(((await ethership.is_game_over.call()) == false), "Game ended as not expected");

        }).timeout(TIMER);
    });

    describe("Timeout testing", () => {

        it('Should end the game', async function () {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID+52368});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});
        
            await tryCatch (ethership.claim_opponent_left(accounts[1] , {from: accounts[3]}), "claim_opponent_left: Only players can claim opponent left");

            await ethership.claim_opponent_left(accounts[1] , {from: accounts[2]});
            assert(await ethership.get_winner.call() != ZERO_ADDR, "Winner address is zero");
            assert(await ethership.get_timeout_stamp.call() != 0, "Timeout_stamp is zero");

        }).timeout(TIMER);

        it('Oponent can not be sender', async function () {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID+52368});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});

            // await tryCatch (ethership.claim_opponent_left(accounts[1] , {from: accounts[1]}), "claim_timeout_winnings: Opponent can not be sender");
            assert(await ethership.get_winner.call() == ZERO_ADDR, "Winner address is not zero");
            assert(await ethership.get_timeout_stamp.call() == 0, "Timeout_stamp is not zero");

        }).timeout(TIMER);

        it('Handle_timeout', async () => {

            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID});
            
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});

            await ethership.claim_opponent_left(accounts[2], {from: accounts[1]});
            await ethership.handle_timeout(accounts[2], {from: accounts[2]});
            await ethership.claim_timeout_winnings(accounts[2], {from: accounts[1]});

            assert(await ethership.get_player1_addr.call() == accounts[1], "Player 1 address not stored correctly");
            assert(await ethership.get_player2_addr.call() == accounts[2], "Player 2 address not stored correctly");
            assert(await ethership.get_timeout_stamp.call() == 0, "Timeout_stamp is not zero");
            assert(await ethership.get_bid.call() == BID*2, "BID value not stored correctly");

        }).timeout(TIMER);

        it('Timeout by player1 -> player2 not respond -> player1 claims win', async () => {
            await ethership.store_bid({from: accounts[1], value: BID});
            await ethership.store_bid({from: accounts[2], value: BID});
            
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE), {from: accounts[1]});
            await ethership.store_board_commitment(web3.utils.asciiToHex(MERKLE2), {from: accounts[2]});

            await ethership.claim_opponent_left(accounts[2], {from: accounts[1]});

            console.log("sleep");
            timeout(62001)
            console.log("not sleep");

            await ethership.claim_timeout_winnings(accounts[2], {from: accounts[1]});

            assert(await ethership.get_player1_addr.call() == ZERO_ADDR, "Player 1 address not zero");
            assert(await ethership.get_player2_addr.call() == ZERO_ADDR, "Player 2 address not zero");
            assert(await ethership.get_bid.call() == 0, "BID value not zero");

        }).timeout(TIMER);

    });

});

function timeout(timer){
    // https://code-boxx.com/pause-javascript/
    let now = Date.now(), end = now + timer; while (now < end) { 
        now = Date.now();
    }
}

// https://ethereum.stackexchange.com/questions/48627/how-to-catch-revert-error-in-truffle-test-javascript
const PREFIX = "Returned error: VM Exception while processing transaction: revert ";
const tryCatch = async (promise, errType) => {
    try {
        await promise;
        throw null;
    }
    catch (error) {
        assert(error, "Expected an error but did not get one");
        assert(error.message.startsWith(PREFIX + errType), "Expected an error starting with '" + PREFIX + errType + "' but got '" + error.message + "' instead");
    }
};
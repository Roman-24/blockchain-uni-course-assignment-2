const assert = require("assert");

const Battleship = artifacts.require("Battleship");
const BID = 1000000000000000000;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const FAKE_MERT = "01234567890123456789012345678901";

//
//          HELPER FUNCTIONS
//
// Thanks to https://ethereum.stackexchange.com/questions/48627/how-to-catch-revert-error-in-truffle-test-javascript
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
// Thanks to https://stackoverflow.com/questions/51944856/time-delay-in-truffle-tests
const timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Simplify assert into one function
const checkAssert = async (b, p1, p2, val, state, merkle, check_bid) => {
    let p1_b = await b.p_addr.call(true);
    let p2_b = await b.p_addr.call(false);
    let b_bi = await b.g_bid.call();
    let g_ba = await b.g_bal.call();
    let g_st = await b.g_state.call();
    let p1_m = web3.utils.hexToAscii(await b.p_merkle.call(true));
    let p2_m = web3.utils.hexToAscii(await b.p_merkle.call(false));

    assert(p1 == p1_b, "Player 1 address not stored correctly.");
    assert(p2 == p2_b, "Player 2 address not stored correctly.");
    assert(g_ba == val, "Balance on contract not equal to 2*BID.");
    assert(g_st == state, `Game should be in different state is: ${g_st}, but expected ${state}.`);

    if(check_bid)
        assert(b_bi == BID, "BID value not stored correctly.");

    if(merkle != false){
        assert(p1_m == merkle, "Merkle root not stored correctly for player 1.");
        assert(p2_m == merkle, "Merkle root not stored correctly for player 2.");
    }
};

//
//          TESTS
//
contract("Battleship", accounts => {
    let battleship;

    beforeEach('Should recreate new Battleship instance', async () => {
        battleship = await Battleship.new();
    });

    describe('Store bids', () => {
        it('Should check basic store_bid functionality', async function () {
            await battleship.store_bid({from: accounts[1], value: BID});
            await checkAssert(battleship, accounts[1], ZERO_ADDR, BID, 1, false, true);
            await battleship.store_bid({from: accounts[2], value: BID*2});
            await checkAssert(battleship, accounts[1], accounts[2], BID*2, 1, false, true);
        }).timeout(100000);

        it('Should revert if player 1 send\'s 0 wei.', async function () {
            await tryCatch(
                battleship.store_bid({from: accounts[1], value: 0}),
                "BATTLESHIP: Sending value has to be bigger then 0wei"
            );
        }).timeout(100000);

        it('Should revert store_bid due to player playing against himself', async function () {
            await battleship.store_bid({from: accounts[1], value: BID});

            await tryCatch(
                battleship.store_bid({from: accounts[1], value: BID}),
                "BATTLESHIP: The same player cannot play against himself and value sent has to be greater or equal then bid submitted by player 1"
            );
        }).timeout(100000);

        it('Should revert due to placing smaller bid then first player', async function () {
            await battleship.store_bid({from: accounts[1], value: BID});

            await tryCatch(
                battleship.store_bid({from: accounts[2], value: BID/2}),
                "BATTLESHIP: The same player cannot play against himself and value sent has to be greater or equal then bid submitted by player 1"
            );
        }).timeout(100000);

        it('Should revert third player adding to the game', async function () {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID*2});
            await tryCatch(
                battleship.store_bid({from: accounts[3], value: BID/2}),
                "BATTLESHIP: At least one of the players has to be NULL"
            );
        }).timeout(100000);
    });

    describe('Forfeit', () => {
        it('Should forfeit and end the game', async function () {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID*2});
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[1]});
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[2]});
            await battleship.forfeit(accounts[2], {from: accounts[1]});
        
            assert(await battleship.is_game_over.call(), "Game not ended as expected");
            await checkAssert(battleship, ZERO_ADDR, ZERO_ADDR, 0, 1, false);
        }).timeout(100000);

        it('Should revert forfeit and not end the game - same sender as opponent', async function () {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID*2});
            await tryCatch(
                battleship.forfeit(accounts[2], {from: accounts[2]}),
                "BATTLESHIP: Cannot forfeit with the same opponent as sender"
            );

            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[1]});
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[2]});
            
            assert(((await battleship.is_game_over.call()) == false), "Game ended as not expected");
            await checkAssert(battleship, accounts[1], accounts[2], BID*2, 2, false);
        }).timeout(100000);
    });

    describe('Store board commitment', () => {
        it('Should store player\'s 1 and 2 board commitments', async () => {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID});

            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[1]});
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[2]});

            await checkAssert(battleship, accounts[1], accounts[2], BID*2, 2, FAKE_MERT, true);
        }).timeout(100000);

        it('Should revert as player 1 tries to submit merkle after submittion of both players', async () => {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID});

            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[1]});
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[2]});
            await tryCatch(
                battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[1]}),
                "BATTLESHIP: Game has to be in state 1 (Init)"
            );
        }).timeout(100000);

        it('Should revert as player 3 tries to submit merkle', async () => {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID});

            await tryCatch(
                battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[3]}),
                "BATTLESHIP: Only valid users can send board commitments"
            );
        }).timeout(100000);
    });

    describe('Timeouts', () => {
        it('Should emit timeout by player 1, player 2 should respond and game may continue', async () => {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID});
            
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[1]});
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[2]});

            let accussed = await battleship.claim_opponent_left(accounts[2], {from: accounts[1]});
            await battleship.handle_timeout(accounts[1], {from: accounts[2]});
            await battleship.claim_timeout_winnings(accounts[2], {from: accounts[1]});
            await checkAssert(battleship, accounts[1], accounts[2], BID*2, 2, false, true);
            assert(accussed.logs[0].event == 'timeout', "Event not emmited - timeout");
        }).timeout(100000);

        it('Should emit timeout by player 1, player 2 wont respond so player 1 claims win', async () => {
            await battleship.store_bid({from: accounts[1], value: BID});
            await battleship.store_bid({from: accounts[2], value: BID});
            
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[1]});
            await battleship.store_board_commitment(web3.utils.asciiToHex(FAKE_MERT), {from: accounts[2]});

            await battleship.claim_opponent_left(accounts[2], {from: accounts[1]});

            await timeout(61000);

            await battleship.claim_timeout_winnings(accounts[2], {from: accounts[1]});
            await checkAssert(battleship, ZERO_ADDR, ZERO_ADDR, 0, 1, false, false);
        }).timeout(100000);
    });
})
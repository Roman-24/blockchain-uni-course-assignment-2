// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.22 <0.7.0;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v3.0.0/contracts/cryptography/ECDSA.sol";

contract Battleship {
    using ECDSA for bytes32;
    uint32 constant BOARD_LEN = 6;

    // Declare state variables here.
    // Consider keeping state for:
    // - player addresses
    // - whether the game is over
    // - board commitments
    // - whether a player has proven 10 winning moves
    // - whether a player has proven their own board had 10 ships
    struct Player {
        address addr;
        bytes32 merkle_root;
        uint32 num_ships;
        uint256[] leaf_check;
    }

    uint8 state;
    uint256 public bit;
    address public winner;

    uint public timeout_stamp;
    uint constant private _TIME_LIMIT = 1 minutes;
    address public timeout_winner;

    Player player1;
    Player player2;

    // Declare events here.
    // Consider triggering an event upon accusing another player of having left.
    event PlayerLeft(address indexed player);
    event PlayerJoined(address indexed player);
    event PlayerAccused(address indexed accuser, address sender);
    
    // Store the bids of each player
    // Start the game when both bids are received
    // The first player to call the function determines the bid amount.
    // Refund excess bids to the second player if they bid too much.
    function store_bid() public payable{

        require(player1.addr == address(0) || player2.addr == address(0), "Game already started");
        require(state == 0, "Game already started");

        if (player1.addr == address(0)){
            // TODO moze byt bit nula ?
            require(msg.value >= 0, "Bid must be positive");
            player1.addr = msg.sender;
            bit = msg.value;
            state = 1;
        } else if (player2.addr == address(0)) {
            require(msg.value >= bit && msg.value >= 0, "Bid must be greater than previous bid");
            require(msg.sender != player1.addr, "Player cannot bid on their own bid");
            player2.addr = msg.sender;
            state = 1;
        }
    }

    // Clear state - make sure to set that the game is not in session
    function clear_state() internal{

        player1.addr = address(0);
        player1.merkle_root = bytes32(0);

        player2.addr = address(0);
        player2.merkle_root = bytes32(0);

        winner = address(0);
        bit = 0;
        state = 0;

    }

    // Store the initial board commitments of each player
    // Note that merkle_root is the hash of the topmost value of the merkle tree
    function store_board_commitment(bytes32 merkle_root) public{

        require(state == 1, "Game not started");
        require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can store board commitments");
        require(msg.sender == player1.addr ? player1.merkle_root == bytes32(0) : player2.merkle_root == bytes32(0), "Board commitment already stored");

        if (msg.sender == player1.addr){
            player1.merkle_root = merkle_root;
        } else if (msg.sender == player2.addr) {
            player2.merkle_root = merkle_root;
        } 
        /*else {
            revert();
        }*/
    }

    // Verify the placement of one ship on a board
    // opening_nonce - corresponds to web3.utils.fromAscii(JSON.stringify(opening) + JSON.stringify(nonce)) in JS
    // proof - a list of sha256 hashes you can get from get_proof_for_board_guess
    // guess_leaf_index - the index of the guess as a leaf in the merkle tree
    // owner - the address of the owner of the board on which this ship lives
    function check_one_ship(bytes memory opening_nonce, bytes32[] memory proof, uint256 guess_leaf_index, address owner) public returns (bool result) {

        require(state == 1, "Game not started");
        require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can check ships");
        require(msg.sender == owner, "Only the owner of the board can check ships");
        
        // merkle root of owner
        bytes32 owner_merkle_root = msg.sender == player1.addr ? player1.merkle_root : player2.merkle_root;

        // owner leaves
        uint256[] storage leaves = player1.leaf_check;
        if (player1.addr == owner){
            leaves = player1.leaf_check;
        } else if (player2.addr == owner) {
            leaves = player2.leaf_check;
        }


        if (verify_opening(opening_nonce, proof, guess_leaf_index, owner_merkle_root) && leaves.length != 0){
            for (uint256 index = 0; index < leaves.length; index++) {
                if (leaves[index] == guess_leaf_index) {
                    return false;
                }
            }
            leaves.push(guess_leaf_index);
            return true;
        }
        return false;
    }

    // Claim you won the game
    // If you have checked 10 winning moves (hits) AND you have checked
    // 10 of your own ship placements with the contract, then this function
    // should transfer winning funds to you and end the game.
    function claim_win() public {

        require(state == 1, "Game not started");
        require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can claim win");

        if (msg.sender == player1.addr){
            if (player1.num_ships == 10 && player2.num_ships == 10){
                winner = player1.addr;
            }
        } else if (msg.sender == player2.addr){
            if (player2.num_ships == 10 && player1.num_ships == 10){
                winner = player2.addr;
            }
        }
    }

    // Forfeit the game
    // Regardless of cheating, board state, or any other conditions, this function
    // results in all funds being sent to the opponent and the game being over.
    function forfeit(address payable opponent) public {
            
            require(state == 1, "Game not started");
            require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can forfeit");
            require(opponent != address(0), "Opponent cannot be null");
    
            if (msg.sender == player1.addr){
                winner = player2.addr;
            } else if (msg.sender == player2.addr){
                winner = player1.addr;
            }
    
            opponent.transfer(address(this).balance);
            state = 0;
    }

    // Claim the opponent cheated - if true, you win.
    // opening_nonce - corresponds to web3.utils.fromAscii(JSON.stringify(opening) + JSON.stringify(nonce)) in JS
    // proof - a list of sha256 hashes you can get from get_proof_for_board_guess (this is what the sender believes to be a lie)
    // guess_leaf_index - the index of the guess as a leaf in the merkle tree
    // owner - the address of the owner of the board on which this ship lives
    function accuse_cheating(bytes memory opening_nonce, bytes32[] memory proof, uint256 guess_leaf_index, address owner) public returns (bool result) {
            
            require(state == 1, "Game not started");
            require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can accuse cheating");
            require(msg.sender == owner, "Only the owner of the board can accuse cheating");
    
            // merkle root of owner
            bytes32 owner_merkle_root = msg.sender == player1.addr ? player1.merkle_root : player2.merkle_root;
    
            // owner leaves
            uint256[] storage leaves = player1.leaf_check;
            if (player1.addr == owner){
                leaves = player1.leaf_check;
            } else if (player2.addr == owner) {
                leaves = player2.leaf_check;
            }
    
            if (verify_opening(opening_nonce, proof, guess_leaf_index, owner_merkle_root) && leaves.length != 0){
                for (uint256 index = 0; index < leaves.length; index++) {
                    if (leaves[index] == guess_leaf_index) {
                        return true;
                    }
                }
                return false;
            }
            return false;
    }


    // Claim the opponent of taking too long/leaving
    // Trigger an event that both players should listen for.
    function claim_opponent_left(address opponent) public {

        require(state == 1, "Game not started");
        require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can claim opponent left");
        require(opponent != address(0), "Opponent cannot be null");
        require(opponent == player1.addr || opponent == player2.addr, "Opponent must be a player");

        timeout_stamp = block.timestamp;
        timeout_winner = opponent;

        emit PlayerAccused(opponent, msg.sender);
    }

    // Handle a timeout accusation - msg.sender is the accused party.
    // If less than 1 minute has passed, then set state appropriately to prevent distribution of winnings.
    // Otherwise, do nothing.
    function handle_timeout(address payable opponent) public {
    
        require(state == 1, "Game not started");
        require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can handle timeout");
        require(opponent != address(0), "Opponent cannot be null");
        require(opponent == player1.addr || opponent == player2.addr, "Opponent must be a player");

        if (block.timestamp - timeout_stamp < _TIME_LIMIT){
            state = 0;
            timeout_winner = opponent;
        }
    }

    // Claim winnings if opponent took too long/stopped responding after claim_opponent_left
    // The player MUST claim winnings. The opponent failing to handle the timeout on their end should not
    // result in the game being over. If the timer has not run out, do nothing.
    function claim_timeout_winnings(address opponent) public {
            
            require(state == 1, "Game not started");
            require(msg.sender == player1.addr || msg.sender == player2.addr, "Only players can claim timeout winnings");
            require(opponent != address(0), "Opponent cannot be null");
            require(opponent == player1.addr || opponent == player2.addr, "Opponent must be a player");
    
            if (block.timestamp - timeout_stamp < _TIME_LIMIT){
                state = 2;
                winner = msg.sender;
                msg.sender.transfer(address(this).balance);
            }
    }

    // Check if game is over
    // Hint - use a state variable for this, so you can call it from JS.
    // Note - you cannot use the return values of functions that change state in JS.
    function is_game_over() public returns (bool) {
        return state == 0 || state == 2;
    }

    /**** Helper Functions below this point. Do not modify. ****/
    /***********************************************************/

    function merge_bytes32(bytes32 a, bytes32 b) pure public returns (bytes memory) {
        bytes memory result = new bytes(64);
        assembly {
            mstore(add(result, 32), a)
            mstore(add(result, 64), b)
        }
        return result;
    }

    // Verify the proof of a single spot on a single board
    // \args:
    //      opening_nonce - corresponds to web3.utils.fromAscii(JSON.stringify(opening) + JSON.stringify(nonce)));
    //      proof - list of sha256 hashes that correspond to output from get_proof_for_board_guess()
    //      guess - [i, j] - guess that opening corresponds to
    //      commit - merkle root of the board
    function verify_opening(bytes memory opening_nonce, bytes32[] memory proof, uint guess_leaf_index, bytes32 commit) public view returns (bool result) {
        bytes32 curr_commit = keccak256(opening_nonce); // see if this changes hash
        uint index_in_leaves = guess_leaf_index;

        uint curr_proof_index = 0;
        uint i = 0;

        while (curr_proof_index < proof.length) {
            // index of which group the guess is in for the current level of Merkle tree
            // (equivalent to index of parent in next level of Merkle tree)
            uint group_in_level_of_merkle = index_in_leaves / (2**i);
            // index in Merkle group in (0, 1)
            uint index_in_group = group_in_level_of_merkle % 2;
            // max node index for currrent Merkle level
            uint max_node_index = ((BOARD_LEN * BOARD_LEN + (2**i) - 1) / (2**i)) - 1;
            // index of sibling of curr_commit
            uint sibling = group_in_level_of_merkle - index_in_group + (index_in_group + 1) % 2;
            i++;
            if (sibling > max_node_index) continue;
            if (index_in_group % 2 == 0) {
                curr_commit = keccak256(merge_bytes32(curr_commit, proof[curr_proof_index]));
                curr_proof_index++;
            } else {
                curr_commit = keccak256(merge_bytes32(proof[curr_proof_index], curr_commit));
                curr_proof_index++;
            }
        }
        return (curr_commit == commit);

    }
}

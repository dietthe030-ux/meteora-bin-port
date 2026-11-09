/**
 * Canonical 4-byte selectors (`keccak256(signature)[0:4]`) for the Rome precompile
 * methods, transcribed from Rome EVM's canonical precompile dispatch table. Keys are the canonical
 * function signatures. Every entry is re-derived + asserted in the test suite, so a
 * bad transcription can never ship.
 *
 * Use for low-level calldata assembly when you don't want a full ABI:
 *   `SELECTORS["withdraw_to_ata(uint256)"] + encodeAbiParameters([{type:"uint256"}],[wei])`
 */
export declare const SELECTORS: {
    readonly "invoke(bytes32,(bytes32,bool,bool)[],bytes)": "0x7480cb86";
    readonly "invoke_signed(bytes32,(bytes32,bool,bool)[],bytes,bytes32[])": "0xb94f3733";
    readonly "account_info(bytes32)": "0xc13465d9";
    readonly "account_data_at(bytes32,uint16,uint16)": "0x593762e8";
    readonly "account_u64_at(bytes32,uint16)": "0xb317d4c1";
    readonly "account_lamports(bytes32)": "0xde79ed54";
    readonly "pdas_batch_derive(bytes[][],bytes32)": "0x944336f8";
    readonly "create_ata(address)": "0x5a7c3259";
    readonly "create_ata(address,bytes32)": "0x3de2251a";
    readonly "create_ata_for_key(bytes32,bytes32)": "0xd258a69d";
    readonly "create_pda(address)": "0xff3556ca";
    readonly "create_pda(address,uint64)": "0x58e88298";
    readonly "swap_gas_to_lamports(uint64)": "0x6e3f24e0";
    readonly "transfer_lamports(address,uint64)": "0x5fe71665";
    readonly "transfer_spl(address,uint64)": "0xb12be5ba";
    readonly "transfer_spl(bytes32,uint64)": "0xba3a5eac";
    readonly "transfer_spl(address,uint64,bytes32)": "0x53b505e0";
    readonly "transfer_spl(bytes32,uint64,bytes32)": "0xb6977879";
    readonly "transfer_spl(bytes32,bytes32,uint64,bytes32)": "0x766b362a";
    readonly "transfer_spl(address,address,uint64,bytes32)": "0xe479df56";
    readonly "transfer_spl_to_signer(uint64,bytes32)": "0x46efa679";
    readonly "approve_spl(address,uint64,bytes32)": "0xabf6f675";
    readonly "mint_spl(address,uint64,bytes32)": "0xd795522b";
    readonly "deposit_from_ata(uint256)": "0x4479b709";
    readonly "pda(address)": "0x8854a299";
    readonly "pda_with_salt(address,bytes32)": "0x5c6d04b3";
    readonly "ata(address)": "0x31db4f82";
    readonly "ata(address,bytes32)": "0xfeb1c647";
    readonly "user_balance(address,bytes32)": "0xdd0119c8";
    readonly "allowance_of(address,address,bytes32)": "0xed72dbc8";
    readonly "withdrawal(bytes32)": "0x4d8b0ea4";
    readonly "withdraw_to_pda(uint256)": "0x7f3124a0";
    readonly "withdraw_to_ata(uint256)": "0x8059abc0";
};

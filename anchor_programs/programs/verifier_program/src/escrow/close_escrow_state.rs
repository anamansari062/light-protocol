use crate::errors::ErrorCode;
use crate::escrow::escrow_state::FeeEscrowState;
use crate::groth16_verifier::VerifierState;
use crate::utils::config::{FEE_PER_INSTRUCTION, TIMEOUT_ESCROW};
use anchor_lang::prelude::*;
use merkle_tree_program::instructions::sol_transfer;

use anchor_lang::solana_program::{clock::Clock, sysvar::Sysvar};

#[derive(Accounts)]
pub struct CloseFeeEscrowPda<'info> {
    #[account(mut, seeds = [verifier_state.load()?.tx_integrity_hash.as_ref(), b"fee_escrow"], bump, close = relayer)]
    pub fee_escrow_state: Account<'info, FeeEscrowState>,
    #[account(mut, seeds = [verifier_state.load()?.tx_integrity_hash.as_ref(), b"storage"], bump, close = relayer)]
    pub verifier_state: AccountLoader<'info, VerifierState>,
    #[account(mut)]
    pub signing_address: Signer<'info>,
    #[account(mut, constraint= user.key() == fee_escrow_state.user_pubkey)]
    /// either user address or relayer address depending on who claims
    /// CHECK:` doc comment explaining why no checks through types are necessary.
    pub user: AccountInfo<'info>,
    #[account(mut, constraint=relayer.key() == fee_escrow_state.relayer_pubkey )]
    /// CHECK:` doc comment explaining why no checks through types are necessary.
    pub relayer: AccountInfo<'info>,
}

pub fn process_close_escrow(ctx: Context<CloseFeeEscrowPda>) -> Result<()> {
    let fee_escrow_state = &ctx.accounts.fee_escrow_state;
    let verifier_state = &mut ctx.accounts.verifier_state.load()?;
    // this might be unsafe maybe the check doesn't matter anyway because for a withdrawal this
    // account does not exist
    let external_amount: i64 = i64::from_le_bytes(verifier_state.ext_amount);
    // escrow is only applied for deposits
    if external_amount < 0 {
        return err!(ErrorCode::NotDeposit);
    }

    // if yes check that signer such that user can only close after timeout
    if verifier_state.current_instruction_index != 0
        && fee_escrow_state.creation_slot + TIMEOUT_ESCROW > <Clock as Sysvar>::get()?.slot
        && ctx.accounts.signing_address.key() != Pubkey::new(&[0u8; 32])
    {
        if ctx.accounts.signing_address.key() != verifier_state.signing_address {
            return err!(ErrorCode::NotTimedOut);
        }
    }

    // transfer remaining funds after subtracting the fee
    // for the number of executed transactions to the user
    // 7 ix per transaction -> verifier_state.current_instruction_index / 7 * 5000
    let transfer_amount_relayer = verifier_state.current_instruction_index * FEE_PER_INSTRUCTION;
    msg!("transfer_amount_relayer: {}", transfer_amount_relayer);
    sol_transfer(
        &fee_escrow_state.to_account_info(),
        &ctx.accounts.relayer.to_account_info(),
        transfer_amount_relayer.try_into().unwrap(),
    )?;

    // Transfer remaining funds after subtracting the fee
    // for the number of executed transactions to the user
    let transfer_amount_user: u64 = fee_escrow_state.relayer_fee + fee_escrow_state.tx_fee
        - transfer_amount_relayer as u64
        + external_amount as u64;

    msg!("transfer_amount_user: {}", transfer_amount_user);
    sol_transfer(
        &fee_escrow_state.to_account_info(),
        &ctx.accounts.user.to_account_info(),
        transfer_amount_user.try_into().unwrap(),
    )?;

    Ok(())
}

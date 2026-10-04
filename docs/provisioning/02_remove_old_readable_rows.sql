-- Run only AFTER every device of the shop has tapped Upgrade to encrypted sync
-- (Settings, Advanced Pesa Connection settings). Replace the code with the shop's own sync code.
-- The older readable copy of the data is stored under the sync code itself. This removes it.
-- Pesa copies this line for you when the owner taps Upgrade.

delete from pesa_docs where ws = 'XXXX-XXXX-XXXX-XXXX-XXXX';

-- Check afterwards: every remaining row for the shop should start with v2- in the ws column.
select left(ws, 3) as kind, count(*) from pesa_docs group by 1;

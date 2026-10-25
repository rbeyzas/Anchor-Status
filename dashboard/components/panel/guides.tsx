// What each part of /panel is for and how to use it, in one place.
import type { GuideContent } from './parts';

const days = (s: number) => (s % 86400 === 0 ? `${s / 86400} days` : s % 3600 === 0 ? `${s / 3600} hours` : `${s} seconds`);

export const CLAIM_GUIDE: GuideContent = {
  title: 'How to claim your anchor',
  steps: [
    <>
      Make sure your domain&apos;s <span className="as-mono">/.well-known/stellar.toml</span> has a <span className="as-mono">SIGNING_KEY</span>{' '}
      and that you hold its secret. Anchors with SEP-10 already have one.
    </>,
    <>Choose your anchor below. If step 1 shows &quot;Not yet&quot;, write to us: our reporters read the key from your stellar.toml and record it on-chain.</>,
    <>Connect the wallet that should operate the anchor; it needs a little XLM for the fee. The message to sign names this wallet.</>,
    <>
      Sign the message with the <span className="as-mono">SIGNING_KEY</span> secret on your own machine, for example with the command shown. Never paste
      that secret into a website, this one included.
    </>,
    <>Paste the 128-character signature and press Claim; approve the transaction in your wallet.</>,
  ],
  note: 'A signature works once, for this wallet only. A record that holds stake can only change hands after its current operator withdraws it.',
};

export const stakeGuide = (minStakeXlm: number, cooldown: string): GuideContent => ({
  title: 'What the stake is for',
  steps: [
    <>Stake is XLM you lock on your anchor&apos;s record. It does not change the score; it shows you stand behind your anchor.</>,
    <>To open a dispute, the record needs at least {minStakeXlm} XLM. It is checked, never taken.</>,
    <>Add stake: enter an amount, press Add stake and approve in your wallet.</>,
    <>To take it back: press Request with the amount, wait for the cooldown{cooldown ? ` (${cooldown})` : ''}, then press Withdraw.</>,
  ],
});

export const disputeGuide = (cooldownSeconds: number): GuideContent => ({
  title: 'How a dispute works',
  steps: [
    <>Dispute the current card when you believe it is wrong, for example when your anchor was up but a reporter could not reach it.</>,
    <>Write what shows it: links to your status page, an announcement, logs, and what each one shows. The admins read this text.</>,
    <>Pick a reason code (1 if unsure), press Open dispute and approve in your wallet.</>,
    <>The admins see your evidence beside both reporters&apos; measurements and decide; the reporters then vote that way, usually within a day.</>,
    <>Upheld: the card&apos;s score is withheld until the next card. Rejected: you can open the next dispute after {days(cooldownSeconds)}.</>,
  ],
  note: 'One dispute per card.',
});

export const DECISION_GUIDE: GuideContent = {
  title: 'How to decide a dispute',
  steps: [
    <>Read the operator&apos;s evidence, then both reporters&apos; cards for the disputed window and the suggestion.</>,
    <>
      <strong className="text-as-ink">Uphold</strong> when the card is wrong (for example only one reporter saw the outage).{' '}
      <strong className="text-as-ink">Reject</strong> when the card shows what really happened.
    </>,
    <>Press your choice: the wallet asks you to sign a message. It is not a transaction and costs nothing.</>,
    <>A second admin signer does the same. When the signatures reach the threshold, the reporters vote that way within 20 minutes.</>,
  ],
  note: 'When both reporters saw an outage, it was real; whether it should count (say, maintenance announced in advance) is your call from the evidence. A new dispute is announced on the admins’ Telegram.',
};

export const QUEUE_GUIDE: GuideContent = {
  title: 'How to change a contract',
  steps: [
    <>Choose the contract and the action, fill in its fields and say what it is for. Press Propose and sign: your wallet signs the transaction, nothing is sent yet.</>,
    <>Tell another admin signer. They open this panel and press Sign on the item.</>,
    <>When the item shows Ready to send, anyone of you presses Send to the network.</>,
    <>To drop an item, press Reject: the wallet asks for a signed message, no fee.</>,
  ],
  note: 'Propose one change at a time: each item uses the admin account’s next sequence number, so when one is sent the others turn Stale and must be proposed again. An item stays valid for 7 days.',
};

export const WAITING_GUIDE: GuideContent = {
  title: 'Why changes wait',
  steps: [
    <>Upgrades and shorter time locks wait out the contract&apos;s time lock after they are proposed, so anyone watching can see them coming.</>,
    <>Once a change shows Ready, execute it from Transactions to sign below (for example Execute upgrade).</>,
    <>An admin handover takes effect only when the new admin accepts it, also from below.</>,
  ],
};

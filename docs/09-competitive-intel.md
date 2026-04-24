# Prior-round competitive intel — Agentic Commerce on Arc (Jan 9–24 2026)

Source: https://lablab.ai/ai-hackathons/agentic-commerce-on-arc (via web.archive.org)

## Stats
- 1,201 participants · 221 teams · 104 submitted apps
- Total prize pool: $50,000 (USDC + GCP credits)
- Prior structure included $40K GCP credits layer ($20K/$10K/$5K top-3 Gemini track + 5× $1K honorable mentions)

## Winners (strong signal on what judges rewarded)

| Team / Project | What it built | Why it won |
|---|---|---|
| **NewsFacts** | Paid eyewitness facts on Arc; AI-written personalized news via MCP | Human-posts-data / agent-pays-per-datum pattern |
| **RSoft Agentic Bank** | Trustless lending to agents with KYA + AP2 | Primitive invention |
| **OmniAgentPay** | Python `pay()` SDK for USDC/x402/CCTP | SDK play |
| **Commerce Studio** | AI visual merchant gated by USDC-on-Arc | Vertical polish |
| **AIsaEscrow** | Pay-per-usage SaaS escrow | Payment primitive |
| **Arc Merchant (Status 402)** | x402 autonomous micropayments w/ no popups | Clean x402 story |
| **Arcana** | Multi-agent crypto intel marketplace (Price Oracle + News Scout + Analyst) | Orchestrator |
| **VibeCard** | USDC reward pools for vibe-coded apps | Consumer hook |
| **JoyKeep** | Subscription-slicing settlement | Subscription-killer |
| **Agent Router** | Pay-per-request routing across APIs | Router |
| **InsuranceAI** | Agentic parametric insurance | Vertical + guardrails |
| **Arcent (Protocol 402)** | Agent pays APIs via x402 + Circle Wallets; "Pay-on-Success" | **Reference — cloned to `_refs/`** |
| **ArcPay SDK** | TS universal stablecoin SDK across 150+ APIs | SDK + scale |
| **FEIN** | Policy-driven agent bridging Gemini ↔ Circle | Guardrails |

## Patterns judges liked (cluster analysis)

1. **SDK / developer platform** (OmniAgentPay, ArcPay, Agent Router)
2. **Financial primitive with explicit gas-margin thesis** (Arcent pay-on-success, Arc Merchant x402)
3. **Multi-agent orchestrators** (Arcana, RSoft, InsuranceAI)
4. **Consumer surfaces on payment rails** (VibeCard, Commerce Studio, NewsFacts, JoyKeep)
5. **Guardrails theme** (FEIN, AIsaEscrow, reinsurance)

## Other submitted projects worth knowing about (non-winners)

MEV-shield, ArcTripBot, Still Alive, AutoWealth, MIA, tollbot, AI adventure maker, KREDI, HumanGrid AI, SocratIQ, monster, Arc-Warden, Arc Agent Commerce, Atlas, APPAY, ClickTreats, SlipShield, ChatBot, ArcGreen, Quantus Analytica, Veritas, RouterAI, PAYVOICE, X-108, Econo-Agent, Arc NFTs, GojoSwapAI, ChipIn, Captain Whiskers, HomeOps, GenX-AutoOps, Diversifi, ArcSentinel, Kynet AI, SocialStake, Arc Pay, ArcPay_x402, Autonomous Payments SDK, TalentNinja, AgentPaywall, InsightX, Arc Treasury (USYC), Proof-of-Pulse, Arcfeed, Crowdlike, DealFlow AI, ArcFlow, Agentic Commerce (Vibe Coders), VisionPay, OfficeOps, Auto Treasury, USYC Multi-Agent DeFi, ArcWork, AgentPay, Auto Invoice, FreshCredit, SwarmDeal, DeMemo, ArcFlow (Instaflect), Oryn, ArcShopper, Aivana, PGAP, Arc-Pulse, Auto-Decide Treasury, SpendGuard, API Wallet Agent, AgentInvoice, SubGuard, Economic Immune System, OPTUS AUTOMATION, Primuez Guard, SystemicShift, MTT Trybe, AEGIS, Arcanum, kris.co, Thalexa, UClaim, AryPay, SmartGuard, Prime Studio, Arc Wallet (ERC-4337), SolCipher, AI Agent Commerce Platform, ARC Invoice, musetub, Tech Khalifa, AI Jukebox.

## Un-touched niches — pay2play occupies these

1. **Multi-transport meter** (HTTP + MCP + SSE + viewport) — no prior SDK competitor covered this. OmniAgentPay and ArcPay SDK were **HTTP-only** vertical SDKs.
2. **Per-token live streaming settlement** — nobody shipped a live demo of token-level metering mid-stream.
3. **Per-paragraph dwell attention paywall** — no attention-based paywall.
4. **Per-frame M2M sensor metering** — no pure machine-to-machine demo.
5. **Per-row data marketplace** — no pay-per-select data endpoint.

## Positioning vs prior SDK winners

- **OmniAgentPay / ArcPay** = HTTP-only vertical SDKs with a single `pay()` shape.
- **pay2play** = multi-transport + multi-meter. Same developer ergonomics, step-up coverage.

## Pitch line

> "Every prior winner reinvented the payment plumbing for one vertical. pay2play is the plumbing — ship your vertical in 20 lines."

## Things to avoid (covered by prior winners, low originality lift)

- Another "universal payment SDK" positioning — already taken by OmniAgentPay and ArcPay
- Another AI router that pays per request — Agent Router, RouterAI, InsightX
- Another escrow/lending agent primitive — RSoft, AIsaEscrow
- Another subscription-slicer — JoyKeep
- Another paywalled research app — ArcShopper

Our differentiator: **coverage**. HTTP *and* MCP *and* streaming *and* viewport. One-axis SDKs lose the originality judging axis.

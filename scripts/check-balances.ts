import { createPublicClient, http, formatUnits } from "viem";
import { ARC_TESTNET } from "@pay2play/core";

const USDC   = ARC_TESTNET.contracts.usdc as `0x${string}`;
const SELLER = (process.env.SELLER_ADDRESS ?? "0xa28B679CE29768059706f40733BD28C30356b36B") as `0x${string}`;
const BUYER  = (process.env.BUYER_ADDRESS  ?? "0x898883A4c4433B1124Bd51A5Ba20875E0a5f18A3") as `0x${string}`;

const client = createPublicClient({
  chain: {
    id: ARC_TESTNET.chainId,
    name: ARC_TESTNET.name,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: [ARC_TESTNET.rpcUrl] } },
  },
  transport: http(ARC_TESTNET.rpcUrl),
});

const ABI = [{
  name: "balanceOf", type: "function", stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const [sb, bb] = await Promise.all([
  client.readContract({ address: USDC, abi: ABI, functionName: "balanceOf", args: [SELLER] }),
  client.readContract({ address: USDC, abi: ABI, functionName: "balanceOf", args: [BUYER]  }),
]);

console.log(`Chain   : ${ARC_TESTNET.name} (${ARC_TESTNET.chainId})`);
console.log(`USDC    : ${USDC}`);
console.log(`Seller  : ${SELLER}  →  ${formatUnits(sb, 6)} USDC`);
console.log(`Buyer   : ${BUYER}  →  ${formatUnits(bb, 6)} USDC`);

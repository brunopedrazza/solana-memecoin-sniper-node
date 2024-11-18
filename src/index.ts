import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import bs58 from 'bs58';
import WebSocket from 'ws';
import { Connection, PublicKey, Keypair, sendAndConfirmTransaction, VersionedTransaction, Transaction, TransactionMessage, AddressLookupTableAccount } from '@solana/web3.js';
import axios from 'axios';
import { Raydium, API_URLS } from "@raydium-io/raydium-sdk-v2";
import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createCloseAccountInstruction } from '@solana/spl-token';

const HTTP_URL = process.env.HTTP_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com";

const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

const RUGCHECK_API_URL = "https://api.rugcheck.xyz/v1";
const DEXSCREENER_API_URL = "https://api.dexscreener.com";
const RAYDIUM = new PublicKey(RAYDIUM_PUBLIC_KEY);
const INSTRUCTION_NAME = "initialize2";

const SOLANA_STREAMING_API_KEY = process.env.SOLANA_STREAMING_API_KEY;
const SOLANA_STREAMING_WS_URL = 'wss://api.solanastreaming.com';

const BLOXROUTE_AUTH = process.env.BLOXROUTE_AUTH;
const BLOXROUTE_WS_URL = 'wss://uk.solana.dex.blxrbdn.com/ws';

const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;
const COINMARKETCAP_API_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

const HELIUS_API_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const parameters = {
  portfolio_percentage: 0.05,  // Default 1% of total portfolio per trade
  min_liquidity: 100000,  // Minimum liquidity in USD
  slippage: 10,  // Maximum slippage tolerance in percentage
  takeProfit: 0.3,  // Take profit percentage
  stopLoss: 0.7,  // Stop loss percentage
  rugcheck_enabled: true,  // Enable or disable RugCheck API
  rugcheck_max_score: 1000,
  pump_analysis_enabled: false  // Enable or disable pump token analysis
};

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const privateKeyBytes = bs58.decode(PRIVATE_KEY);
const keypair = Keypair.fromSecretKey(privateKeyBytes);
console.log(`\nPublic Key: ${keypair.publicKey.toBase58()}`);
getPortfolioBalance().then(balance => {
  console.log(`Initial balance: ${balance / 1_000_000_000} SOL\n`);
});

const connection = new Connection(HTTP_URL, {
  wsEndpoint: WSS_URL
});

interface SwapCompute {
  id: string
  success: true
  version: 'V0' | 'V1'
  openTime?: undefined
  msg: undefined
  data: {
    swapType: 'BaseIn' | 'BaseOut'
    inputMint: string
    inputAmount: string
    outputMint: string
    outputAmount: string
    otherAmountThreshold: string
    slippageBps: number
    priceImpactPct: number
    routePlan: {
      poolId: string
      inputMint: string
      outputMint: string
      feeMint: string
      feeRate: number
      feeAmount: string
    }[]
  }
}

async function getTokenMetadataSymbol(assetId: string): Promise<string | null> {
  const requestBody = {
    jsonrpc: "2.0",
    id: "test",
    method: "getAsset",
    params: {
      id: assetId
    }
  };

  try {
    const response = await fetch(HELIUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const data = await response.json();
      const symbol = data.result.content.metadata.symbol;
      return symbol;
    } else {
      console.error(`Helius API request failed with status: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching token metadata: ${error}`);
    return null;
  }
}

async function getSolPrice(): Promise<number | null> {
  const url = `${COINMARKETCAP_API_URL}?symbol=SOL`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const solPrice = data.data.SOL.quote.USD.price;
      return solPrice;
    } else {
      console.error(`CoinMarketCap API request failed with status: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching SOL price: ${error}`);
    return null;
  }
}

async function calculateLiquidity(tokenReserves: number): Promise<number | null> {
  const solPrice = await getSolPrice();
  if (solPrice === null) {
    console.error('Failed to fetch SOL price.');
    return null;
  }

  // Convert Token2 reserves from lamports to SOL
  const tokenReservesInSOL = tokenReserves / 1_000_000_000;

  // Calculate the value of Token2 reserves in USD
  const token2ValueInUSD = tokenReservesInSOL * solPrice;

  return 2 * token2ValueInUSD;
}

async function fetchRaydiumMints(txId: string, connection: Connection) {
  try {
    const tx = await connection.getParsedTransaction(
      txId,
      {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

    //@ts-ignore
    const accounts = (tx?.transaction.message.instructions).find(ix => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY).accounts as PublicKey[];

    if (!accounts) {
      console.log("No accounts found in the transaction.");
      return;
    }

    const pool = accounts[4];
    const tokenAAccount = accounts[8];
    const tokenBAccount = accounts[9];

    const displayData = [
      { "Token": "A", "Account Public Key": tokenAAccount.toBase58() },
      { "Token": "B", "Account Public Key": tokenBAccount.toBase58() }
    ];

    const token = tokenAAccount === NATIVE_MINT ? tokenBAccount : tokenAAccount;

    const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000) : null;
    const localTime = new Date();
    const timeDiff = blockTime ? localTime.getTime() - blockTime.getTime() : null;

    console.log("New LP Found");
    console.table(displayData);
    console.log(`Local Time: ${localTime.getTime()}`);

    return {
      localTime: localTime,
      blockTime: blockTime,
      timeDiff: timeDiff,
      pool: pool.toBase58(),
      token: token.toBase58()
    };
  } catch {
    console.log("Error fetching transaction:", txId);
    return;
  }
}

async function processSignature(signature: string, connection: Connection) {
  const raydium = await Raydium.load({
    connection: connection,
    owner: keypair, // key pair or publicKey, if you run a node process, provide keyPair
    // signAllTransactions, // optional - provide sign functions provided by @solana/wallet-adapter-react
    // tokenAccounts, // optional, if dapp handle it by self can provide to sdk
    // tokenAccountRowInfos, // optional, if dapp handle it by self can provide to sdk
    // disableLoadToken: false // default is false, if you don't need token info, set to true
  });

  const tokenInfo = await fetchRaydiumMints(signature, connection);
  console.log("\nAnalyzing token:", tokenInfo.token);
  // if (!await rugCheck(tokenInfo.token)) {
  //   console.log("Rug check failed for token:", tokenInfo.token);
  //   return;
  // }

  const data = await fetchDexScreenerData(tokenInfo.pool);
  console.log("DexScreener Data:", data);
  const data2 = await raydium.api.fetchPoolById({ ids: tokenInfo.pool });
  console.log("Pool info 2:", data2);
  // const poolInfo = await fetchRaydiumPoolInfo(tokenInfo.pool);
  // console.log("Pool info:", poolInfo);
}

async function startConnection(connection: Connection, programAddress: PublicKey, searchInstruction: string): Promise<void> {
  console.log("Monitoring logs for program:", programAddress.toString());
  connection.onLogs(
    programAddress,
    async ({ logs, err, signature }) => {
      if (err) return;

      if (logs && logs.some(log => log.includes(searchInstruction))) {
        console.log("Signature for 'initialize2':", `https://explorer.solana.com/tx/${signature}`);
        await processSignature(signature, connection);
      }
    },
    "processed"
  );
}

async function getPortfolioBalance(): Promise<number> {
  console.log("\nFetching portfolio balance...");
  try {
    const response = await connection.getBalance(keypair.publicKey);
    const balance = response;
    console.log(`Portfolio balance: ${balance} SOL`);
    return balance;
  } catch (e) {
    console.error(`Error fetching portfolio balance: ${e}`);
    return 0;
  }
}

async function rugCheck(tokenAddress: string): Promise<boolean> {
  if (!parameters.rugcheck_enabled) {
    return true;
  }

  console.log(`Performing rug check for token: ${tokenAddress}`);
  try {
    const response = await fetch(`${RUGCHECK_API_URL}/tokens/${tokenAddress}/report/summary`);
    if (response.status === 200) {
      const data = await response.json();
      const score = data.score || 0;
      const risks = data.risks?.filter(risk => risk.name !== "Low Liquidity") || [];
      for (const risk of risks) {
        if (risk.level === 'danger') {
          console.log(`Risk level 'danger' found: ${risk.name} - ${risk.description}`);
          return false;
        }
      }
      const totalRiskScore = risks.reduce((acc, risk) => acc + risk.score, 0);
      console.log(`Total Risk Score: ${totalRiskScore}`);
      if (totalRiskScore >= parameters.rugcheck_max_score) {
        console.log(`RugCheck API indicates high risk for token (score ${score}): ${tokenAddress}`);
        for (const risk of risks) {
          console.log(`Risk (score ${risk.score}): ${risk.name} - ${risk.description}`);
        }
        return false;
      }

      console.log(`RugCheck API indicates low risk for token: ${tokenAddress}`);
      return true;
    } else {
      console.log(`RugCheck API request failed with status: ${response.status}`);
      return false;
    }
  } catch (e) {
    console.log(`Error during RugCheck API request: ${e}`);
    return false;
  }
}

async function fetchDexScreenerData(pairAddress: string): Promise<any> {
  console.log(`Fetching DexScreener data for pair: ${pairAddress}`);
  try {
    const response = await fetch(`${DEXSCREENER_API_URL}/latest/dex/pairs/solana/${pairAddress}`);
    if (response.status === 200) {
      const data = await response.json();
      return data;
    } else {
      console.log(`DexScreener API request failed with status: ${response.status}`);
      return null;
    }
  } catch (e) {
    console.log(`Error during DexScreener API request: ${e}`);
    return null;
  }
}

function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve: boolean = false,
): PublicKey {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) {
    throw new Error(`Owner cannot sign: ${owner.toString()}`);
  }
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

async function getQuote(inputMint: string, outputMint: string, amount: number, slippage: number, txVersion: string, maxRetries: number = 5): Promise<SwapCompute | null> {
  let retryCount = 0;
  let { data: swapResponse } = await axios.get<SwapCompute>(
    `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100}&txVersion=${txVersion}`
  );

  while (!swapResponse.success && retryCount < maxRetries) {
    console.log(`Retrying swap computation... Attempt ${retryCount + 1}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const { data: retrySwapResponse } = await axios.get<SwapCompute>(
      `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100}&txVersion=${txVersion}`
    );
    swapResponse = retrySwapResponse;
    retryCount++;
  }

  if (!swapResponse.success) {
    console.error('Failed to get a successful swap response after retries: ', swapResponse);
    return null;
  }

  return swapResponse;
}

async function swap(inputMint: string, outputMint: string, amount: number, closeInputAccount: boolean = false, quote: SwapCompute = null): Promise<boolean> {
  const slippage = parameters.slippage;
  const txVersion: string = 'V0'; // or LEGACY
  const isV0Tx = txVersion === 'V0';

  const [isInputSol, isOutputSol] = [inputMint == NATIVE_MINT.toBase58(), outputMint == NATIVE_MINT.toBase58()];

  const inputTokenAcc = getAssociatedTokenAddress(new PublicKey(inputMint), keypair.publicKey);
  const outputTokenAcc = getAssociatedTokenAddress(new PublicKey(outputMint), keypair.publicKey);
  console.log(`inputTokenAcc: ${inputTokenAcc.toBase58()}, outputTokenAcc: ${outputTokenAcc.toBase58()}`)

  if (!inputTokenAcc && !isInputSol) {
    console.error('do not have input token account')
    return false;
  }

  // get statistical transaction fee from api
  /**
   * vh: very high
   * h: high
   * m: medium
   */
  const { data } = await axios.get<{
    id: string
    success: boolean
    data: { default: { vh: number; h: number; m: number } }
  }>(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`)

  let quoteResponse = quote;
  if (!quoteResponse) {
    quoteResponse = await getQuote(inputMint, outputMint, amount, slippage, txVersion);
    if (!quoteResponse) {
      return false;
    }
  }

  const { data: swapTransactions } = await axios.post<{
    id: string
    version: string
    success: boolean
    data: { transaction: string }[]
  }>(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
    computeUnitPriceMicroLamports: String(data.data.default.h),
    swapResponse: quoteResponse,
    txVersion,
    wallet: keypair.publicKey.toBase58(),
    wrapSol: isInputSol,
    unwrapSol: isOutputSol, // true means output mint receive sol, false means output mint received wsol
    inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
    outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58()
  })
  if (!swapTransactions.success) {
    console.error('swapTransactions failed');
    return false;
  }

  const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'));
  const allTransactions = allTxBuf.map((txBuf) =>
    isV0Tx ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf)
  );

  console.log(`total ${allTransactions.length} transactions`, swapTransactions)

  let idx = 0
  if (!isV0Tx) {
    for (const tx of allTransactions) {
      console.log(`${++idx} transaction sending...`)
      const transaction = tx as Transaction;
      if (!isInputSol && closeInputAccount) {
        const closeTokenAccountIx = createCloseAccountInstruction(
          inputTokenAcc,
          keypair.publicKey,
          keypair.publicKey
        );
        transaction.add(closeTokenAccountIx);
      }
      transaction.sign(keypair);
      // const simulation = await connection.simulateTransaction(transaction);
      // if (simulation.value.err) {
      //   console.log(`simulation error`, simulation.value.err);
      //   return false;
      // }
      const txId = await sendAndConfirmTransaction(connection, transaction, [keypair], { skipPreflight: false, preflightCommitment: 'confirmed' });
      console.log(`${++idx} transaction confirmed, txId: ${txId}`);
    }
    return true;
  } else {
    for (let tx of allTransactions) {
      idx++;
      const transaction = tx as VersionedTransaction;
      if (!isInputSol && closeInputAccount) {
        const addressLookupTableAccounts = await Promise.all(
          transaction.message.addressTableLookups.map(async (lookup) => {
            return new AddressLookupTableAccount({
              key: lookup.accountKey,
              state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => res.data)),
            })
          }))
        var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts });
        const closeTokenAccountIx = createCloseAccountInstruction(
          inputTokenAcc,
          keypair.publicKey,
          keypair.publicKey
        );
        message.instructions.push(closeTokenAccountIx);
        transaction.message = message.compileToV0Message();
      }
      transaction.sign([keypair]);
      // const simulation = await connection.simulateTransaction(transaction, { innerInstructions: true, sigVerify: true });
      // console.log(`simulation result`, simulation.value);
      // if (simulation.value.err) {
      //   console.log(`simulation error`, simulation.value.err);
      //   return false;
      // }
      const txId = await connection.sendTransaction(transaction, { skipPreflight: false, preflightCommitment: 'confirmed' });
      const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash({
        commitment: 'finalized',
      });
      console.log(`${idx} transaction sending..., txId: ${txId}`);
      await connection.confirmTransaction(
        {
          blockhash,
          lastValidBlockHeight,
          signature: txId,
        },
        'confirmed'
      );
      console.log(`${idx} transaction confirmed`);
    }
    return true;
  }
}

async function applyStrategy(token: string) {
  const balance = await getPortfolioBalance();
  const amountInLamports = Math.floor(balance * parameters.portfolio_percentage);
  try {
    const amountInSol = amountInLamports / 1_000_000_000;
    console.log(`Swapping ${amountInLamports} lamports (${amountInSol} SOL) to ${token}`);
    const swapSuccess = await swap(NATIVE_MINT.toBase58(), token, amountInLamports, true);
    if (!swapSuccess) {
      console.error(`Error during swap: ${token}`);
      return;
    }
    const tokenBalance = await connection.getTokenAccountBalance(getAssociatedTokenAddress(new PublicKey(token), keypair.publicKey), "confirmed");
    const tokenSymbol = await getTokenMetadataSymbol(token);

    console.log(`Bought ${tokenBalance.value.uiAmount} tokens of ${tokenSymbol}`);

    const initialPrice = amountInSol / tokenBalance.value.uiAmount;
    console.log(`Initial price: ${initialPrice} lamports per token`);

    let sellRetries = 0;
    let newQuoteRetries = 0;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const newQuote = await getQuote(token, NATIVE_MINT.toBase58(), Number(tokenBalance.value.amount), parameters.slippage, 'V0');
      if (!newQuote) {
        console.error(`Error fetching quote for token: ${token}`);
        newQuoteRetries++;
        if (newQuoteRetries > 5) {
          break;
        }
        continue;
      }
      const outputAmount = Number(newQuote.data.outputAmount);

      // log current price and the current loss/gain percentage
      const currentPrice = (outputAmount / 1_000_000_000) / tokenBalance.value.uiAmount;
      const gainLossPercentage = ((currentPrice - initialPrice) / initialPrice) * 100;
      console.log(`Current price: ${currentPrice} lamports per token. Gain/Loss: ${gainLossPercentage.toFixed(2)}% (${new Date().toISOString()})`);

      // compare amountInLamports with outputAmount considering takeProfit
      const takeProfit = amountInLamports * (1 + parameters.takeProfit);
      const stopLoss = amountInLamports * (1 - parameters.stopLoss);
      if (outputAmount >= takeProfit || outputAmount <= stopLoss) {
        if (outputAmount <= stopLoss) {
          console.log("STOP LOSS");
        } else {
          console.log("TAKE PROFIT");
        }
        console.log(`Selling ${tokenBalance.value.uiAmount} tokens of ${tokenSymbol} for ${outputAmount} lamports (${outputAmount / 1_000_000_000} SOL)`);
        const sellSuccess = await swap(token, NATIVE_MINT.toBase58(), Number(tokenBalance.value.amount), true, newQuote);
        
        if (!sellSuccess) {
          sellRetries++;
          console.error(`Error during swap: ${token}`);
          if (sellRetries > 5) {
            break;
          }
          continue;
        }
        break;
      }
    }
  } catch (e) {
    console.error(`Error during swap: ${e}`);
  }
}

async function newPairAnalysis(token: string, lamportsReserves: number): Promise<boolean> {
  console.log(`Token: ${token}`);
  console.log(`Reserves: ${lamportsReserves / 1_000_000_000} SOL`);

  if (parameters.pump_analysis_enabled && token.endsWith("pump")) {
    console.log(`Discarding token: ${token} (ends with "pump")`);
    return false;
  }

  const liquidity = await calculateLiquidity(lamportsReserves);
  console.log(`Liquidity: ${liquidity} USD`);

  if (liquidity < parameters.min_liquidity) {
    console.log(`Liquidity is below minimum threshold: ${parameters.min_liquidity} USD`);
    return false;
  }

  const passedRugTest = await rugCheck(token);
  if (!passedRugTest) {
    console.log(`Rug check failed for token: ${token}`);
    return false;
  }

  return true;
}

async function solanaStreamingNewPairs() {
  const connect = function () {
    const ws = new WebSocket(SOLANA_STREAMING_WS_URL, {
      headers: {
        'X-API-KEY': SOLANA_STREAMING_API_KEY
      }
    });

    ws.on('open', () => {
      console.log('WebSocket connection opened.');
      const subscribeMessage = JSON.stringify({
        id: 1,
        method: 'newPairSubscribe'
      });
      ws.send(subscribeMessage);
    });

    ws.on('message', async (data) => {
      const message = JSON.parse(data.toString());
      if (message.method === 'newPairNotification') {
        const params = message.params;
        const pair = params.pair;
        const baseToken = pair.baseToken;
        const quoteToken = pair.quoteToken;

        const localTime = new Date();
        console.log(`Local Time: ${localTime.getTime()}`);
        if (pair.sourceExchange !== 'raydium') {
          console.log(`Source exchange is not Raydium: ${pair.sourceExchange}`);
          return;
        }

        const token = baseToken.account === NATIVE_MINT.toBase58() ? quoteToken.account : baseToken.account;
        const lamportsReserves = baseToken.account === NATIVE_MINT.toBase58() ? pair.baseTokenLiquidityAdded : pair.quoteTokenLiquidityAdded;

        console.log(`\nNew pool notification received:`);
        console.log(`Pool Address: ${pair.ammAccount}`);

        const analysisResult = await newPairAnalysis(token, lamportsReserves);
        if (analysisResult) {
          console.log(`Buying token: ${token}`);
          await applyStrategy(token);
        }
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed, trying to reconnect...');
      setTimeout(connect, 5 * 1000); // retry connecting in 5 seconds
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error: ${error.message}`);
    });
  };
  connect();
}

async function bloxrouteNewPairs() {
  let isLocked = false;
  const connect = function () {
    const ws = new WebSocket(BLOXROUTE_WS_URL, {
      headers: {
        'Authorization': BLOXROUTE_AUTH
      }
    });

    ws.on('open', () => {
      console.log('WebSocket connection opened.');
      const subscribeMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'subscribe',
        params: ['GetNewRaydiumPoolsStream', { includeCPMM: true }]
      });
      ws.send(subscribeMessage);
    });

    ws.on('message', async (data) => {
      const message = JSON.parse(data.toString());
      if (message.method === 'subscribe' && !isLocked) {
        isLocked = true;
        const params = message.params;
        const result = params.result;
        const pool = result.pool;

        if (pool.poolType === 'standard') {
          const token = pool.token1MintAddress === NATIVE_MINT.toBase58() ? pool.token2MintAddress : pool.token1MintAddress;
          const lamportsReserves = pool.token1MintAddress === NATIVE_MINT.toBase58() ? pool.token1Reserves : pool.token2Reserves;
          
          const currentTime = new Date();
          console.log(`\nNew pool notification received`);
          console.log(`Current Time: ${currentTime.toISOString()}`);
          console.log(`Pool Address: ${pool.poolAddress}`);
  
          const analysisResult = await newPairAnalysis(token, lamportsReserves);
          if (analysisResult) {
            console.log(`Buying token: ${token}`);
            await applyStrategy(token);
          }
          isLocked = false;
        }
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed, trying to reconnect...');
      setTimeout(connect, 5 * 1000); // retry connecting in 5 seconds
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error: ${error.message}`);
    });
  };
  connect();
}

(async () => {
  // const token = "ycF7Dnfq8G1FzUXpBq4nmzkz3NJV3kUMhv7KJyzpump";
  // const tokenBalance = await connection.getTokenAccountBalance(getAssociatedTokenAddress(new PublicKey(token), keypair.publicKey), "finalized");
  // console.log(`Selling ${tokenBalance.value.uiAmount} tokens of ${token}`);
  // const swapSuccess = await swap(token, NATIVE_MINT.toBase58(), Number(tokenBalance.value.amount), true);
  // if (!swapSuccess) {
  //   console.error(`Error during swap: ${token}`);
  //   return;
  // }
  // await newPairAnalysis("J8pWMtEfGayHBo565ZGRUWxFbHyjqNL7nrfT6eN5bzLQ", "AeBLk27VFF88WrH57C7WkQdGfaZfy74x8K2snoa6pump", 0, 0);
  await bloxrouteNewPairs();
  // await solanaStreamingNewPairs();
  // await startConnection(connection, RAYDIUM, INSTRUCTION_NAME).catch(console.error);
})();
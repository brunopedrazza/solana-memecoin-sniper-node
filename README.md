# Solana Memecoin Sniper

This project is a Solana-based application designed to monitor and trade new token pairs on decentralized exchanges. It leverages various APIs and WebSocket connections to fetch real-time data and execute trading strategies.

## Getting Started

### Prerequisites

- Node.js
- npm or yarn

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/brunopedrazza/solana-memecoin-sniper-node.git
   cd solana-memecoin-sniper-node
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Create a `.env` file based on the `.env.example` file and fill in the required environment variables:

   ```sh
   cp .env.example .env
   ```

### Environment Variables

- `PRIVATE_KEY`: Your private key for the Solana wallet.
- `HTTP_URL`: The HTTP URL for the Solana RPC endpoint.
- `WSS_URL`: The WebSocket URL for the Solana RPC endpoint.
- `COINMARKETCAP_API_KEY`: Your API key for CoinMarketCap.
- `SOLANA_STREAMING_API_KEY`: Your API key for Solana Streaming.
- `BLOXROUTE`: Your authorization token for Bloxroute.
- `HELIUS_API_KEY`: Your API key for Helius.

### Running the Project

To build and start the project, run:

```sh
npm run start
```

## Parameters

### `portfolioPercentage`

- **Type**: `number`
- **Default**: `0.1`
- **Description**: Default 10% of total portfolio per trade.

### `minLiquidity`

- **Type**: `number`
- **Default**: `100000`
- **Description**: Minimum liquidity in USD.

### `slippage`

- **Type**: `number`
- **Default**: `20`
- **Description**: Maximum slippage tolerance in percentage.

### `takeProfit`

- **Type**: `number`
- **Default**: `0.15`
- **Description**: Take profit percentage.

### `stopLoss`

- **Type**: `number`
- **Default**: `0.3`
- **Description**: Stop loss percentage.

### `rugcheckEnabled`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable or disable RugCheck API.

### `rugcheckMaxScore`

- **Type**: `number`
- **Default**: `1000`
- **Description**: Maximum score for RugCheck API.

### `pumpAnalysisEnabled`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable or disable pump token analysis.

### `blacklistedWords`

- **Type**: `array`
- **Default**: `["trump"]`
- **Description**: List of blacklisted words.

## Project Details

### WebSocket Connections

- `bloxrouteNewPairs`: Connects to Bloxroute WebSocket to monitor new token pairs.
- `solanaStreamingNewPairs`: Connects to Solana Streaming WebSocket to monitor new token pairs.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Solana](https://solana.com/)
- [CoinMarketCap](https://coinmarketcap.com/)
- [Raydium](https://raydium.io/)
- [Helius](https://helius.dev/)
- [Bloxroute](https://bloxroute.com/)
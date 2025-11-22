# 🚀 KALYPT - Solana Pump.Fun Bundler Bot

Advanced Telegram bot for automated token creation, multi-wallet bundling, and launch orchestration on Pump.Fun.

## 🎯 Features

### Core Functionality
- 🤖 **Telegram Bot Interface** - User-friendly command-based interface
- 📂 **Project Management** - Create and manage multiple token projects
- 💼 **Wallet Manager** - Generate, import, and encrypt wallets
- 💰 **SOL Disperser** - Normal and Hard Disperse modes (anti-BubbleMaps)
- 🔥 **Wallet Warmup** - Generate realistic transaction history
- 🪙 **Token Deploy** - Create tokens on Pump.Fun
- 📦 **Jito Bundles** - Atomic multi-wallet execution
- 🔄 **Swap Manager** - Advanced buy/sell coordination
- 🎯 **Smart Sell** - Automated reactive selling with whitelist
- 📈 **Auto Take Profit** - Market cap based exits
- 🚀 **4 Launch Modes** - Basic, Bundle, Snipe, Bundle+Snipe

### Launch Modes
1. **Launch** - Standard token creation with dev buy
2. **Launch + Bundle** - Create token + atomic multi-wallet buys
3. **Launch + Snipe** - Create token + snipe with multiple wallets
4. **Launch + Bundle + Snipe** - Combined approach (recommended)

### Security
- 🔐 AES-GCM encryption for private keys
- 🛡️ MFA for critical operations
- 📊 Detailed transaction logging
- ⚡ Rate limiting and validations

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **PostgreSQL** >= 14.0
- **Redis** >= 6.0
- **Telegram Bot Token** (from @BotFather)
- **Solana Mainnet RPC** (Helius/QuickNode recommended)

## 🛠️ Installation

### 1. Clone Repository
```bash
git clone <repository-url>
cd KALYPT
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database

**PostgreSQL:**
```sql
CREATE DATABASE kalypt_bundler;
```

**Redis:**
```bash
# Should be running on localhost:6379
redis-cli ping  # Should return PONG
```

### 4. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required variables:**
```env
# Solana
SOLANA_RPC_URL=https://your-helius-or-quicknode-url
SOLANA_WS_URL=wss://your-websocket-url

# Wallets
MAIN_WALLET_PRIVATE_KEY=your_main_wallet_key_base58
FUNDER_WALLET_PRIVATE_KEY=your_funder_wallet_key_base58
ENCRYPTION_PASSWORD=your_strong_password_min_32_chars

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_ADMIN_IDS=your_telegram_user_id

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/kalypt_bundler
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 5. Run Migrations
```bash
npm run db:migrate
```

### 6. Start Bot
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 🎮 Usage

### Bot Commands

**Main Menu:**
- `/start` - Start the bot
- `/home` - Main menu
- `/help` - Show help

**Project Management:**
- `/projects` - List all projects
- `/new` - Create new project
- `/select` - Select active project

**Settings:**
- `/settings` - Configure bot settings
- `/presets` - Manage launch presets

### Typical Workflow

1. **Create Project**
   - Set metadata (name, ticker, image)
   - Upload token image
   - Add social links

2. **Setup Wallets**
   - Generate wallets (1 dev + N bundle wallets)
   - Hard Disperse SOL with range
   - Optional: Warmup wallets

3. **Configure Launch**
   - Choose launch mode
   - Set buy amounts
   - Configure sniper settings (if applicable)
   - Set Jito tip

4. **Launch Token**
   - Review settings
   - Confirm launch
   - Monitor execution

5. **Manage Position**
   - Use Swap Manager for additional buys
   - Enable Smart Sell for protection
   - Set Auto TP targets
   - Execute sells when ready

## ⚙️ Configuration

### Jito Settings (in bot /settings)
- Max Tip: 0.01 SOL (default)
- Priority Fee: 0.0005 SOL
- Auto Tip: Enabled
- Safe Settings: Enabled

### Trading Settings
- Buy Slippage: 15%
- Sell Slippage: 15%
- Max Bundle Wallets: 100

### Smart Sell
- Sell % on Buy: 0-100%
- Stop Holding %: Threshold to stop selling
- Min SOL Activate: Minimum buy to trigger
- Min MCAP Activate: Minimum market cap

## 📊 Features Roadmap

- ✅ Project Management
- ✅ Wallet Manager with encryption
- ✅ SOL Disperser (Normal + Hard)
- ✅ Token Deploy
- ✅ Jito Bundles
- ✅ Launch Modes (4 types)
- ✅ Swap Manager
- ✅ Smart Sell
- ✅ Auto Take Profit
- 🚧 Wallet Warmup
- 🚧 Market Maker
- 🚧 Advanced Analytics
- 🚧 Web Dashboard

## 🔒 Security Best Practices

1. **Never commit `.env` file** to git
2. **Use strong encryption password** (32+ characters)
3. **Enable MFA** for your Telegram account
4. **Use dedicated wallets** for bot operations
5. **Keep private keys encrypted** in database
6. **Regular backups** of database and keys
7. **Use premium RPC** to avoid rate limits

## 📚 Documentation

Detailed documentation for each module:
- [Wallet Manager](docs/wallet-manager.md)
- [SOL Disperser](docs/sol-disperser.md)
- [Bundle System](docs/bundle-system.md)
- [Swap Manager](docs/swap-manager.md)
- [Smart Sell](docs/smart-sell.md)
- [Launch Modes](docs/launch-modes.md)

## 🐛 Troubleshooting

### Common Issues

**Database Connection Error:**
```bash
# Check PostgreSQL is running
pg_isready

# Check connection
psql -U postgres -d kalypt_bundler
```

**Redis Connection Error:**
```bash
# Check Redis is running
redis-cli ping
```

**Transaction Failures:**
- Verify RPC endpoint is working
- Check wallet has sufficient SOL
- Increase Jito tip during congestion
- Use premium RPC provider

## 📞 Support

For issues, questions, or feature requests:
- Create an issue in the repository
- Contact via Telegram: @your_telegram

## ⚠️ Disclaimer

This software is for educational purposes. Users are responsible for:
- Compliance with local regulations
- Proper tax reporting
- Understanding cryptocurrency risks
- Securing private keys and funds

**Use at your own risk.**

## 📄 License

MIT License - see LICENSE file for details

---

Built with ❤️ for the Solana community